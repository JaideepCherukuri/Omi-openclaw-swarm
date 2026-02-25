"""Task Queue Service for intelligent task assignment.

This service provides:
- A queue for tasks waiting for agent pickup
- Priority-based task assignment
- Skill matching (Agent.skill_tags vs Task.tags)
- Auto-assignment of tasks to available agents
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import asc, desc
from sqlmodel import col, select

from app.core.time import utcnow
from app.models.agents import Agent
from app.models.boards import Board
from app.models.tags import Tag
from app.models.task_dependencies import TaskDependency
from app.models.tasks import Task

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class TaskQueueEntry:
    """Represents a task waiting for assignment."""

    task_id: UUID
    board_id: UUID
    priority: str
    title: str
    description: str | None
    tag_ids: list[UUID]
    created_at: datetime
    score: float = 0.0  # Computed for matching


@dataclass
class AgentMatchResult:
    """Result of matching an agent to a task."""

    agent_id: UUID
    agent_name: str
    match_score: float
    matched_skills: list[str]
    availability_score: float


PRIORITY_SCORES = {
    "urgent": 100.0,
    "high": 75.0,
    "medium": 50.0,
    "low": 25.0,
}


class TaskQueueService:
    """Service for managing task queue and auto-assignment."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_pending_tasks(
        self,
        board_id: UUID | None = None,
        limit: int = 100,
    ) -> list[TaskQueueEntry]:
        """Get tasks waiting for assignment (unassigned inbox tasks)."""
        statement = (
            select(Task)
            .where(col(Task.status) == "inbox")
            .where(col(Task.assigned_agent_id).is_(None))
            .order_by(
                desc(col(Task.priority)),
                asc(col(Task.created_at)),
            )
        )

        if board_id:
            statement = statement.where(col(Task.board_id) == board_id)

        statement = statement.limit(limit)
        tasks = list(await self.session.exec(statement))

        # Get tag IDs for all tasks
        task_ids = [t.id for t in tasks]
        tag_map: dict[UUID, list[UUID]] = {}
        if task_ids:
            from app.models.tag_assignments import TagAssignment

            tag_rows = await self.session.exec(
                select(TagAssignment)
                .where(col(TagAssignment.task_id).in_(task_ids))
            )
            for row in tag_rows:
                tag_map.setdefault(row.task_id, []).append(row.tag_id)

        return [
            TaskQueueEntry(
                task_id=task.id,
                board_id=task.board_id,
                priority=task.priority,
                title=task.title,
                description=task.description,
                tag_ids=tag_map.get(task.id, []),
                created_at=task.created_at,
            )
            for task in tasks
            if task.board_id is not None
        ]

    async def get_available_agents(
        self,
        board_id: UUID,
    ) -> list[Agent]:
        """Get agents available for task assignment on a board."""
        statement = (
            select(Agent)
            .where(col(Agent.board_id) == board_id)
            .where(col(Agent.status).in_(["online", "idle"]))
            .where(col(Agent.is_board_lead).is_(False))
        )
        return list(await self.session.exec(statement))

    async def get_agent_current_tasks(
        self,
        agent_id: UUID,
    ) -> int:
        """Count active tasks assigned to an agent."""
        statement = (
            select(col(Task.id))
            .where(col(Task.assigned_agent_id) == agent_id)
            .where(col(Task.status).in_(["in_progress", "review"]))
        )
        result = await self.session.exec(statement)
        return len(list(result))

    def _compute_match_score(
        self,
        task: TaskQueueEntry,
        agent: Agent,
    ) -> AgentMatchResult:
        """Compute a match score between a task and an agent."""
        agent_skills = set(agent.skill_tags or [])
        task_tags_set = set(str(t) for t in task.tag_ids)

        # Match skills with task tags
        matched_skills = []
        for skill in agent_skills:
            # Skill is a tag name or ID
            matched_skills.append(skill)

        # Base score from priority
        score = PRIORITY_SCORES.get(task.priority, 50.0)

        # Bonus for skill matches (simple implementation - exact tag ID match)
        skill_match_count = len(matched_skills)
        score += skill_match_count * 10.0

        # Penalty for already having tasks
        # (will be applied async in the match function)

        return AgentMatchResult(
            agent_id=agent.id,
            agent_name=agent.name,
            match_score=score,
            matched_skills=matched_skills,
            availability_score=100.0,  # Default, adjusted by workload
        )

    async def find_best_agent_for_task(
        self,
        task_entry: TaskQueueEntry,
    ) -> AgentMatchResult | None:
        """Find the best matching agent for a task."""
        agents = await self.get_available_agents(task_entry.board_id)
        if not agents:
            return None

        matches: list[AgentMatchResult] = []
        for agent in agents:
            match = self._compute_match_score(task_entry, agent)

            # Apply workload penalty
            current_tasks = await self.get_agent_current_tasks(agent.id)
            workload_penalty = current_tasks * 15.0  # Penalty per existing task
            match.match_score -= workload_penalty
            match.availability_score = max(0.0, 100.0 - workload_penalty)

            matches.append(match)

        # Sort by score descending
        matches.sort(key=lambda m: m.match_score, reverse=True)

        # Return best match if score is positive
        if matches and matches[0].match_score > 0:
            return matches[0]
        return None

    async def assign_task_to_agent(
        self,
        task_id: UUID,
        agent_id: UUID,
        auto_claimed: bool = False,
    ) -> Task | None:
        """Assign a task to an agent."""
        task = await self.session.get(Task, task_id)
        if task is None:
            logger.warning(f"task_queue.assign_task_not_found task_id={task_id}")
            return None

        agent = await self.session.get(Agent, agent_id)
        if agent is None:
            logger.warning(f"task_queue.assign_agent_not_found agent_id={agent_id}")
            return None

        # Only assign inbox tasks
        if task.status != "inbox":
            logger.debug(
                f"task_queue.assign_task_not_inbox "
                f"task_id={task_id} status={task.status}"
            )
            return None

        if task.assigned_agent_id is not None:
            logger.debug(
                f"task_queue.assign_task_already_assigned "
                f"task_id={task_id} agent_id={task.assigned_agent_id}"
            )
            return None

        # Check for blocking dependencies
        dep_ids = await self._get_dependency_ids(task.id)
        if dep_ids:
            dep_status = await self._get_dependency_status(dep_ids)
            blocking = [d for d in dep_ids if dep_status.get(d, "") != "done"]
            if blocking:
                logger.debug(
                    f"task_queue.assign_task_blocked "
                    f"task_id={task_id} blocked_by={blocking}"
                )
                return None

        task.assigned_agent_id = agent_id
        task.updated_at = utcnow()

        if auto_claimed:
            task.claimed_at = utcnow()
            task.status = "in_progress"
            task.in_progress_at = utcnow()

        self.session.add(task)
        await self.session.commit()
        await self.session.refresh(task)

        logger.info(
            f"task_queue.task_assigned "
            f"task_id={task_id} agent_id={agent_id} "
            f"auto_claimed={auto_claimed}"
        )

        return task

    async def _get_dependency_ids(self, task_id: UUID) -> list[UUID]:
        """Get IDs of tasks this task depends on."""
        from app.services.task_dependencies import dependency_ids_by_task_id

        deps_map = await dependency_ids_by_task_id(
            self.session,
            board_id=None,  # board_id filtered by task
            task_ids=[task_id],
        )
        return deps_map.get(task_id, [])

    async def _get_dependency_status(
        self,
        task_ids: list[UUID],
    ) -> dict[UUID, str]:
        """Get status of dependency tasks."""
        from app.services.task_dependencies import dependency_status_by_id

        if not task_ids:
            return {}
        return await dependency_status_by_id(
            self.session,
            board_id=None,
            dependency_ids=task_ids,
        )

    async def auto_assign_single_task(
        self,
        task_id: UUID,
    ) -> Task | None:
        """Attempt to auto-assign a single task to the best available agent."""
        task = await self.session.get(Task, task_id)
        if task is None or task.status != "inbox" or task.assigned_agent_id is not None:
            return None

        # Get board info
        board = await self.session.get(Board, task.board_id)
        if board is None:
            return None

        # Check max agents limit
        if board.max_agents <= 0:
            logger.debug(f"task_queue.board_max_agents_zero board_id={board.id}")
            return None

        # Create task entry
        from app.models.tag_assignments import TagAssignment

        tag_rows = await self.session.exec(
            select(TagAssignment)
            .where(col(TagAssignment.task_id) == task_id)
        )
        tag_ids = [row.tag_id for row in tag_rows]

        task_entry = TaskQueueEntry(
            task_id=task.id,
            board_id=task.board_id,
            priority=task.priority,
            title=task.title,
            description=task.description,
            tag_ids=tag_ids,
            created_at=task.created_at,
        )

        best_match = await self.find_best_agent_for_task(task_entry)
        if best_match is None:
            return None

        return await self.assign_task_to_agent(
            task_id=task_id,
            agent_id=best_match.agent_id,
            auto_claimed=True,
        )

    async def process_queue(
        self,
        board_id: UUID | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        """Process the task queue and auto-assign tasks.

        Returns:
            Dict with assignment counts and statistics.
        """
        results = {
            "processed": 0,
            "assigned": 0,
            "skipped": 0,
            "errors": 0,
        }

        try:
            pending = await self.get_pending_tasks(board_id=board_id, limit=limit)
            results["processed"] = len(pending)

            for task_entry in pending:
                try:
                    assigned_task = await self.auto_assign_single_task(task_entry.task_id)
                    if assigned_task:
                        results["assigned"] += 1
                    else:
                        results["skipped"] += 1
                except Exception as exc:
                    logger.exception(f"task_queue.auto_assign_error task_id={task_entry.task_id}")
                    results["errors"] += 1

        except Exception as exc:
            logger.exception("task_queue.process_queue_error")
            results["errors"] += 1

        return results


async def process_task_queue(
    session: AsyncSession,
    board_id: UUID | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """Process the task queue for auto-assignment.

    This is a convenience function that can be called from background jobs.
    """
    service = TaskQueueService(session)
    return await service.process_queue(board_id=board_id, limit=limit)
