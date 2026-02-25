"""Task Auto-Promote Service for review → done transitions.

Background service that periodically checks tasks in "review" status
and auto-promotes them to "done" after board.auto_promote_review_hours.

Usage:
    from app.services.task_auto_promote import TaskAutoPromoteService
    service = TaskAutoPromoteService(session)
    await service.run_auto_promote_cycle()
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select
from sqlmodel import col

from app.core.time import utcnow
from app.models.approvals import Approval
from app.models.boards import Board
from app.models.tasks import Task

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)


class TaskAutoPromoteService:
    """Service for auto-promoting tasks from review to done."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def run_auto_promote_cycle(self) -> dict[str, int]:
        """
        Run one auto-promote cycle.
        
        Returns:
            Dict with keys "promoted", "skipped", "errors"
        """
        stats = {"promoted": 0, "skipped": 0, "errors": 0}

        # Get all tasks in review status
        tasks_in_review = list(await self.session.exec(
            select(Task)
            .where(col(Task.status) == "review")
            .where(col(Task.assigned_agent_id).is_not(None))
        ))

        logger.info("Auto-promote cycle: checking %d tasks in review", len(tasks_in_review))

        for task in tasks_in_review:
            try:
                should_promote = await self._should_auto_promote_task(task)
                if should_promote:
                    await self._promote_task(task)
                    stats["promoted"] += 1
                    logger.info("Auto-promoted task %s to done", task.id)
                else:
                    stats["skipped"] += 1
            except Exception as e:
                logger.error("Error auto-promoting task %s: %s", task.id, e)
                stats["errors"] += 1

        return stats

    async def _should_auto_promote_task(self, task: Task) -> bool:
        """
        Determine if a task should be auto-promoted from review to done.
        
        Criteria:
        1. Task status is "review"
        2. Task has been in review for > board.auto_promote_review_hours
        3. No pending approvals linked to this task
        4. Board has auto_promote_review_hours > 0
        """
        if task.board_id is None:
            return False

        # Get board config
        try:
            board = await self.session.get(Board, task.board_id)
            if board is None:
                return False
        except Exception as exc:
            logger.warning("Failed to fetch board %s: %s", task.board_id, exc)
            return False

        # Check if auto-promote is enabled (gracefully handle missing column)
        try:
            threshold_hours = getattr(board, 'auto_promote_review_hours', 0)
            if threshold_hours <= 0:
                return False
        except Exception as exc:
            logger.debug("Board %s missing auto_promote_review_hours column: %s", task.board_id, exc)
            return False

        # Check if task has been in review long enough
        time_in_review = self._get_time_in_review(task)

        if time_in_review < timedelta(hours=threshold_hours):
            return False

        # Check for pending approvals
        has_pending = await self._has_pending_approvals(task.id)
        if has_pending:
            logger.debug("Task %s has pending approvals, skipping auto-promote", task.id)
            return False

        return True

    def _get_time_in_review(self, task: Task) -> timedelta:
        """
        Estimate how long task has been in review.
        
        Uses task.updated_at as proxy for review entry time.
        This works because updated_at is set when status changes.
        """
        # For accurate tracking, we'd need review_entered_at field
        # For now, use updated_at as fallback
        review_since = task.updated_at or task.in_progress_at or task.created_at
        if review_since is None:
            review_since = task.created_at or utcnow()
        
        return utcnow() - review_since

    async def _has_pending_approvals(self, task_id: UUID) -> bool:
        """Check if task has any linked approvals that are pending."""
        pending = await self.session.exec(
            select(Approval)
            .where(col(Approval.task_id) == task_id)
            .where(col(Approval.status) == "pending")
            .limit(1)
        )
        return pending.first() is not None

    async def _promote_task(self, task: Task) -> None:
        """Promote task from review to done."""
        previous_status = task.status
        task.status = "done"
        task.updated_at = utcnow()
        self.session.add(task)

        # Record activity
        from app.services.activity_log import record_activity
        record_activity(
            self.session,
            event_type="task.status_changed",
            task_id=task.id,
            message=f"Task auto-promoted from {previous_status} to done after review threshold",
            agent_id=task.assigned_agent_id,
        )
        await self.session.commit()


# Background task runner for asyncio/async context
async def run_auto_promote_cycle(session: AsyncSession) -> dict[str, int]:
    """Convenience function to run one auto-promote cycle."""
    service = TaskAutoPromoteService(session)
    return await service.run_auto_promote_cycle()


# Global service instance for background task
_service_instance: TaskAutoPromoteService | None = None


def get_task_auto_promote_service(session: AsyncSession) -> TaskAutoPromoteService:
    """Get or create the task auto-promote service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = TaskAutoPromoteService(session)
    return _service_instance


async def start_task_auto_promote_service(session: AsyncSession) -> TaskAutoPromoteService:
    """Initialize and start the global task auto-promote background service."""
    service = get_task_auto_promote_service(session)
    return service


async def stop_task_auto_promote_service() -> None:
    """Stop the global task auto-promote service."""
    global _service_instance
    _service_instance = None
