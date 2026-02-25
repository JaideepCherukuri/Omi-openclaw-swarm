"""Discord notifications for Mission Control events.

Sends notifications to Discord channels when:
- Task is assigned to an agent
- Task is completed
- Task is auto-promoted
- Agent comes online/offline
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Discord webhook URLs - would ideally come from config
DISCORD_WEBHOOK_URL: str | None = None

# Default channel IDs (should be configured per-board)
DEFAULT_CHANNELS = {
    "task_assigned": "1193849255438319641",  # general channel
    "task_completed": "1193849255438319641",
    "agent_status": "1193849255438319641",
}


def set_webhook_url(url: str | None) -> None:
    """Set the Discord webhook URL (call from app startup)."""
    global DISCORD_WEBHOOK_URL
    DISCORD_WEBHOOK_URL = url


async def notify_task_assigned(
    task_id: UUID,
    title: str,
    agent_name: str,
    agent_id: UUID,
    board_name: str | None = None,
) -> bool:
    """Send notification when task is assigned to agent."""
    embed = {
        "title": "🎯 Task Assigned",
        "description": f"**{title}**",
        "color": 0x3498db,  # Blue
        "fields": [
            {"name": "Agent", "value": agent_name, "inline": True},
            {"name": "Board", "value": board_name or "N/A", "inline": True},
            {"name": "Task ID", "value": str(task_id)[:8], "inline": True},
        ],
        "footer": {"text": "Mission Control"},
    }
    
    return await _send_webhook(embed=embed)


async def notify_task_completed(
    task_id: UUID,
    title: str,
    agent_name: str,
    result_summary: str | None = None,
) -> bool:
    """Send notification when task is completed."""
    embed = {
        "title": "✅ Task Completed",
        "description": f"**{title}**",
        "color": 0x2ecc71,  # Green
        "fields": [
            {"name": "Agent", "value": agent_name, "inline": True},
            {"name": "Task ID", "value": str(task_id)[:8], "inline": True},
        ],
        "footer": {"text": "Mission Control"},
    }
    
    if result_summary:
        embed["fields"].append(
            {"name": "Summary", "value": result_summary[:1000], "inline": False}
        )
    
    return await _send_webhook(embed=embed)


async def notify_agent_online(
    agent_name: str,
    agent_id: UUID,
    current_tasks: int = 0,
) -> bool:
    """Send notification when agent comes online."""
    embed = {
        "title": "🟢 Agent Online",
        "description": f"**{agent_name}** is ready for tasks",
        "color": 0x2ecc71,
        "fields": [
            {"name": "Current Tasks", "value": str(current_tasks), "inline": True},
        ],
        "footer": {"text": "Mission Control"},
    }
    
    return await _send_webhook(embed=embed)


async def notify_agent_offline(
    agent_name: str,
    agent_id: UUID,
) -> bool:
    """Send notification when agent goes offline."""
    embed = {
        "title": "🔴 Agent Offline",
        "description": f"**{agent_name}** is no longer responding",
        "color": 0xe74c3c,
        "footer": {"text": "Mission Control"},
    }
    
    return await _send_webhook(embed=embed)


async def _send_webhook(
    content: str | None = None,
    embed: dict[str, Any] | None = None,
    channel_id: str | None = None,
) -> bool:
    """Send Discord webhook notification."""
    if not DISCORD_WEBHOOK_URL:
        logger.debug("Discord webhook not configured, skipping notification")
        return False
    
    payload: dict[str, Any] = {"username": "Mission Control"}
    
    if content:
        payload["content"] = content
    
    if embed:
        payload["embeds"] = [embed]
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                DISCORD_WEBHOOK_URL,
                json=payload,
                timeout=10.0,
            )
            if response.status_code == 204:
                return True
            else:
                logger.warning(
                    "Discord webhook failed: %s %s",
                    response.status_code,
                    response.text,
                )
                return False
    except Exception as e:
        logger.error("Discord webhook error: %s", e)
        return False
