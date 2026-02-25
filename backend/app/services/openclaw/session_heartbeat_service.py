"""Background service for syncing agent heartbeats from OpenClaw gateway.

This service polls the OpenClaw gateway sessions API and updates agent status
in Mission Control based on active sessions.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from sqlmodel import col, select

from app.core.time import utcnow
from app.models.agents import Agent
from app.models.gateways import Gateway
from app.services.openclaw.constants import OFFLINE_AFTER
from app.services.openclaw.gateway_rpc import (
    GatewayConfig,
    OpenClawGatewayError,
    openclaw_call,
)
from app.services.openclaw.shared import GatewayAgentIdentity

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# Default poll interval
DEFAULT_POLL_INTERVAL_SECONDS = 60.0
# Grace period for considering an agent offline
OFFLINE_GRACE_PERIOD = timedelta(minutes=5)


@dataclass
class SessionInfo:
    """Information about an OpenClaw session."""

    session_key: str
    label: str | None = None
    active: bool = True
    last_activity: str | None = None
    model: str | None = None
    provider: str | None = None


@dataclass
class SyncResult:
    """Result of a heartbeat sync operation."""

    total_agents: int = 0
    updated_online: int = 0
    updated_offline: int = 0
    updated_provisioning: int = 0
    errors: int = 0
    gateway_errors: int = 0


class SessionHeartbeatService:
    """
    Service that polls OpenClaw gateway sessions and syncs agent status.

    This provides a fallback/redundant mechanism for status updates when
    event-based listeners are not available or miss events.
    """

    def __init__(
        self,
        session_factory: callable,
        poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    ) -> None:
        self.session_factory = session_factory
        self.poll_interval = poll_interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the background polling task."""
        if self._running:
            logger.warning("session_heartbeat_service.already_running")
            return

        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info(
            "session_heartbeat_service.started poll_interval_seconds=%s",
            self.poll_interval,
        )

    async def stop(self) -> None:
        """Stop the background polling task."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("session_heartbeat_service.stopped")

    async def _poll_loop(self) -> None:
        """Main polling loop."""
        while self._running:
            try:
                result = await self.sync_all_gateways()
                logger.debug(
                    "session_heartbeat_service.poll_complete "
                    "total=%d online=%d offline=%d errors=%d",
                    result.total_agents,
                    result.updated_online,
                    result.updated_offline,
                    result.errors,
                )
            except Exception as exc:
                logger.error(
                    "session_heartbeat_service.poll_error error=%s",
                    str(exc),
                )

            await asyncio.sleep(self.poll_interval)

    async def sync_all_gateways(self) -> SyncResult:
        """Sync agent status for all gateways."""
        result = SyncResult()

        async with self.session_factory() as session:
            # Get all gateways
            gateways_result = await session.exec(select(Gateway))
            gateways = gateways_result.all()

            for gateway in gateways:
                if not gateway.url:
                    continue

                # Skip gateways with internal/inaccessible URLs
                if "railway.internal" in gateway.url:
                    logger.debug("Skipping gateway with internal URL: %s", gateway.url)
                    continue

                try:
                    gateway_result = await self._sync_gateway_sessions(gateway, session)
                    result.total_agents += gateway_result.total_agents
                    result.updated_online += gateway_result.updated_online
                    result.updated_offline += gateway_result.updated_offline
                    result.updated_provisioning += gateway_result.updated_provisioning
                except OpenClawGatewayError as exc:
                    logger.warning(
                        "session_heartbeat_service.gateway_error gateway_id=%s error=%s",
                        gateway.id,
                        str(exc),
                    )
                    result.gateway_errors += 1
                except Exception as exc:
                    logger.error(
                        "session_heartbeat_service.sync_error gateway_id=%s error=%s",
                        gateway.id,
                        str(exc),
                    )
                    result.errors += 1

        return result

    async def _sync_gateway_sessions(self, gateway: Gateway, session: AsyncSession) -> SyncResult:
        """Sync agent status for a specific gateway."""
        result = SyncResult()

        # Fetch active sessions from gateway
        config = GatewayConfig(
            url=gateway.url,
            token=gateway.token,
            allow_insecure_tls=gateway.allow_insecure_tls,
            disable_device_pairing=True,
        )

        try:
            sessions_data = await openclaw_call("sessions.list", {}, config=config)
        except OpenClawGatewayError:
            # Gateway unreachable - mark all agents for this gateway as potentially offline
            logger.warning(
                "session_heartbeat_service.gateway_unreachable gateway_id=%s",
                gateway.id,
            )
            # Don't immediately mark offline - just skip this cycle
            raise

        if not isinstance(sessions_data, list):
            sessions_data = []

        # Build set of active session keys
        active_sessions: dict[str, SessionInfo] = {}
        for session_data in sessions_data:
            if isinstance(session_data, dict):
                session_key = session_data.get("key")
                if session_key:
                    active_sessions[str(session_key)] = SessionInfo(
                        session_key=str(session_key),
                        label=session_data.get("label"),
                        active=session_data.get("active", True),
                        last_activity=session_data.get("lastActivity"),
                    )

        # Get all agents for this gateway
        agents = await Agent.objects.filter_by(gateway_id=gateway.id).all(session)
        result.total_agents = len(agents)

        now = utcnow()

        for agent in agents:
            old_status = agent.status
            new_status = old_status

            # Check if agent has an active session
            session_key = agent.openclaw_session_id
            if session_key and session_key in active_sessions:
                # Agent has an active session
                session_info = active_sessions[session_key]
                if session_info.active:
                    new_status = "online"
                    agent.last_seen_at = now
            else:
                # No active session - check if offline
                if agent.last_seen_at:
                    if now - agent.last_seen_at > OFFLINE_AFTER:
                        new_status = "offline"
                else:
                    # Never seen - keep as provisioning or mark offline if old
                    if agent.status != "provisioning":
                        new_status = "offline"

            # Update agent if status changed
            if new_status != old_status:
                agent.status = new_status
                agent.updated_at = now
                session.add(agent)

                if new_status == "online":
                    result.updated_online += 1
                elif new_status == "offline":
                    result.updated_offline += 1
                elif new_status == "provisioning":
                    result.updated_provisioning += 1

                logger.info(
                    "session_heartbeat_service.agent_status_updated "
                    "agent_id=%s agent_name=%s old_status=%s new_status=%s",
                    agent.id,
                    agent.name,
                    old_status,
                    new_status,
                )

        await session.commit()

        # Also update gateway main agent
        main_session_key = GatewayAgentIdentity.session_key(gateway)
        if main_session_key:
            main_agent = await Agent.objects.filter_by(
                gateway_id=gateway.id,
                board_id=None,
            ).first(session)

            if main_agent:
                old_status = main_agent.status
                has_active_session = main_session_key in active_sessions

                if has_active_session:
                    new_status = "online"
                    main_agent.last_seen_at = now
                elif main_agent.last_seen_at and now - main_agent.last_seen_at > OFFLINE_AFTER:
                    new_status = "offline"
                else:
                    new_status = "provisioning"

                if new_status != old_status:
                    main_agent.status = new_status
                    main_agent.updated_at = now
                    session.add(main_agent)
                    await session.commit()

                    logger.info(
                        "session_heartbeat_service.main_agent_updated "
                        "gateway_id=%s agent_name=%s old_status=%s new_status=%s",
                        gateway.id,
                        main_agent.name,
                        old_status,
                        new_status,
                    )

        return result

    async def get_active_session_keys(self, gateway: Gateway) -> set[str]:
        """Get the set of active session keys from a gateway."""
        config = GatewayConfig(
            url=gateway.url,
            token=gateway.token,
            allow_insecure_tls=gateway.allow_insecure_tls,
            disable_device_pairing=True,
        )

        try:
            sessions_data = await openclaw_call("sessions.list", {}, config=config)
        except OpenClawGatewayError:
            return set()

        if not isinstance(sessions_data, list):
            return set()

        return {
            str(s.get("key"))
            for s in sessions_data
            if isinstance(s, dict) and s.get("key")
        }

    async def sync_single_agent(self, agent: Agent) -> bool:
        """
        Sync status for a single agent.
        Returns True if status was updated.
        """
        if not agent.openclaw_session_id:
            return False

        gateway = await Gateway.objects.by_id(agent.gateway_id).first(self.session)
        if not gateway or not gateway.url:
            return False

        config = GatewayConfig(
            url=gateway.url,
            token=gateway.token,
            allow_insecure_tls=gateway.allow_insecure_tls,
            disable_device_pairing=True,
        )

        try:
            # Get session preview
            session_data = await openclaw_call(
                "sessions.preview",
                {"key": agent.openclaw_session_id},
                config=config,
            )
        except OpenClawGatewayError:
            # Session doesn't exist or error
            session_data = None

        now = utcnow()
        old_status = agent.status
        new_status = old_status

        if session_data and isinstance(session_data, dict):
            # Session exists
            if session_data.get("active", True):
                new_status = "online"
                agent.last_seen_at = now
        else:
            # Session doesn't exist
            if agent.last_seen_at and now - agent.last_seen_at > OFFLINE_AFTER:
                new_status = "offline"

        if new_status != old_status:
            agent.status = new_status
            agent.updated_at = now
            self.session.add(agent)
            await self.session.commit()

            logger.info(
                "session_heartbeat_service.single_agent_updated "
                "agent_id=%s old_status=%s new_status=%s",
                agent.id,
                old_status,
                new_status,
            )
            return True

        return False


# Global service instance (initialized at startup)
_service_instance: SessionHeartbeatService | None = None


def get_heartbeat_service(
    session_factory: callable,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
) -> SessionHeartbeatService:
    """Get or create the heartbeat service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = SessionHeartbeatService(session_factory, poll_interval_seconds)
    return _service_instance


async def start_heartbeat_service(
    session_factory: callable,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
) -> SessionHeartbeatService:
    """Initialize and start the global heartbeat service."""
    service = get_heartbeat_service(session_factory, poll_interval_seconds)
    if not service._running:
        await service.start()
    return service


async def stop_heartbeat_service() -> None:
    """Stop the global heartbeat service."""
    global _service_instance
    if _service_instance:
        await _service_instance.stop()