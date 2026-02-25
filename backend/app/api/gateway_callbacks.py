"""Gateway webhook callbacks for agent lifecycle events.

This module provides endpoints for the OpenClaw gateway to send
real-time notifications about agent session lifecycle events.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.db.session import get_session
from app.models.agents import Agent
from app.models.gateways import Gateway
from app.schemas.agents import AgentRead
from app.services.activity_log import record_activity
from app.services.openclaw.constants import OFFLINE_AFTER
from app.services.openclaw.session_heartbeat_service import (
    SessionHeartbeatService,
    get_heartbeat_service,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/gateway-callbacks", tags=["gateway-callbacks"])


class GatewaySessionEvent(BaseModel):
    """Session lifecycle event from the gateway."""

    event_type: str = Field(
        description="Type of event: session.started, session.ended, session.heartbeat",
        examples=["session.started", "session.ended", "session.heartbeat"],
    )
    session_key: str = Field(
        description="The OpenClaw session key",
        examples=["agent:mc-board-123-lead"],
    )
    agent_name: str | None = Field(
        default=None,
        description="Optional agent name",
        examples=["Board Lead Agent"],
    )
    timestamp: datetime | None = Field(
        default=None,
        description="Event timestamp (optional, defaults to now)",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Optional event metadata",
    )


class GatewayBatchHeartbeatRequest(BaseModel):
    """Batch heartbeat update from the gateway."""

    gateway_id: UUID = Field(description="Gateway ID sending the batch update")
    sessions: list[dict[str, Any]] = Field(
        description="List of active sessions with their status",
    )


class GatewayHeartbeatResponse(BaseModel):
    """Response to gateway heartbeat callbacks."""

    ok: bool = True
    updated_count: int = 0
    message: str | None = None


async def find_agent_by_session_key(
    session: AsyncSession,
    session_key: str,
) -> Agent | None:
    """Find an agent by its OpenClaw session key."""
    return await Agent.objects.filter_by(openclaw_session_id=session_key).first(session)


async def update_agent_status(
    session: AsyncSession,
    agent: Agent,
    new_status: str,
    record_event: bool = True,
) -> Agent:
    """Update an agent's status and timestamps."""
    now = utcnow()
    old_status = agent.status

    agent.status = new_status
    agent.last_seen_at = now
    agent.updated_at = now
    session.add(agent)

    if record_event and new_status != old_status:
        event_type = f"agent.status.{new_status}"
        record_activity(
            session,
            event_type=event_type,
            message=f"Agent {agent.name} status changed: {old_status} -> {new_status}",
            agent_id=agent.id,
        )

    return agent


@router.post(
    "/session-event",
    response_model=GatewayHeartbeatResponse,
    summary="Gateway Session Event",
    description="Receive a session lifecycle event from the gateway.",
)
async def handle_session_event(
    payload: GatewaySessionEvent,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> GatewayHeartbeatResponse:
    """Handle a single session lifecycle event."""
    logger.info(
        "gateway_callback.session_event event_type=%s session_key=%s",
        payload.event_type,
        payload.session_key,
    )

    agent = await find_agent_by_session_key(session, payload.session_key)
    if not agent:
        logger.warning(
            "gateway_callback.agent_not_found session_key=%s",
            payload.session_key,
        )
        return GatewayHeartbeatResponse(
            ok=True,
            updated_count=0,
            message=f"No agent found for session key: {payload.session_key}",
        )

    event_type = payload.event_type.lower()
    updated_count = 0

    if event_type in ("session.started", "agent.online"):
        await update_agent_status(session, agent, "online")
        updated_count = 1

    elif event_type in ("session.ended", "agent.offline"):
        await update_agent_status(session, agent, "offline")
        updated_count = 1

    elif event_type in ("session.heartbeat", "agent.heartbeat", "agent.active"):
        # Just update last_seen_at
        now = utcnow()
        agent.last_seen_at = now
        agent.updated_at = now
        if agent.status == "provisioning":
            agent.status = "online"
            updated_count = 1
        session.add(agent)

    elif event_type == "agent.status":
        # Generic status update
        new_status = payload.metadata.get("status", "online") if payload.metadata else "online"
        await update_agent_status(session, agent, new_status)
        updated_count = 1

    else:
        logger.warning(
            "gateway_callback.unknown_event_type event_type=%s session_key=%s",
            event_type,
            payload.session_key,
        )

    await session.commit()
    return GatewayHeartbeatResponse(
        ok=True,
        updated_count=updated_count,
    )


@router.post(
    "/batch-heartbeat",
    response_model=GatewayHeartbeatResponse,
    summary="Gateway Batch Heartbeat",
    description="Receive a batch of session status updates from the gateway.",
)
async def handle_batch_heartbeat(
    payload: GatewayBatchHeartbeatRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> GatewayHeartbeatResponse:
    """Handle a batch heartbeat update from a gateway."""
    logger.info(
        "gateway_callback.batch_heartbeat gateway_id=%s session_count=%d",
        payload.gateway_id,
        len(payload.sessions),
    )

    # Verify gateway exists
    gateway = await Gateway.objects.by_id(payload.gateway_id).first(session)
    if not gateway:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gateway not found: {payload.gateway_id}",
        )

    # Build set of active session keys
    active_sessions: dict[str, dict[str, Any]] = {}
    for sess in payload.sessions:
        session_key = sess.get("key") or sess.get("sessionKey")
        if session_key:
            active_sessions[str(session_key)] = sess

    # Get all agents for this gateway
    agents = await Agent.objects.filter_by(gateway_id=payload.gateway_id).all(session)
    now = utcnow()
    updated_count = 0

    for agent in agents:
        if not agent.openclaw_session_id:
            continue

        old_status = agent.status
        new_status = old_status
        session_key = agent.openclaw_session_id

        if session_key in active_sessions:
            # Agent has an active session
            sess_data = active_sessions[session_key]
            if sess_data.get("active", True):
                new_status = "online"
                agent.last_seen_at = now
        else:
            # No active session
            if agent.last_seen_at and now - agent.last_seen_at > OFFLINE_AFTER:
                new_status = "offline"

        if new_status != old_status:
            agent.status = new_status
            agent.updated_at = now
            session.add(agent)
            updated_count += 1

            logger.info(
                "gateway_callback.agent_status_updated agent_id=%s old=%s new=%s",
                agent.id,
                old_status,
                new_status,
            )

    await session.commit()

    return GatewayHeartbeatResponse(
        ok=True,
        updated_count=updated_count,
        message=f"Updated {updated_count} agent statuses",
    )


@router.post(
    "/sync-agents/{gateway_id}",
    response_model=GatewayHeartbeatResponse,
    summary="Sync Gateway Agents",
    description="Trigger a sync of agent statuses for a specific gateway.",
)
async def sync_gateway_agents(
    gateway_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> GatewayHeartbeatResponse:
    """Manually trigger a sync of agent statuses for a gateway."""
    gateway = await Gateway.objects.by_id(gateway_id).first(session)
    if not gateway:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gateway not found: {gateway_id}",
        )

    if not gateway.url:
        return GatewayHeartbeatResponse(
            ok=False,
            updated_count=0,
            message="Gateway has no URL configured",
        )

    service = get_heartbeat_service(session)
    result = await service._sync_gateway_sessions(gateway)

    return GatewayHeartbeatResponse(
        ok=True,
        updated_count=result.updated_online + result.updated_offline,
        message=f"Synced {result.total_agents} agents: {result.updated_online} online, {result.updated_offline} offline",
    )


@router.post(
    "/sync-all",
    response_model=GatewayHeartbeatResponse,
    summary="Sync All Agents",
    description="Trigger a sync of agent statuses for all gateways.",
)
async def sync_all_agents(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> GatewayHeartbeatResponse:
    """Manually trigger a sync of all agent statuses."""
    service = get_heartbeat_service(session)
    result = await service.sync_all_gateways()

    return GatewayHeartbeatResponse(
        ok=True,
        updated_count=result.updated_online + result.updated_offline,
        message=f"Synced {result.total_agents} agents from {result.total_agents} gateways",
    )


@router.get(
    "/agent/{agent_id}/status",
    response_model=AgentRead,
    summary="Get Agent Status",
    description="Get the current status of an agent with computed online/offline state.",
)
async def get_agent_status(
    agent_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> AgentRead:
    """Get an agent's current status."""
    agent = await Agent.objects.by_id(agent_id).first(session)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent not found: {agent_id}",
        )

    # Compute actual status based on last_seen_at
    now = utcnow()
    if agent.status not in {"deleting", "updating"}:
        if agent.last_seen_at is None:
            computed_status = "provisioning"
        elif now - agent.last_seen_at > OFFLINE_AFTER:
            computed_status = "offline"
        else:
            computed_status = "online"
        agent.status = computed_status

    from app.services.openclaw.provisioning_db import AgentLifecycleService

    return AgentLifecycleService.to_agent_read(
        AgentLifecycleService.with_computed_status(agent)
    )