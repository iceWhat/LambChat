"""Scheduled task execution engine.

Connects APScheduler triggers with the existing BackgroundTaskManager
so that dynamically-created tasks run through the normal agent pipeline.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, Optional

from src.infra.logging import get_logger
from src.infra.scheduler.locks import acquire_task_lock, release_task_lock
from src.infra.scheduler.storage import get_scheduled_task_storage
from src.infra.utils.datetime import utc_now, utc_now_iso
from src.kernel.schemas.scheduled_task import (
    RunStatus,
    ScheduledTask,
    TaskRunRecord,
)

logger = get_logger(__name__)

_POLL_INTERVAL = 2  # seconds between status checks when waiting for completion
_DEFAULT_TIMEOUT = 600  # 10 minutes


class ScheduledTaskRunner:
    """Execute a scheduled task: acquire lock → create record → run agent → record result."""

    async def run(self, task_id: str, trigger_type: str = "cron") -> dict:
        """Entry point for scheduled / manual task execution.

        Returns a dict like ``{"run_id": ..., "status": ..., "result": ...}``.
        """
        storage = get_scheduled_task_storage()
        task = await storage.get_task(task_id)
        if task is None:
            logger.warning("[Runner] task %s not found, skipping", task_id)
            return {"skipped": True, "reason": "task_not_found"}

        if not task.enabled or task.status != "active":
            return {"skipped": True, "reason": "disabled"}

        run_id = str(uuid.uuid4())

        # 1. Acquire distributed lock (multi-instance dedup)
        lock_token = await acquire_task_lock(
            task_id, run_id, ttl=task.timeout_seconds
        )
        if lock_token is None:
            return {
                "skipped": True,
                "reason": "lock_contended",
                "run_id": run_id,
            }

        # 2. Create execution record
        now = utc_now()
        session_id = self._build_session_id(task_id, run_id)
        record = TaskRunRecord(
            _id=run_id,
            task_id=task_id,
            agent_id=task.agent_id,
            trigger_type=trigger_type,
            status=RunStatus.PENDING,
            session_id=session_id,
            input_snapshot=task.input_payload,
            started_at=now,
            created_at=now,
        )
        await storage.create_run(record)

        # 3. Execute
        try:
            await storage.update_run(run_id, {"status": RunStatus.RUNNING})
            result = await self._execute_agent(task, run_id, session_id)

            finished = utc_now()
            duration = int((finished - now).total_seconds() * 1000)
            await storage.update_run(
                run_id,
                {
                    "status": RunStatus.SUCCESS,
                    "output_result": result,
                    "session_id": session_id,
                    "trace_id": result.get("trace_id"),
                    "finished_at": finished,
                    "duration_ms": duration,
                },
            )
            await storage.update_task_run_stats(task_id, run_id, RunStatus.SUCCESS)
            logger.info(
                "[Runner] task=%s run=%s completed in %dms",
                task_id,
                run_id,
                duration,
            )
            return {"run_id": run_id, "status": "success", "result": result}

        except Exception as exc:
            finished = utc_now()
            duration = int((finished - now).total_seconds() * 1000)
            await storage.update_run(
                run_id,
                {
                    "status": RunStatus.FAILED,
                    "error_message": str(exc),
                    "finished_at": finished,
                    "duration_ms": duration,
                },
            )
            await storage.update_task_run_stats(task_id, run_id, RunStatus.FAILED)
            logger.exception(
                "[Runner] task=%s run=%s failed after %dms", task_id, run_id, duration
            )
            raise

        finally:
            await release_task_lock(task_id, lock_token)

    # ── Internal ───────────────────────────────────

    @staticmethod
    def _build_session_id(task_id: str, run_id: str) -> str:
        return f"sch_{task_id}_{run_id[:8]}"

    async def _execute_agent(self, task: ScheduledTask, run_id: str, session_id: str) -> dict:
        """Execute the agent via BackgroundTaskManager in a dedicated session."""
        from src.infra.session.manager import SessionManager
        from src.infra.task.concurrency import get_registered_executor
        from src.infra.task.manager import get_task_manager

        task_manager = get_task_manager()

        # Resolve the agent executor from the registry (registered by chat.py)
        executor_fn = get_registered_executor("agent_stream")
        if executor_fn is None:
            raise RuntimeError(
                "agent_stream executor not registered — "
                "ensure the chat router is loaded before scheduled tasks run"
            )

        message = task.input_payload.get("message", "")
        if not message and task.input_payload.get("prompt"):
            message = task.input_payload["prompt"]

        # Inject current timestamp so the LLM knows the actual execution time.
        # The system prompt tells the LLM that user messages include a timestamp,
        # but scheduled tasks have no user interaction to provide one — we must
        # supply it explicitly.
        message = f"[Current time: {utc_now_iso()}]\n\n{message}"

        _, trace_id = await task_manager.submit(
            session_id=session_id,
            agent_id=task.agent_id,
            message=message,
            user_id=task.owner_id,
            executor=executor_fn,
            run_id=run_id,
            disabled_tools=task.input_payload.get("disabled_tools"),
            agent_options=task.input_payload.get("agent_options"),
            project_id=None,
            session_name=f"[Scheduled] {task.name}",
            write_user_message_immediately=True,
        )
        await SessionManager().update_session_metadata(
            session_id,
            {
                "source": "scheduled_task",
                "scheduled_task_id": task.id,
                "scheduled_task_run_id": run_id,
                "hidden_from_conversation_list": True,
            },
        )

        result = await self._wait_for_completion(
            task_manager, session_id, task.timeout_seconds
        )
        result["session_id"] = session_id
        result["trace_id"] = trace_id
        return result

    async def _wait_for_completion(
        self,
        task_manager: Any,
        session_id: str,
        timeout_seconds: int = _DEFAULT_TIMEOUT,
    ) -> dict:
        """Poll task status until completion or timeout."""
        from src.infra.task.status import TaskStatus as TS

        start = time.monotonic()
        while time.monotonic() - start < timeout_seconds:
            status = await task_manager.get_status(session_id)
            if status in (TS.COMPLETED, TS.FAILED, TS.CANCELLED):
                return {"session_status": status.value if hasattr(status, "value") else str(status)}
            await asyncio.sleep(_POLL_INTERVAL)

        return {"session_status": "timeout"}


# ── Singleton ──────────────────────────────────────

_runner: Optional[ScheduledTaskRunner] = None


def get_scheduled_task_runner() -> ScheduledTaskRunner:
    global _runner
    if _runner is None:
        _runner = ScheduledTaskRunner()
    return _runner
