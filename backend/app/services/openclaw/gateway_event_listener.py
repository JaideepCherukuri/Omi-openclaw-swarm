"""Gateway WebSocket event listener for agent session lifecycle.

This service connects to the OpenClaw gateway WebSocket and listens for
session lifecycle events (start, end, heartbeat) to automatically update
agent status in Mission Control.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlmodel import col, select

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.agents import Agent
from app.models.gateways import Gateway
from app.services.activity_log import record_activity

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.services.openclaw.gateway_rpc import GatewayConfig

logger = get_logger(__name__)

# Event types from gateway
SESSION_STARTED_EVENT = "session.started"
SESSION_ENDED_EVENT = "session.ended"
AGENT_HEARTBEAT_EVENT = "agent.heartbeat"
PRESENCE_EVENT = "presence"


@dataclass
class SessionEvent:
    """Represents a session lifecycle event from the gateway."""

    event_type: str
    session_key: str
    agent_name: str | None = None
    timestamp: datetime = field(default_factory=utcnow)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class GatewayEventListenerConfig:
    """Configuration for the gateway event listener."""

    gateway_url: str
    gateway_token: str | None = None
    allow_insecure_tls: bool = False
    reconnect_delay_seconds: float = 5.0
    max_reconnect_delay_seconds: float = 60.0
    heartbeat_interval_seconds: float = 30.0
    session_timeout_seconds: float = 600.0  # 10 minutes without activity


class GatewayEventListener:
    """Listens for gateway WebSocket events and dispatches them to handlers."""

    def __init__(self, config: GatewayEventListenerConfig) -> None:
        self.config = config
        self._running = False
        self._ws: Any = None
        self._reconnect_delay = config.reconnect_delay_seconds

    async def start(self) -> None:
        """Start the listener and connect to the gateway."""
        self._running = True
        logger.info(
            "gateway.event_listener.starting url=%s",
            self.config.gateway_url,
        )
        while self._running:
            try:
                await self._connect_and_listen()
            except Exception as exc:
                logger.error(
                    "gateway.event_listener.connection_failed error=%s",
                    str(exc),
                )
                if self._running:
                    await asyncio.sleep(self._reconnect_delay)
                    self._reconnect_delay = min(
                        self._reconnect_delay * 2,
                        self.config.max_reconnect_delay_seconds,
                    )

    async def stop(self) -> None:
        """Stop the listener."""
        self._running = False
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
        logger.info("gateway.event_listener.stopped")

    async def _connect_and_listen(self) -> None:
        """Connect to gateway and process events."""
        import websockets
        from websockets.exceptions import WebSocketException

        from app.services.openclaw.gateway_rpc import (
            GATEWAY_OPERATOR_SCOPES,
            PROTOCOL_VERSION,
            _build_control_ui_origin,
            _create_ssl_context,
        )

        url = self.config.gateway_url
        if self.config.gateway_token:
            url = f"{url}?token={self.config.gateway_token}"

        ssl_context = _create_ssl_context(
            type("Config", (), {"url": self.config.gateway_url, "allow_insecure_tls": self.config.allow_insecure_tls})()
        )
        origin = _build_control_ui_origin(self.config.gateway_url)

        connect_kwargs: dict[str, Any] = {"ping_interval": None}
        if origin:
            connect_kwargs["origin"] = origin

        async with websockets.connect(
            self.config.gateway_url,
            ssl=ssl_context,
            **connect_kwargs,
        ) as ws:
            self._ws = ws
            self._reconnect_delay = self.config.reconnect_delay_seconds

            # Send connect message
            connect_params = {
                "minProtocol": PROTOCOL_VERSION,
                "maxProtocol": PROTOCOL_VERSION,
                "role": "operator",
                "scopes": list(GATEWAY_OPERATOR_SCOPES),
                "client": {
                    "id": "mc-backend-event-listener",
                    "version": "1.0.0",
                    "platform": "python",
                    "mode": "backend",
                },
            }
            if self.config.gateway_token:
                connect_params["auth"] = {"token": self.config.gateway_token}

            import uuid
            connect_id = str(uuid.uuid4())
            await ws.send(json.dumps({
                "type": "req",
                "id": connect_id,
                "method": "connect",
                "params": connect_params,
            }))

            logger.info("gateway.event_listener.connected url=%s", self.config.gateway_url)

            async for raw_message in ws:
                if not self._running:
                    break
                try:
                    await self._handle_message(raw_message)
                except Exception as exc:
                    logger.error(
                        "gateway.event_listener.message_error error=%s",
                        str(exc),
                    )

    async def _handle_message(self, raw_message: str | bytes) -> None:
        """Parse and handle a gateway message."""
        if isinstance(raw_message, bytes):
            raw_message = raw_message.decode("utf-8")

        data = json.loads(raw_message)
        msg_type = data.get("type")
        event = data.get("event")

        # Handle events
        if msg_type == "event":
            await self._process_event(event, data.get("payload", {}))

    async def _process_event(self, event: str, payload: dict[str, Any]) -> None:
        """Process a gateway event."""
        logger.debug(
            "gateway.event_listener.event_received event=%s",
            event,
        )

        if event == PRESENCE_EVENT:
            # Presence events contain session status updates
            await self._handle_presence_event(payload)
        elif event == AGENT_HEARTBEAT_EVENT:
            await self._handle_agent_heartbeat(payload)
        elif event in (SESSION_STARTED_EVENT, SESSION_ENDED_EVENT):
            await self._handle_session_lifecycle(event, payload)

    async def _handle_presence_event(self, payload: dict[str, Any]) -> None:
        """Handle presence events from the gateway."""
        # Presence events contain info about active sessions
        sessions = payload.get("sessions", [])
        for session in sessions:
            session_key = session.get("key")
            if session_key:
                # Queue for processing
                logger.debug(
                    "gateway.event_listener.presence session_key=%s active=%s",
                    session_key,
                    session.get("active", True),
                )

    async def _handle_agent_heartbeat(self, payload: dict[str, Any]) -> None:
        """Handle agent heartbeat events."""
        session_key = payload.get("sessionKey")
        status = payload.get("status", "healthy")
        logger.debug(
            "gateway.event_listener.heartbeat session_key=%s status=%s",
            session_key,
            status,
        )

    async def _handle_session_lifecycle(
        self,
        event: str,
        payload: dict[str, Any],
    ) -> None:
        """Handle session start/end events."""
        session_key = payload.get("sessionKey")
        agent_name = payload.get("agentName")
        logger.info(
            "gateway.event_listener.session_lifecycle event=%s session_key=%s agent_name=%s",
            event,
            session_key,
            agent_name,
        )


class AgentSessionManager:
    """Manages agent session state updates based on gateway events."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._session_cache: dict[str, UUID] = {}

    async def process_session_event(
        self,
        event: SessionEvent,
    ) -> Agent | None:
        """Process a session event and update agent status."""
        agent = await self._find_agent_by_session_key(event.session_key)
        if not agent:
            logger.warning(
                "agent.session_manager.agent_not_found session_key=%s",
                event.session_key,
            )
            return None

        now = utcnow()

        if event.event_type == SESSION_STARTED_EVENT:
            agent.status = "online"
            agent.last_seen_at = now
            agent.updated_at = now
            self.session.add(agent)
            record_activity(
                self.session,
                event_type="agent.session.started",
                message=f"Agent {agent.name} session started.",
                agent_id=agent.id,
            )

        elif event.event_type == SESSION_ENDED_EVENT:
            agent.status = "offline"
            agent.updated_at = now
            self.session.add(agent)
            record_activity(
                self.session,
                event_type="agent.session.ended",
                message=f"Agent {agent.name} session ended.",
                agent_id=agent.id,
            )

        elif event.event_type == AGENT_HEARTBEAT_EVENT:
            agent.last_seen_at = now
            agent.updated_at = now
            if agent.status == "provisioning":
                agent.status = "online"
            self.session.add(agent)

        await self.session.commit()
        await self.session.refresh(agent)

        logger.info(
            "agent.session_manager.updated agent_id=%s session_key=%s status=%s",
            agent.id,
            event.session_key,
            agent.status,
        )

        return agent

    async def _find_agent_by_session_key(self, session_key: str) -> Agent | None:
        """Find an agent by its OpenClaw session key."""
        # Check cache first
        if session_key in self._session_cache:
            agent_id = self._session_cache[session_key]
            agent = await Agent.objects.by_id(agent_id).first(self.session)
            if agent:
                return agent
            # Cache miss, remove stale entry
            del self._session_cache[session_key]

        # Query by session_key
        agent = await Agent.objects.filter_by(
            openclaw_session_id=session_key,
        ).first(self.session)

        if agent:
            self._session_cache[session_key] = agent.id

        return agent

    async def sync_all_agents_status(self) -> dict[str, int]:
        """
        Sync all agent statuses based on last_seen_at.
        This is useful for periodic polling when event-based updates aren't available.

        Returns stats about the sync.
        """
        from app.services.openclaw.constants import OFFLINE_AFTER

        now = utcnow()
        stats = {"online": 0, "offline": 0, "provisioning": 0, "total": 0}

        # Get all agents
        result = await self.session.exec(select(Agent))
        agents = result.all()
        stats["total"] = len(agents)

        for agent in agents:
            # Skip agents in transitional states
            if agent.status in {"deleting", "updating"}:
                continue

            # Determine actual status based on last_seen_at
            old_status = agent.status

            if agent.last_seen_at is None:
                new_status = "provisioning"
            elif now - agent.last_seen_at > OFFLINE_AFTER:
                new_status = "offline"
            else:
                new_status = "online"

            if old_status != new_status:
                agent.status = new_status
                agent.updated_at = now
                self.session.add(agent)

                logger.info(
                    "agent.session_manager.status_sync agent_id=%s old_status=%s new_status=%s",
                    agent.id,
                    old_status,
                    new_status,
                )

            if new_status in stats:
                stats[new_status] += 1

        await self.session.commit()

        logger.info(
            "agent.session_manager.sync_complete total=%d online=%d offline=%d provisioning=%d",
            stats["total"],
            stats["online"],
            stats["offline"],
            stats["provisioning"],
        )

        return stats


async def create_event_listener_for_gateway(
    gateway: Gateway,
) -> GatewayEventListener | None:
    """Create a gateway event listener for a specific gateway."""
    if not gateway.url:
        logger.warning(
            "gateway.event_listener.no_url gateway_id=%s",
            gateway.id,
        )
        return None

    config = GatewayEventListenerConfig(
        gateway_url=gateway.url,
        gateway_token=gateway.token,
        allow_insecure_tls=gateway.allow_insecure_tls,
    )

    return GatewayEventListener(config)


async def start_gateway_event_listeners(
    session: AsyncSession,
) -> list[GatewayEventListener]:
    """
    Start event listeners for all configured gateways.
    This is typically called at application startup.
    """
    result = await session.exec(select(Gateway))
    gateways = result.all()
    listeners: list[GatewayEventListener] = []

    for gateway in gateways:
        if not gateway.url:
            continue

        listener = await create_event_listener_for_gateway(gateway)
        if listener:
            listeners.append(listener)
            # Start in background
            asyncio.create_task(listener.start())

    return listeners