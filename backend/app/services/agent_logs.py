"""Agent logs API and service for Mission Control.

Provides real-time and historical agent logs from OpenClaw gateway.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import asc, desc, select
from sqlmodel import col

from app.core.time import utcnow
from app.models.agents import Agent
from app.models.gateways import Gateway
from app.services.openclaw.gateway_rpc import GatewayConfig, openclaw_call, OpenClawGatewayError

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# Max logs to keep per agent
MAX_LOGS_PER_AGENT = 1000
# Log retention in days
LOG_RETENTION_DAYS = 7


@dataclass
class AgentLogEntry:
    """A single agent log entry."""
    id: str
    timestamp: str
    agent_id: str
    agent_name: str
    level: str  # info, warn, error, debug
    message: str
    task_id: str | None = None
    task_title: str | None = None
    session_key: str | None = None


class AgentLogsService:
    """Service for managing and retrieving agent logs."""

    def __init__(self, session: AsyncSession):
        self.session = session
        # In-memory log buffer for demo - would use Redis/DB in production
        self._log_buffer: list[AgentLogEntry] = []

    async def get_recent_logs(
        self,
        agent_id: UUID | None = None,
        level: str | None = None,
        limit: int = 100,
        hours: int = 24,
    ) -> list[AgentLogEntry]:
        """
        Get recent agent logs.
        
        Args:
            agent_id: Filter by specific agent
            level: Filter by log level
            limit: Max entries to return
            hours: Lookback period in hours
            
        Returns:
            List of log entries, newest first
        """
        since = utcnow() - timedelta(hours=hours)
        
        logs = self._log_buffer
        
        # Apply filters
        if agent_id:
            logs = [l for l in logs if l.agent_id == str(agent_id)]
        if level:
            logs = [l for l in logs if l.level == level]
            
        # Sort by timestamp descending and limit
        logs = sorted(logs, key=lambda x: x.timestamp, reverse=True)
        
        return logs[:limit]

    async def fetch_from_gateway(self) -> int:
        """
        Fetch recent logs from OpenClaw gateway.
        
        Connects to the gateway and retrieves session logs.
        
        Returns:
            Number of new logs fetched
        """
        # Get all gateways
        result = await self.session.exec(select(Gateway))
        gateways = result.all()
        
        all_new_logs: list[AgentLogEntry] = []
        
        for gateway in gateways:
            try:
                # Get agents for this gateway
                agents_result = await self.session.exec(
                    select(Agent).where(col(Agent.gateway_id) == gateway.id)
                )
                agents = agents_result.all()
                
                # Fetch logs from gateway
                config = GatewayConfig(
                    url=gateway.url,
                    token=gateway.token,
                    allow_insecure_tls=gateway.allow_insecure_tls,
                    disable_device_pairing=True,
                )
                
                try:
                    # Call logs.tail method
                    logs_response = await openclaw_call(
                        "logs.tail",
                        {"lines": 100, "filter": "agent"},
                        config=config,
                    )
                    
                    if isinstance(logs_response, list):
                        for log_line in logs_response:
                            # Parse log line and match to agent
                            for agent in agents:
                                if agent.openclaw_session_id and agent.openclaw_session_id in str(log_line):
                                    entry = AgentLogEntry(
                                        id=f"log-{gateway.id}-{hash(str(log_line))}",
                                        timestamp=utcnow().isoformat(),
                                        agent_id=str(agent.id),
                                        agent_name=agent.name,
                                        level=self._parse_log_level(str(log_line)),
                                        message=str(log_line)[:500],
                                        session_key=agent.openclaw_session_id,
                                    )
                                    all_new_logs.append(entry)
                                    break
                                    
                except OpenClawGatewayError as e:
                    logger.warning(
                        "Failed to fetch logs from gateway %s: %s",
                        gateway.id,
                        e
                    )
                    
            except Exception as e:
                logger.error("Error fetching logs from gateway: %s", e)
        
        # Also add agent heartbeat logs for agents without gateway logs
        agents_result = await self.session.exec(select(Agent))
        agents = agents_result.all()
        now = utcnow()
        
        for agent in agents:
            if agent.status in ["online", "busy"]:
                # Only add heartbeat if no recent log for this agent
                recent_logs = [l for l in all_new_logs if l.agent_id == str(agent.id)]
                if not recent_logs or not any(
                    l.message.startswith("Heartbeat") for l in recent_logs[-5:]
                ):
                    log = AgentLogEntry(
                        id=f"log-{now.timestamp()}-{agent.id}",
                        timestamp=now.isoformat(),
                        agent_id=str(agent.id),
                        agent_name=agent.name,
                        level="info",
                        message=f"Agent {agent.status}: last seen {agent.last_seen_at or 'never'}",
                        session_key=agent.openclaw_session_id,
                    )
                    all_new_logs.append(log)
        
        self._log_buffer.extend(all_new_logs)
        self._trim_buffer()
        
        return len(all_new_logs)
    
    def _parse_log_level(self, log_line: str) -> str:
        """Parse log level from log line."""
        log_lower = log_line.lower()
        if "error" in log_lower or "fatal" in log_lower:
            return "error"
        if "warn" in log_lower or "warning" in log_lower:
            return "warn"
        if "debug" in log_lower:
            return "debug"
        return "info"

    def _trim_buffer(self) -> None:
        """Keep only recent logs within retention."""
        cutoff = utcnow() - timedelta(days=LOG_RETENTION_DAYS)
        self._log_buffer = [
            l for l in self._log_buffer
            if datetime.fromisoformat(l.timestamp) > cutoff
        ]
        
    async def stream_logs(self):
        """Generator for real-time log streaming."""
        last_count = len(self._log_buffer)
        
        while True:
            await asyncio.sleep(1)
            
            if len(self._log_buffer) > last_count:
                new_logs = self._log_buffer[last_count:]
                for log in new_logs:
                    yield log
                last_count = len(self._log_buffer)


# Global log buffer (in production, use Redis or database)
_global_log_buffer: list[AgentLogEntry] = []


def get_log_buffer() -> list[AgentLogEntry]:
    """Get global log buffer."""
    return _global_log_buffer


def add_log_entry(entry: AgentLogEntry) -> None:
    """Add a log entry to the global buffer."""
    _global_log_buffer.insert(0, entry)
    
    # Keep only last 1000 entries per agent
    agent_logs = [l for l in _global_log_buffer if l.agent_id == entry.agent_id]
    if len(agent_logs) > MAX_LOGS_PER_AGENT:
        # Remove oldest for this agent
        to_remove = agent_logs[MAX_LOGS_PER_AGENT:]
        for log in to_remove:
            if log in _global_log_buffer:
                _global_log_buffer.remove(log)
