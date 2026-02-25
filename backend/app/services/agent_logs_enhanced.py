"""Enhanced agent activity logging for Mission Control.

Provides enriched agent activity logs with detailed event types, thinking, and tool calls.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from app.core.time import utcnow

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# Global log storage
_agent_logs: list[dict[str, Any]] = []


class LogEventType(str, Enum):
    """Types of agent log events."""
    HEARTBEAT = "heartbeat"
    TASK_START = "task_start"
    TASK_COMPLETE = "task_complete"
    TASK_ERROR = "task_error"
    THINK = "think"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    STATUS_CHANGE = "status_change"
    SYSTEM = "system"


class LogLevel(str, Enum):
    """Log levels."""
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class AgentLogEntry:
    """A single enriched agent log entry."""
    id: str
    timestamp: str
    agent_id: str
    agent_name: str
    event_type: LogEventType
    level: LogLevel
    message: str
    details: str | None = None
    task_id: str | None = None
    task_title: str | None = None
    duration_ms: int | None = None
    tokens_input: int | None = None
    tokens_output: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def add_log_entry(
    session_key: str,
    agent_id: str,
    agent_name: str,
    event_type: LogEventType,
    level: LogLevel,
    message: str,
    **kwargs,
) -> AgentLogEntry:
    """Add a new log entry."""
    entry = AgentLogEntry(
        id=f"{session_key}-{datetime.utcnow().timestamp()}",
        timestamp=utcnow().isoformat(),
        agent_id=agent_id,
        agent_name=agent_name,
        event_type=event_type,
        level=level,
        message=message,
        **kwargs,
    )
    
    _agent_logs.append(entry.__dict__)
    
    # Keep only last 1000 entries
    if len(_agent_logs) > 1000:
        _agent_logs.pop(0)
    
    return entry


def get_log_buffer() -> list[dict[str, Any]]:
    """Get all logs from buffer."""
    return _agent_logs.copy()


def get_recent_agent_logs(
    agent_id: str | None = None,
    event_type: LogEventType | None = None,
    level: LogLevel | None = None,
    hours: int = 24,
    limit: int = 100,
) -> list[AgentLogEntry]:
    """Get recent agent logs with filtering."""
    cutoff = utcnow() - timedelta(hours=hours)
    
    logs = []
    for log_data in reversed(_agent_logs):  # Newest first
        timestamp = datetime.fromisoformat(log_data["timestamp"])
        if timestamp < cutoff:
            continue
            
        if agent_id and log_data.get("agent_id") != agent_id:
            continue
        if event_type and log_data.get("event_type") != event_type:
            continue
        if level and log_data.get("level") != level:
            continue
            
        logs.append(AgentLogEntry(**log_data))
        
        if len(logs) >= limit:
            break
            
    return logs


class AgentLogsService:
    """Service for managing agent logs."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def get_recent_logs(
        self,
        agent_id: UUID | None = None,
        level: str | None = None,
        limit: int = 100,
        hours: int = 24,
    ) -> list[AgentLogEntry]:
        """Get recent logs."""
        return get_recent_agent_logs(
            agent_id=str(agent_id) if agent_id else None,
            level=LogLevel(level) if level else None,
            hours=hours,
            limit=limit,
        )
    
    async def fetch_from_gateway(self) -> int:
        """Fetch logs from gateway - generates heartbeats for now."""
        from app.models.agents import Agent
        from sqlalchemy import select
        
        result = await self.session.exec(select(Agent))
        agents = result.all()
        
        count = 0
        for agent in agents:
            add_log_entry(
                session_key=agent.openclaw_session_id or f"agent-{agent.id}",
                agent_id=str(agent.id),
                agent_name=agent.name,
                event_type=LogEventType.HEARTBEAT,
                level=LogLevel.INFO,
                message=f"Agent {agent.status}: No tasks assigned",
                details=f"Last seen: {agent.last_seen_at or 'never'}",
            )
            count += 1
        
        return count


def clear_logs() -> None:
    """Clear all logs."""
    _agent_logs.clear()
