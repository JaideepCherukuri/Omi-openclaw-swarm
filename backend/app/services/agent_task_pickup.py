"""Agent Task Pickup Service for Mission Control.

Provides task claiming and heartbeat-based task assignment.
Agents call pickup endpoint to receive tasks based on their skills.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import asc, select
from sqlmodel import col

from app.core.time import utcnow
from app.models.agents import Agent
from app.models.tasks import Task
from app.services.discord_notifications import notify_task_assigned, notify_task_completed

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# Max tasks an agent can have claimed at once
MAX_CLAIMED_TASKS = 3


class AgentTaskPickupService:
    """Service for agents to pick up tasks from the queue."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_available_task(
        self,
        agent_id: UUID,
        skill_tags: list[str] | None = None,
    ) -> Task | None:
        """
        Get an available task for an agent to work on.
        
        Priority:
        1. Tasks matching agent's skill tags (highest priority first)
        2. Tasks with no skill requirements
        3. Oldest tasks first
        
        Args:
            agent_id: The agent claiming the task
            skill_tags: Optional list of skill tags the agent has
            
        Returns:
            The task to work on, or None if no tasks available
        """
        # Check if agent already has max claimed tasks
        claimed_count = await self._get_claimed_task_count(agent_id)
        if claimed_count >= MAX_CLAIMED_TASKS:
            logger.debug("Agent %s has %d claimed tasks (max %d)", 
                        agent_id, claimed_count, MAX_CLAIMED_TASKS)
            return None

        # Build query for pending tasks
        query = (
            select(Task)
            .where(col(Task.status) == "pending")
            .where(col(Task.assigned_agent_id).is_(None))
            .where(col(Task.claimed_at).is_(None))
            .order_by(
                asc(Task.priority),  # Lower number = higher priority
                asc(Task.created_at),  # Oldest first
            )
        )

        # If agent has skill tags, prioritize matching tasks
        if skill_tags:
            # For now, simple approach - tasks without specific skill requirements
            # In v2, we'll match against task.skill_tags
            pass

        result = await self.session.exec(query.limit(1))
        task = result.first()

        if task:
            # Claim the task atomically
            await self._claim_task(task, agent_id)
            logger.info("Task %s claimed by agent %s", task.id, agent_id)
            
        return task

    async def release_task(
        self,
        task_id: UUID,
        agent_id: UUID,
        reason: str = "",
    ) -> bool:
        """
        Release a claimed task back to the queue.
        
        Args:
            task_id: The task to release
            agent_id: The agent releasing the task (must match assigned agent)
            reason: Optional reason for release
            
        Returns:
            True if released successfully
        """
        task = await self.session.get(Task, task_id)
        if not task or task.assigned_agent_id != agent_id:
            logger.warning("Task %s release failed - not assigned to agent %s", 
                          task_id, agent_id)
            return False

        # Reset assignment
        task.assigned_agent_id = None
        task.claimed_at = None
        task.status = "pending"
        
        await self.session.commit()
        
        logger.info("Task %s released by agent %s: %s", task_id, agent_id, reason or "No reason")
        return True

    async def complete_task(
        self,
        task_id: UUID,
        agent_id: UUID,
        result_summary: str = "",
    ) -> bool:
        """
        Mark a task as completed by an agent.
        
        Args:
            task_id: The task to complete
            agent_id: The agent completing the task
            result_summary: Optional summary of results
            
        Returns:
            True if completed successfully
        """
        task = await self.session.get(Task, task_id)
        if not task or task.assigned_agent_id != agent_id:
            logger.warning("Task %s complete failed - not assigned to agent %s",
                          task_id, agent_id)
            return False

        task.status = "review"
        
        if result_summary:
            # Store result in task metadata (add column in future)
            pass
        
        await self.session.commit()
        
        # Send completion notification
        agent = await self.session.get(Agent, agent_id)
        if agent:
            await notify_task_completed(
                task_id=task.id,
                title=task.title,
                agent_name=agent.name,
                result_summary=result_summary,
            )
        
        logger.info("Task %s completed by agent %s", task_id, agent_id)
        return True

    async def heartbeat(self, agent_id: UUID) -> dict[str, any]:
        """
        Agent heartbeat - update last seen and return task status.
        
        Args:
            agent_id: The agent sending heartbeat
            
        Returns:
            Dict with current task info and available task count
        """
        agent = await self.session.get(Agent, agent_id)
        if not agent:
            logger.warning("Heartbeat from unknown agent: %s", agent_id)
            return {"error": "Agent not found"}

        # Update last seen
        agent.last_heartbeat_at = utcnow()
        
        # Get current assigned tasks
        assigned_tasks = await self._get_assigned_tasks(agent_id)
        
        # Count available tasks
        available_count = await self._count_available_tasks(agent)
        
        await self.session.commit()
        
        return {
            "agent_id": str(agent_id),
            "status": agent.status,
            "current_tasks": [
                {
                    "id": str(t.id),
                    "title": t.title,
                    "status": t.status,
                    "claimed_at": t.claimed_at.isoformat() if t.claimed_at else None,
                }
                for t in assigned_tasks
            ],
            "available_tasks": available_count,
            "can_claim": len(assigned_tasks) < MAX_CLAIMED_TASKS,
        }

    async def _get_claimed_task_count(self, agent_id: UUID) -> int:
        """Get count of tasks claimed by agent."""
        query = select(Task).where(
            col(Task.assigned_agent_id) == agent_id,
            col(Task.status).in_(["pending", "in-progress", "review"])
        )
        result = await self.session.exec(query)
        return len(list(result))

    async def _get_assigned_tasks(self, agent_id: UUID) -> list[Task]:
        """Get tasks currently assigned to agent."""
        query = select(Task).where(
            col(Task.assigned_agent_id) == agent_id,
            col(Task.status).in_(["pending", "in-progress"])
        ).order_by(asc(Task.claimed_at))
        result = await self.session.exec(query)
        return list(result)

    async def _claim_task(self, task: Task, agent_id: UUID) -> None:
        """Claim a task for an agent and send notifications."""
        task.assigned_agent_id = agent_id
        task.claimed_at = utcnow()
        task.status = "in-progress"
        await self.session.commit()
        
        # Get agent and board info for notification
        agent = await self.session.get(Agent, agent_id)
        if agent:
            # Send Discord notification
            await notify_task_assigned(
                task_id=task.id,
                title=task.title,
                agent_name=agent.name,
                agent_id=agent_id,
                board_name=None,  # Could get board name here
            )

    async def _count_available_tasks(self, agent: Agent) -> int:
        """Count tasks available for pickup."""
        query = select(Task).where(
            col(Task.status) == "pending",
            col(Task.assigned_agent_id).is_(None),
            col(Task.claimed_at).is_(None),
        )
        result = await self.session.exec(query)
        return len(list(result))
