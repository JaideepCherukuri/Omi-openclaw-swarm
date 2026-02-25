"""Serayah Dashboard API routes.

Provides endpoints for the Serayah Dashboard to view:
- Tasks created by Serayah (auto_created=true)
- Task queue (pending assignment)
- Recent activity
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import asc, desc, func, or_
from sqlmodel import col, select

from app.api.deps import require_admin_or_agent
from app.db.pagination import paginate
from app.db.session import get_session
from app.services.agent_logs_enhanced import AgentLogsService, AgentLogEntry, get_log_buffer, add_log_entry, LogEventType, LogLevel
from app.services.agent_task_pickup import AgentTaskPickupService
from app.models.activity_events import ActivityEvent
from app.models.agents import Agent
from app.models.boards import Board
from app.models.tag_assignments import TagAssignment
from app.models.tags import Tag
from app.models.tasks import Task
from app.schemas.common import OkResponse
from app.schemas.pagination import DefaultLimitOffsetPage
from app.schemas.tasks import TaskRead

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/serayah", tags=["serayah"])


@router.get(
    "/tasks",
    response_model=DefaultLimitOffsetPage[TaskRead],
)
async def get_serayah_tasks(
    auto_created: bool | None = Query(default=None, description="Filter by auto-created tasks"),
    status: str | None = Query(default=None, description="Filter by task status"),
    assigned_agent_id: UUID | None = Query(default=None, description="Filter by assigned agent"),
    session: AsyncSession = Depends(get_session),
) -> DefaultLimitOffsetPage[TaskRead]:
    """Get tasks visible in Serayah Dashboard.
    
    Returns tasks that are either:
    - auto_created by Serayah
    - Created by agent with Serayah session
    """
    # Build base query
    statement = (
        select(Task)
        .outerjoin(Agent, col(Task.assigned_agent_id) == col(Agent.id))
        .order_by(desc(col(Task.created_at)))
    )
    
    # Filter for Serayah-created tasks
    if auto_created is not None:
        statement = statement.where(col(Task.auto_created) == auto_created)
    
    # Filter by status
    if status:
        statement = statement.where(col(Task.status) == status)
    
    # Filter by assigned agent
    if assigned_agent_id:
        statement = statement.where(col(Task.assigned_agent_id) == assigned_agent_id)
    
    return await paginate(session, statement)


@router.get(
    "/queue",
    response_model=OkResponse,
)
async def get_task_queue(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Get the task queue - tasks waiting for agent assignment."""
    # Get unassigned inbox tasks, ordered by priority and age
    statement = (
        select(
            Task.id,
            Task.title,
            Task.priority,
            Task.status,
            Task.created_at,
            Board.name.label("board_name"),
            func.array_agg(Tag.name).label("tags"),
        )
        .join(Board, col(Task.board_id) == col(Board.id))
        .outerjoin(
            TagAssignment,
            col(Task.id) == col(TagAssignment.task_id),
        )
        .outerjoin(Tag, col(TagAssignment.tag_id) == col(Tag.id))
        .where(col(Task.status) == "inbox")
        .where(col(Task.assigned_agent_id).is_(None))
        .group_by(Task.id, Task.title, Task.priority, Task.status, Task.created_at, Board.name)
        .order_by(
            # Priority order: urgent > high > medium > low
            func.case(
                (col(Task.priority) == "urgent", 0),
                (col(Task.priority) == "high", 1),
                (col(Task.priority) == "medium", 2),
                (col(Task.priority) == "low", 3),
                else_=4,
            ),
            asc(col(Task.created_at)),  # Oldest first
        )
        .limit(limit)
    )
    
    result = await session.execute(statement)
    tasks = [
        {
            "id": str(row.id),
            "title": row.title,
            "priority": row.priority,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "board_name": row.board_name,
            "tags": row.tags or [],
        }
        for row in result.all()
    ]
    
    return OkResponse(data={"tasks": tasks, "count": len(tasks)})


@router.get(
    "/activity",
    response_model=OkResponse,
)
async def get_serayah_activity(
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Get recent activity related to Serayah and auto-created tasks."""
    # Get recent activity events for auto-created tasks
    statement = (
        select(
            ActivityEvent.id,
            ActivityEvent.event_type,
            ActivityEvent.message,
            ActivityEvent.created_at,
            Task.id.label("task_id"),
            Task.title.label("task_title"),
            Agent.name.label("agent_name"),
        )
        .join(Task, col(ActivityEvent.task_id) == col(Task.id))
        .outerjoin(Agent, col(ActivityEvent.agent_id) == col(Agent.id))
        .where(
            or_(
                col(Task.auto_created) == True,
                col(ActivityEvent.agent_id).is_not(None),
            )
        )
        .order_by(desc(col(ActivityEvent.created_at)))
        .limit(limit)
    )
    
    result = await session.execute(statement)
    activities = [
        {
            "id": str(row.id),
            "event_type": row.event_type,
            "message": row.message,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "task_id": str(row.task_id) if row.task_id else None,
            "task_title": row.task_title,
            "agent_name": row.agent_name,
        }
        for row in result.all()
    ]
    
    return OkResponse(data={"activities": activities, "count": len(activities)})


@router.get(
    "/agent-status",
    response_model=OkResponse,
)
async def get_agent_status(
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Get status of all agents and their current task load."""
    # Get agent status with task counts
    statement = (
        select(
            Agent.id,
            Agent.name,
            Agent.status,
            Agent.last_seen_at,
            Agent.skill_tags,
            func.count(Task.id).filter(col(Task.status) == "in_progress").label("in_progress_count"),
            func.count(Task.id).filter(col(Task.status) == "inbox").label("assigned_count"),
        )
        .outerjoin(Task, col(Agent.id) == col(Task.assigned_agent_id))
        .group_by(Agent.id, Agent.name, Agent.status, Agent.last_seen_at, Agent.skill_tags)
        .order_by(desc(col(Agent.last_seen_at)))
    )
    
    result = await session.execute(statement)
    agents = [
        {
            "id": str(row.id),
            "name": row.name,
            "status": row.status,
            "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
            "skill_tags": row.skill_tags or [],
            "in_progress_tasks": row.in_progress_count or 0,
            "assigned_tasks": row.assigned_count or 0,
        }
        for row in result.all()
    ]
    
    return OkResponse(data={"agents": agents, "count": len(agents)})


@router.post("/agents/{agent_id}/pickup-task")
async def agent_pickup_task(
    agent_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Agent picks up an available task.
    
    Returns the task if one is available, None otherwise.
    """
    service = AgentTaskPickupService(session)
    task = await service.get_available_task(agent_id)
    
    if task:
        return OkResponse(data={
            "task": {
                "id": str(task.id),
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "claimed_at": task.claimed_at.isoformat() if task.claimed_at else None,
                "board_id": str(task.board_id) if task.board_id else None,
            }
        })
    
    return OkResponse(data={"task": None, "message": "No tasks available"})


@router.post("/agents/{agent_id}/tasks/{task_id}/release")
async def agent_release_task(
    agent_id: UUID,
    task_id: UUID,
    reason: str = "",
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Agent releases a task back to the queue."""
    service = AgentTaskPickupService(session)
    success = await service.release_task(task_id, agent_id, reason)
    
    return OkResponse(
        success=success,
        data={"message": "Task released" if success else "Task release failed"}
    )


@router.post("/agents/{agent_id}/tasks/{task_id}/complete")
async def agent_complete_task(
    agent_id: UUID,
    task_id: UUID,
    result_summary: str = "",
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Agent marks a task as complete."""
    service = AgentTaskPickupService(session)
    success = await service.complete_task(task_id, agent_id, result_summary)
    
    return OkResponse(
        success=success,
        data={"message": "Task completed" if success else "Task completion failed"}
    )


@router.post("/agents/{agent_id}/heartbeat")
async def agent_task_heartbeat(
    agent_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Agent heartbeat with task status.
    
    Returns current tasks, available task count, and if agent can claim more.
    """
    service = AgentTaskPickupService(session)
    result = await service.heartbeat(agent_id)
    
    if "error" in result:
        return OkResponse(success=False, error=result["error"])
    
    return OkResponse(data=result)


@router.get("/agent-logs")
async def get_agent_logs(
    agent_id: UUID | None = Query(default=None, description="Filter by agent ID"),
    level: str | None = Query(default=None, description="Filter by log level"),
    event_type: str | None = Query(default=None, description="Filter by event type"),
    limit: int = Query(default=100, ge=1, le=500, description="Max entries to return"),
    hours: int = Query(default=24, ge=1, le=168, description="Hours to look back"),
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Get agent logs with enriched data.
    
    Returns recent agent logs with detailed event types, thinking, and tool calls.
    """
    service = AgentLogsService(session)
    logs = await service.get_recent_logs(
        agent_id=agent_id,
        level=level,
        limit=limit,
        hours=hours,
    )
    
    # Filter by event type if provided
    if event_type:
        logs = [log for log in logs if log.event_type.value == event_type]
    
    return OkResponse(data={
        "logs": [
            {
                "id": log.id,
                "timestamp": log.timestamp,
                "agent_id": log.agent_id,
                "agent_name": log.agent_name,
                "event_type": log.event_type.value,
                "level": log.level.value,
                "message": log.message,
                "details": log.details,
                "task_id": log.task_id,
                "task_title": log.task_title,
                "duration_ms": log.duration_ms,
                "tokens_input": log.tokens_input,
                "tokens_output": log.tokens_output,
                "metadata": log.metadata,
            }
            for log in logs
        ],
        "count": len(logs),
    })


@router.post("/agent-logs/fetch")
async def fetch_agent_logs_from_gateway(
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Fetch fresh logs from OpenClaw gateway.
    
    Trigger a manual fetch of agent logs from the gateway.
    """
    service = AgentLogsService(session)
    count = await service.fetch_from_gateway()
    
    return OkResponse(data={
        "message": f"Fetched {count} new log entries",
        "count": count,
    })


@router.post("/agent-logs/clear")
async def clear_agent_logs(
    session: AsyncSession = Depends(get_session),
) -> OkResponse:
    """Clear all agent logs."""
    get_log_buffer().clear()
    
    return OkResponse(data={"message": "Logs cleared"})
