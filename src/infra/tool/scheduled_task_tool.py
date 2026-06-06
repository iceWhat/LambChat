"""LLM-callable scheduled task tools.

Internal tools for creating and managing scheduled tasks, following the same
pattern as persona_preset_tool.py and sandbox_mcp_tool.py.
Each CRUD operation is a separate @tool function.
"""

import json
import sys
from typing import TYPE_CHECKING, Annotated, Any, Optional

from langchain_core.tools import BaseTool, InjectedToolArg

from src.api.routes.human import create_approval, wait_for_response
from src.infra.logging import get_logger
from src.infra.role.storage import RoleStorage
from src.infra.scheduler.service import ScheduledTaskService
from src.infra.tool.backend_utils import get_user_id_from_runtime
from src.infra.user.storage import UserStorage
from src.kernel.schemas.scheduled_task import (
    ScheduledTaskCreate,
    ScheduledTaskStatus,
    ScheduledTaskUpdate,
    TriggerType,
)
from src.kernel.schemas.user import TokenPayload
from src.kernel.types import Permission

if TYPE_CHECKING:
    from langchain.tools import ToolRuntime
else:
    try:
        from langchain.tools import ToolRuntime  # type: ignore[assignment]
    except ImportError:  # pragma: no cover
        _mod = type(sys)("langchain.tools")  # type: ignore[assignment]
        _mod.ToolRuntime = Any  # type: ignore[assignment]
        sys.modules.setdefault("langchain.tools", _mod)
        from langchain.tools import ToolRuntime  # type: ignore[assignment]

from langchain.tools import tool  # noqa: E402

logger = get_logger(__name__)


def _json(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


async def _resolve_user(user_id: str) -> TokenPayload | None:
    """Resolve the latest roles and permissions for a user ID."""
    user = await UserStorage().get_by_id(user_id)
    if not user:
        return None

    role_storage = RoleStorage()
    roles = await role_storage.get_by_names(user.roles or [])

    permissions: set[str] = set()
    for role in roles:
        for permission in role.permissions:
            permissions.add(
                permission if isinstance(permission, str) else permission.value
            )

    return TokenPayload(
        sub=user.id,
        username=user.username,
        roles=[r.name for r in roles],
        permissions=sorted(permissions),
    )


async def _permission_error(
    user_id: str,
    permission: str,
) -> dict[str, Any] | None:
    user = await _resolve_user(user_id)
    if user and permission in set(user.permissions or []):
        return None
    return {
        "error": f"Missing permission: {permission}",
        "code": "permission_denied",
    }


def _format_trigger_preview(trigger_type: TriggerType, trigger_config: dict[str, Any]) -> str:
    if trigger_type == TriggerType.INTERVAL:
        seconds = int(trigger_config["seconds"])
        if seconds % 86400 == 0:
            return f"every {seconds // 86400} day(s)"
        if seconds % 3600 == 0:
            return f"every {seconds // 3600} hour(s)"
        if seconds % 60 == 0:
            return f"every {seconds // 60} minute(s)"
        return f"every {seconds} second(s)"

    minute = trigger_config.get("minute", "0")
    hour = trigger_config.get("hour", "0")
    day = trigger_config.get("day", "*")
    month = trigger_config.get("month", "*")
    day_of_week = trigger_config.get("day_of_week", "*")
    return (
        "cron schedule "
        f"(minute={minute}, hour={hour}, day={day}, month={month}, day_of_week={day_of_week}, UTC)"
    )


def _build_task_preview(
    *,
    name: str,
    message: str,
    trigger_type: TriggerType,
    trigger_config: dict[str, Any],
    agent_id: str,
    description: str | None,
    timeout_seconds: int,
    run_on_start: bool,
) -> dict[str, Any]:
    schedule = _format_trigger_preview(trigger_type, trigger_config)
    return {
        "name": name,
        "description": description,
        "agent_id": agent_id,
        "trigger_type": trigger_type.value,
        "trigger_config": trigger_config,
        "schedule": schedule,
        "message": message,
        "timeout_seconds": timeout_seconds,
        "run_on_start": run_on_start,
        "effect": (
            f"After creation, agent '{agent_id}' will run on {schedule}. "
            f"Each run will start a new session and send this prompt to the agent: {message!r}."
            + (" The task will also run immediately after creation." if run_on_start else "")
        ),
    }


def _format_approval_message(preview: dict[str, Any]) -> str:
    description = preview.get("description") or "(none)"
    immediate = "yes" if preview["run_on_start"] else "no"
    return (
        "Please confirm creation of this scheduled task.\n\n"
        "No scheduled task has been created yet. If you approve, the task below will be created.\n\n"
        f"**Name:** {preview['name']}\n\n"
        f"**Description:** {description}\n\n"
        f"**Agent:** {preview['agent_id']}\n\n"
        f"**Schedule:** {preview['schedule']}\n\n"
        f"**Immediate run after creation:** {immediate}\n\n"
        f"**Timeout:** {preview['timeout_seconds']} seconds\n\n"
        "**Execution effect:**\n\n"
        f"{preview['effect']}\n\n"
        "**Prompt sent on each run:**\n\n"
        f"```text\n{preview['message']}\n```"
    )


async def _send_scheduled_task_approval_event(
    *,
    approval_id: str,
    message: str,
    session_id: str | None,
    run_id: str | None,
    timeout: int,
) -> None:
    if not session_id:
        logger.warning("[ScheduledTask] Cannot send approval event: no session_id")
        return

    try:
        from src.infra.session.dual_writer import get_dual_writer

        await get_dual_writer().write_event(
            session_id=session_id,
            event_type="approval_required",
            data={
                "id": approval_id,
                "message": message,
                "type": "confirm",
                "fields": [],
                "timeout": timeout,
            },
            run_id=run_id,
        )
    except Exception as e:
        logger.error("[ScheduledTask] Failed to send approval event: %s", e, exc_info=True)


async def _confirm_scheduled_task_creation(
    *,
    preview: dict[str, Any],
    user_id: str,
    timeout: int = 300,
) -> dict[str, Any]:
    """Create a human-in-the-loop confirmation and wait for the user's decision."""
    from src.infra.logging.context import TraceContext

    ctx = TraceContext.get_request_context()
    approval_message = _format_approval_message(preview)
    approval = await create_approval(
        message=approval_message,
        approval_type="confirm",
        fields=[],
        session_id=ctx.session_id or None,
        user_id=user_id,
    )
    await _send_scheduled_task_approval_event(
        approval_id=approval.id,
        message=approval_message,
        session_id=ctx.session_id or None,
        run_id=ctx.run_id or None,
        timeout=timeout,
    )

    response = await wait_for_response(approval.id, timeout=timeout)
    if response is None:
        return {
            "approved": False,
            "status": "timeout",
            "approval_id": approval.id,
            "message": f"Scheduled task creation timed out waiting for user confirmation ({timeout}s).",
        }
    if not response.approved:
        return {
            "approved": False,
            "status": "rejected",
            "approval_id": approval.id,
            "message": "User rejected scheduled task creation.",
        }
    return {
        "approved": True,
        "status": "approved",
        "approval_id": approval.id,
    }


# ── Tool implementations ───────────────────────────────────────


@tool
async def scheduled_task_create(
    name: Annotated[str, "Task name, e.g. 'Daily Report', 'Cache Cleanup'"],
    message: Annotated[
        str,
        "The message sent to the agent when this task fires. "
        "Write clear, specific instructions for what the agent should do. "
        "Example: 'Generate a summary of today's conversations and save it to memory.'",
    ],
    trigger_type: Annotated[
        str,
        "Trigger type: 'interval' (fixed interval) or 'cron' (cron expression)",
    ],
    interval_seconds: Annotated[
        int | None,
        "Interval in seconds. Required when trigger_type='interval'. "
        "Examples: 300 (5min), 3600 (1h), 86400 (1d). Minimum: 60.",
    ] = None,
    cron_hour: Annotated[
        str | None,
        "Cron hour pattern (0-23). Only used when trigger_type='cron'. "
        "Examples: '9' (9 AM), '0,12' (midnight and noon), '*/3' (every 3 hours). "
        "Time is in UTC.",
    ] = None,
    cron_minute: Annotated[
        str | None,
        "Cron minute pattern (0-59). Only used when trigger_type='cron'. "
        "Examples: '0' (on the hour), '30' (half past). Default: '0'.",
    ] = None,
    cron_day_of_week: Annotated[
        str | None,
        "Cron day-of-week pattern. Only used when trigger_type='cron'. "
        "Examples: 'mon-fri' (weekdays), '1-5' (same), 'mon,wed,fri'. Default: every day.",
    ] = None,
    cron_day: Annotated[
        str | None,
        "Cron day-of-month pattern (1-31). Only used when trigger_type='cron'. "
        "Examples: '1' (1st of month), '1,15' (1st and 15th). Default: every day.",
    ] = None,
    cron_month: Annotated[
        str | None,
        "Cron month pattern (1-12). Only used when trigger_type='cron'. Default: every month.",
    ] = None,
    agent_id: Annotated[
        str,
        "Agent ID to execute. Usually 'fast'.",
    ] = "fast",
    description: Annotated[
        str | None,
        "Optional description of what this task does",
    ] = None,
    timeout_seconds: Annotated[
        int,
        "Maximum execution time in seconds. Range: 10-3600. Default: 600 (10 min).",
    ] = 600,
    run_on_start: Annotated[
        bool,
        "Whether to run the task immediately after creation",
    ] = False,
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Create a scheduled task that automatically runs an agent at specified times.
    The agent will receive the 'message' as a user prompt on each execution.
    Use trigger_type='interval' for periodic tasks (e.g. every 5 minutes),
    or trigger_type='cron' for calendar-based schedules (e.g. every weekday at 9 AM UTC).
    Each run creates a new session under the user's account.
    Before creation, this tool shows the user a preview of the execution effect
    and waits for explicit human confirmation."""
    user_id = get_user_id_from_runtime(runtime)
    if not user_id:
        return _json({"error": "No user context available"})
    error = await _permission_error(user_id, Permission.SCHEDULED_TASK_WRITE.value)
    if error:
        return _json(error)

    # Build trigger_config from structured params
    try:
        trigger_enum = TriggerType(trigger_type)
    except ValueError:
        return _json({"error": f"Invalid trigger_type '{trigger_type}'. Use 'interval' or 'cron'."})

    if trigger_enum == TriggerType.INTERVAL:
        if not interval_seconds:
            return _json({"error": "interval_seconds is required when trigger_type='interval'"})
        if interval_seconds < 60:
            return _json({"error": "interval_seconds must be at least 60"})
        trigger_config = {"seconds": interval_seconds}
    else:
        # Cron trigger — at least one cron field should be provided
        trigger_config: dict[str, Any] = {}
        if cron_hour is not None:
            trigger_config["hour"] = cron_hour
        if cron_minute is not None:
            trigger_config["minute"] = cron_minute
        if cron_day_of_week is not None:
            trigger_config["day_of_week"] = cron_day_of_week
        if cron_day is not None:
            trigger_config["day"] = cron_day
        if cron_month is not None:
            trigger_config["month"] = cron_month
        # Provide sensible defaults if nothing specified
        if "hour" not in trigger_config:
            trigger_config["hour"] = "0"
        if "minute" not in trigger_config:
            trigger_config["minute"] = "0"

    preview = _build_task_preview(
        name=name,
        message=message,
        trigger_type=trigger_enum,
        trigger_config=trigger_config,
        agent_id=agent_id,
        description=description,
        timeout_seconds=timeout_seconds,
        run_on_start=run_on_start,
    )
    confirmation = await _confirm_scheduled_task_creation(preview=preview, user_id=user_id)
    if not confirmation["approved"]:
        return _json(
            {
                "success": False,
                "action": "not_created",
                "reason": confirmation["status"],
                "approval_id": confirmation["approval_id"],
                "preview": preview,
                "message": confirmation["message"],
            }
        )

    service = ScheduledTaskService()
    from src.infra.logging.context import TraceContext

    ctx = TraceContext.get_request_context()
    try:
        task = await service.create_task(
            request=ScheduledTaskCreate(
                name=name,
                agent_id=agent_id,
                trigger_type=trigger_enum,
                trigger_config=trigger_config,
                input_payload={"message": message},
                description=description,
                timeout_seconds=timeout_seconds,
                run_on_start=run_on_start,
                source_session_id=ctx.session_id or None,
                source_run_id=ctx.run_id or None,
                created_by="agent",
            ),
            owner_id=user_id,
        )
    except Exception as e:
        return _json({"error": f"Failed to create task: {e}"})

    resp = ScheduledTaskService.to_response(task)
    return _json(
        {
            "success": True,
            "action": "created",
            "task": resp.model_dump(mode="json"),
            "preview": preview,
            "approval_id": confirmation["approval_id"],
            "message": (
                f"Scheduled task '{task.name}' created "
                f"(trigger: {trigger_type}, id: {task.id})."
            ),
        }
    )


@tool
async def scheduled_task_list(
    status: Annotated[
        str | None,
        "Filter by status: 'active', 'paused', or omit to list all",
    ] = None,
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """List all scheduled tasks owned by the current user.
    Optionally filter by status ('active' or 'paused')."""
    user_id = get_user_id_from_runtime(runtime)
    if not user_id:
        return _json({"error": "No user context available"})
    error = await _permission_error(user_id, Permission.SCHEDULED_TASK_READ.value)
    if error:
        return _json(error)

    status_enum: Optional[ScheduledTaskStatus] = None
    if status:
        try:
            status_enum = ScheduledTaskStatus(status)
        except ValueError:
            return _json({"error": f"Invalid status '{status}'. Use 'active', 'paused', or 'deleted'."})

    service = ScheduledTaskService()
    try:
        tasks = await service.list_tasks(owner_id=user_id, status=status_enum)
    except Exception as e:
        return _json({"error": f"Failed to list tasks: {e}"})

    items = [ScheduledTaskService.to_response(t).model_dump(mode="json") for t in tasks]
    return _json(
        {
            "success": True,
            "tasks": items,
            "total": len(items),
        }
    )


@tool
async def scheduled_task_get(
    task_id: Annotated[str, "ID of the scheduled task"],
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Get detailed information about a specific scheduled task, including its
    last run status, total runs, and trigger configuration."""
    user_id = get_user_id_from_runtime(runtime)
    if not user_id:
        return _json({"error": "No user context available"})
    error = await _permission_error(user_id, Permission.SCHEDULED_TASK_READ.value)
    if error:
        return _json(error)

    service = ScheduledTaskService()
    try:
        task = await service.get_task(task_id)
    except Exception as e:
        return _json({"error": f"Failed to get task: {e}"})

    if task is None:
        return _json({"error": f"Task '{task_id}' not found"})

    if task.owner_id != user_id:
        return _json({"error": f"Task '{task_id}' not found"})

    resp = ScheduledTaskService.to_response(task)
    return _json(
        {
            "success": True,
            "task": resp.model_dump(mode="json"),
        }
    )


@tool
async def scheduled_task_update(
    task_id: Annotated[str, "ID of the task to update"],
    name: Annotated[str | None, "New task name"] = None,
    message: Annotated[str | None, "New message to send to the agent on each execution"] = None,
    description: Annotated[str | None, "New description"] = None,
    enabled: Annotated[bool | None, "Enable or disable the task"] = None,
    timeout_seconds: Annotated[int | None, "New timeout in seconds (10-3600)"] = None,
    max_retries: Annotated[int | None, "Max retry count on failure (0-10)"] = None,
    trigger_config: Annotated[
        dict | None,
        "Full replacement trigger config. "
        "For interval: {\"seconds\": 300}. "
        "For cron: {\"hour\": \"9\", \"minute\": \"0\", \"day_of_week\": \"mon-fri\"}. "
        "WARNING: This replaces the entire trigger config. "
        "Use scheduled_task_create to change trigger_type.",
    ] = None,
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Update an existing scheduled task. Pass only the fields you want to change.
    To change the trigger_type, delete the task and create a new one."""
    user_id = get_user_id_from_runtime(runtime)
    if not user_id:
        return _json({"error": "No user context available"})
    error = await _permission_error(user_id, Permission.SCHEDULED_TASK_WRITE.value)
    if error:
        return _json(error)

    # Verify ownership first
    service = ScheduledTaskService()
    task = await service.get_task(task_id)
    if task is None:
        return _json({"error": f"Task '{task_id}' not found"})
    if task.owner_id != user_id:
        return _json({"error": f"Task '{task_id}' not found"})

    # Build update payload
    updates: dict[str, Any] = {}
    if name is not None:
        updates["name"] = name
    if message is not None:
        updates["input_payload"] = {"message": message}
    if description is not None:
        updates["description"] = description
    if enabled is not None:
        updates["enabled"] = enabled
    if timeout_seconds is not None:
        updates["timeout_seconds"] = timeout_seconds
    if max_retries is not None:
        updates["max_retries"] = max_retries
    if trigger_config is not None:
        updates["trigger_config"] = trigger_config

    if not updates:
        return _json({"error": "At least one field to update is required"})

    try:
        updated = await service.update_task(
            task_id,
            ScheduledTaskUpdate(**updates),
        )
    except Exception as e:
        return _json({"error": f"Failed to update task: {e}"})

    if updated is None:
        return _json({"error": f"Task '{task_id}' update failed"})

    resp = ScheduledTaskService.to_response(updated)
    return _json(
        {
            "success": True,
            "action": "updated",
            "task": resp.model_dump(mode="json"),
            "message": f"Task '{updated.name}' updated.",
        }
    )


@tool
async def scheduled_task_pause(
    task_id: Annotated[str, "ID of the task to pause"],
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Pause a scheduled task. The task will not fire until resumed.
    Configuration is preserved and the task can be resumed at any time."""
    user_id = get_user_id_from_runtime(runtime)
    if not user_id:
        return _json({"error": "No user context available"})
    error = await _permission_error(user_id, Permission.SCHEDULED_TASK_WRITE.value)
    if error:
        return _json(error)

    service = ScheduledTaskService()
    task = await service.get_task(task_id)
    if task is None:
        return _json({"error": f"Task '{task_id}' not found"})
    if task.owner_id != user_id:
        return _json({"error": f"Task '{task_id}' not found"})

    try:
        updated = await service.pause_task(task_id)
    except Exception as e:
        return _json({"error": f"Failed to pause task: {e}"})

    if updated is None:
        return _json({"error": f"Task '{task_id}' pause failed"})
    return _json(
        {
            "success": True,
            "action": "paused",
            "task_id": task_id,
            "name": updated.name,
            "message": f"Task '{updated.name}' paused.",
        }
    )


@tool
async def scheduled_task_resume(
    task_id: Annotated[str, "ID of the task to resume"],
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Resume a paused scheduled task. It will resume firing according to its schedule."""
    user_id = get_user_id_from_runtime(runtime)
    if not user_id:
        return _json({"error": "No user context available"})
    error = await _permission_error(user_id, Permission.SCHEDULED_TASK_WRITE.value)
    if error:
        return _json(error)

    service = ScheduledTaskService()
    task = await service.get_task(task_id)
    if task is None:
        return _json({"error": f"Task '{task_id}' not found"})
    if task.owner_id != user_id:
        return _json({"error": f"Task '{task_id}' not found"})

    try:
        updated = await service.resume_task(task_id)
    except Exception as e:
        return _json({"error": f"Failed to resume task: {e}"})

    if updated is None:
        return _json({"error": f"Task '{task_id}' resume failed"})
    return _json(
        {
            "success": True,
            "action": "resumed",
            "task_id": task_id,
            "name": updated.name,
            "message": f"Task '{updated.name}' resumed.",
        }
    )


@tool
async def scheduled_task_delete(
    task_id: Annotated[str, "ID of the task to delete"],
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Delete a scheduled task. This is a soft delete — the task is marked as deleted
    and will no longer appear in listings or fire."""
    user_id = get_user_id_from_runtime(runtime)
    if not user_id:
        return _json({"error": "No user context available"})
    error = await _permission_error(user_id, Permission.SCHEDULED_TASK_DELETE.value)
    if error:
        return _json(error)

    service = ScheduledTaskService()
    task = await service.get_task(task_id)
    if task is None:
        return _json({"error": f"Task '{task_id}' not found"})
    if task.owner_id != user_id:
        return _json({"error": f"Task '{task_id}' not found"})

    try:
        deleted = await service.delete_task(task_id)
    except Exception as e:
        return _json({"error": f"Failed to delete task: {e}"})

    if not deleted:
        return _json({"error": f"Task '{task_id}' delete failed"})
    return _json(
        {
            "success": True,
            "action": "deleted",
            "task_id": task_id,
            "message": f"Task '{task.name}' deleted.",
        }
    )


@tool
async def scheduled_task_run(
    task_id: Annotated[str, "ID of the task to trigger manually"],
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Manually trigger a scheduled task to run once immediately, regardless of its schedule.
    Useful for testing or ad-hoc execution."""
    user_id = get_user_id_from_runtime(runtime)
    if not user_id:
        return _json({"error": "No user context available"})
    error = await _permission_error(user_id, Permission.SCHEDULED_TASK_WRITE.value)
    if error:
        return _json(error)

    service = ScheduledTaskService()
    task = await service.get_task(task_id)
    if task is None:
        return _json({"error": f"Task '{task_id}' not found"})
    if task.owner_id != user_id:
        return _json({"error": f"Task '{task_id}' not found"})

    try:
        result = await service.run_task_now(task_id)
    except Exception as e:
        return _json({"error": f"Failed to run task: {e}"})

    return _json(
        {
            "success": True,
            "action": "triggered",
            "task_id": task_id,
            "name": task.name,
            "result": result,
            "message": f"Task '{task.name}' triggered manually.",
        }
    )


# ── Public API ─────────────────────────────────────────────────


def get_scheduled_task_tools() -> list[BaseTool]:
    """Return scheduled task CRUD tools for the current user."""
    return [
        scheduled_task_create,
        scheduled_task_list,
        scheduled_task_get,
        scheduled_task_update,
        scheduled_task_pause,
        scheduled_task_resume,
        scheduled_task_delete,
        scheduled_task_run,
    ]
