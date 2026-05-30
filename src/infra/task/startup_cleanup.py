from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Awaitable, Callable

from src.infra.logging import get_logger

from .status import TaskStatus

logger = get_logger(__name__)


def _task_metadata(session: dict[str, Any], session_model: Any) -> dict[str, Any]:
    raw_metadata = session.get("metadata") if isinstance(session, dict) else {}
    model_metadata = getattr(session_model, "metadata", None) or {}
    return {
        **(raw_metadata if isinstance(raw_metadata, dict) else {}),
        **(model_metadata if isinstance(model_metadata, dict) else {}),
    }


def _is_user_cancelled_task(metadata: dict[str, Any]) -> bool:
    return (
        metadata.get("task_error_code") == "cancelled"
        or metadata.get("task_status") == TaskStatus.CANCELLED.value
    )


def _is_latest_run(
    metadata: dict[str, Any],
    run_id: str,
) -> bool:
    """Only reconcile the run that is still recorded as current for the session."""
    current_run_id = metadata.get("current_run_id")
    return current_run_id is not None and str(current_run_id) == str(run_id)


def _is_latest_explicit_system_restart_failure(
    metadata: dict[str, Any],
    run_id: str,
) -> bool:
    """Only auto-recover failed runs when shutdown was explicitly recorded."""
    return (
        _is_latest_run(metadata, run_id)
        and metadata.get("task_status") == TaskStatus.FAILED.value
        and metadata.get("task_recoverable") is True
        and metadata.get("task_error_code") == "server_restart"
    )


class TaskStartupCleanupService:
    """Handles startup reconciliation for stale and queued tasks."""

    def __init__(
        self,
        *,
        storage: Any,
        heartbeat: Any,
        ensure_executor: Callable[[], Any],
        load_session_record: Callable[[dict[str, Any]], Awaitable[Any | None]],
        resume_interrupted_run: Callable[[Any, str, str], Awaitable[dict[str, Any]]],
        replay_pending_queued_tasks: Callable[[], Awaitable[None]] | None = None,
        cleanup_stale_queues: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._storage = storage
        self._heartbeat = heartbeat
        self._ensure_executor = ensure_executor
        self._load_session_record = load_session_record
        self._resume_interrupted_run = resume_interrupted_run
        self._replay_pending_queued_tasks_cb = replay_pending_queued_tasks
        self._cleanup_stale_queues_cb = cleanup_stale_queues

    async def cleanup_stale_tasks(self) -> None:
        """
        Recover stale active tasks and explicitly recoverable failed tasks after restart.
        """
        from .concurrency import get_concurrency_limiter

        limiter = get_concurrency_limiter()
        redis = limiter.redis

        try:
            # --- RUNNING tasks ---
            cursor = self._storage.collection.find(
                {"metadata.task_status": TaskStatus.RUNNING.value}
            )
            running_sessions = await cursor.to_list(length=1000)

            cleaned_count = 0

            # Phase 1: load session records in parallel
            load_tasks = [self._load_session_record(session) for session in running_sessions]
            session_models = await asyncio.gather(*load_tasks)

            candidates: list[tuple[Any, str, dict[str, Any], str]] = []
            for session, session_model in zip(running_sessions, session_models):
                if session_model is None:
                    continue
                session_id = session_model.id
                metadata = _task_metadata(session, session_model)
                run_id = session.get("metadata", {}).get("current_run_id") or metadata.get(
                    "current_run_id"
                )
                if not run_id:
                    continue
                if _is_user_cancelled_task(metadata):
                    logger.info(
                        "Skipping user-cancelled RUNNING task during startup recovery: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    continue
                if not _is_latest_run(metadata, run_id):
                    logger.debug(
                        "Skipping non-current RUNNING task during startup recovery: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    continue
                candidates.append((session_model, session_id, metadata, run_id))

            # Phase 2: batch heartbeat checks in parallel
            if candidates:
                heartbeat_results = await asyncio.gather(
                    *(self._heartbeat.check_exists(run_id) for _, _, _, run_id in candidates)
                )
                for (
                    session_model,
                    session_id,
                    metadata,
                    run_id,
                ), heartbeat_exists in zip(candidates, heartbeat_results):
                    if heartbeat_exists:
                        logger.debug(
                            "Task still running on another instance: session=%s, run_id=%s",
                            session_id,
                            run_id,
                        )
                        continue

                    logger.warning(
                        "Cleaning up stale RUNNING task (no heartbeat): session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    recovery_result = await self._resume_interrupted_run(
                        session_model,
                        run_id,
                        "server_restart",
                    )
                    if recovery_result.get("success"):
                        logger.info(
                            "Recovered stale RUNNING task: session=%s, old_run=%s, new_run=%s",
                            session_id,
                            run_id,
                            recovery_result.get("run_id"),
                        )
                    else:
                        logger.warning(
                            "Failed to auto-recover stale RUNNING task %s: %s",
                            run_id,
                            recovery_result.get("message"),
                        )
                    cleaned_count += 1

            # --- PENDING / QUEUED tasks ---
            cursor = self._storage.collection.find(
                {
                    "metadata.task_status": {
                        "$in": [TaskStatus.PENDING.value, TaskStatus.QUEUED.value]
                    }
                }
            )
            pending_sessions = await cursor.to_list(length=1000)

            # Phase 1: load session records in parallel
            pending_load_tasks = [
                self._load_session_record(session) for session in pending_sessions
            ]
            pending_models = await asyncio.gather(*pending_load_tasks)

            pending_candidates: list[tuple[Any, str, dict[str, Any], str, str]] = []
            for session, session_model in zip(pending_sessions, pending_models):
                if session_model is None:
                    continue
                session_id = session_model.id
                metadata = _task_metadata(session, session_model)
                run_id = session.get("metadata", {}).get("current_run_id") or metadata.get(
                    "current_run_id"
                )
                user_id = session.get("user_id")
                if not run_id or not user_id:
                    continue
                if _is_user_cancelled_task(metadata):
                    logger.info(
                        "Skipping user-cancelled PENDING task during startup recovery: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    continue
                if not _is_latest_run(metadata, run_id):
                    logger.debug(
                        "Skipping non-current PENDING task during startup recovery: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    continue
                pending_candidates.append((session_model, session_id, metadata, run_id, user_id))

            # Phase 2: batch Redis active-set checks in parallel
            if pending_candidates:
                active_results = await asyncio.gather(
                    *(
                        redis.zscore(f"chat:active:{user_id}", run_id)
                        for _, _, _, run_id, user_id in pending_candidates
                    )
                )
                # Filter to only those in the active set
                active_candidates = [
                    cand
                    for cand, score in zip(pending_candidates, active_results)
                    if score is not None
                ]

                # Phase 3: batch heartbeat checks for active candidates
                if active_candidates:
                    heartbeat_results = await asyncio.gather(
                        *(
                            self._heartbeat.check_exists(run_id)
                            for _, _, _, run_id, _ in active_candidates
                        )
                    )
                    for (
                        session_model,
                        session_id,
                        metadata,
                        run_id,
                        user_id,
                    ), heartbeat_exists in zip(active_candidates, heartbeat_results):
                        if heartbeat_exists:
                            logger.debug(
                                "Pending task still in active set (running elsewhere): session=%s, run_id=%s",
                                session_id,
                                run_id,
                            )
                            continue

                        logger.warning(
                            "Cleaning up stale PENDING task (in active set, no heartbeat): session=%s, run_id=%s",
                            session_id,
                            run_id,
                        )
                        recovery_result = await self._resume_interrupted_run(
                            session_model,
                            run_id,
                            "server_restart",
                        )
                        if recovery_result.get("success"):
                            logger.info(
                                "Recovered stale PENDING task: session=%s, old_run=%s, new_run=%s",
                                session_id,
                                run_id,
                                recovery_result.get("run_id"),
                            )
                        else:
                            logger.warning(
                                "Failed to auto-recover stale PENDING task %s: %s",
                                run_id,
                                recovery_result.get("message"),
                            )
                        cleaned_count += 1

            # --- FAILED recoverable tasks ---
            cursor = self._storage.collection.find(
                {
                    "metadata.task_status": TaskStatus.FAILED.value,
                    "metadata.task_recoverable": True,
                    "metadata.task_error_code": "server_restart",
                }
            )
            failed_recoverable_sessions = await cursor.to_list(length=1000)

            # Phase 1: load session records in parallel
            failed_load_tasks = [
                self._load_session_record(session) for session in failed_recoverable_sessions
            ]
            failed_models = await asyncio.gather(*failed_load_tasks)

            failed_candidates: list[tuple[Any, str, dict[str, Any], str]] = []
            for session, session_model in zip(failed_recoverable_sessions, failed_models):
                if session_model is None:
                    continue
                session_id = session_model.id
                run_id = session.get("metadata", {}).get("current_run_id")
                if not run_id:
                    continue
                metadata = _task_metadata(session, session_model)
                if not _is_latest_explicit_system_restart_failure(metadata, run_id):
                    logger.debug(
                        "Skipping unmarked FAILED task during startup recovery: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    continue
                failed_candidates.append((session_model, session_id, metadata, run_id))

            # Phase 2: batch heartbeat checks in parallel
            if failed_candidates:
                failed_heartbeat_results = await asyncio.gather(
                    *(self._heartbeat.check_exists(run_id) for _, _, _, run_id in failed_candidates)
                )
                for (
                    session_model,
                    session_id,
                    metadata,
                    run_id,
                ), heartbeat_exists in zip(failed_candidates, failed_heartbeat_results):
                    if heartbeat_exists:
                        logger.debug(
                            "Recoverable failed task still has heartbeat: session=%s, run_id=%s",
                            session_id,
                            run_id,
                        )
                        continue

                    logger.warning(
                        "Recovering failed-but-recoverable task: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    recovery_result = await self._resume_interrupted_run(
                        session_model,
                        run_id,
                        "server_restart",
                    )
                    if recovery_result.get("success"):
                        logger.info(
                            "Recovered failed task: session=%s, old_run=%s, new_run=%s",
                            session_id,
                            run_id,
                            recovery_result.get("run_id"),
                        )
                    else:
                        logger.warning(
                            "Failed to auto-recover failed task %s: %s",
                            run_id,
                            recovery_result.get("message"),
                        )
                    cleaned_count += 1

            if cleaned_count > 0:
                logger.info("Cleaned up %s stale tasks without heartbeat", cleaned_count)

            await self.replay_pending_queued_tasks()
            await self.cleanup_stale_queues()
        except Exception as e:
            logger.error("Failed to cleanup stale tasks: %s", e)

    async def cleanup_stale_queues(self) -> None:
        """Drop queue entries that have exceeded the concurrency queue timeout."""
        if self._cleanup_stale_queues_cb is not None:
            await self._cleanup_stale_queues_cb()
            return

        try:
            from .concurrency import QUEUE_TIMEOUT, get_concurrency_limiter

            limiter = get_concurrency_limiter()
            redis = limiter.redis

            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor=cursor, match="chat:queue:*", count=100)
                for key in keys:
                    entries = await redis.lrange(key, 0, -1)
                    valid = []
                    expired = 0
                    for entry in entries:
                        data = json.loads(entry)
                        if time.time() - data.get("queued_at", 0) > QUEUE_TIMEOUT:
                            expired += 1
                        else:
                            valid.append(entry)
                    if expired:
                        await redis.delete(key)
                        if valid:
                            await redis.rpush(key, *valid)
                        logger.info("Cleaned %s expired queue entries from %s", expired, key)
                if cursor == 0:
                    break
        except Exception as e:
            logger.warning("Failed to cleanup stale queues: %s", e)

    async def replay_pending_queued_tasks(self) -> None:
        """Replay latest queued tasks that still have Redis queue entries."""
        if self._replay_pending_queued_tasks_cb is not None:
            await self._replay_pending_queued_tasks_cb()
            return

        try:
            from .concurrency import get_concurrency_limiter

            limiter = get_concurrency_limiter()
            redis = limiter.redis

            cursor = self._storage.collection.find(
                {
                    "metadata.task_status": {
                        "$in": [TaskStatus.PENDING.value, TaskStatus.QUEUED.value]
                    }
                }
            )
            pending_sessions = await cursor.to_list(length=1000)

            replayed = 0
            abandoned = 0

            for session in pending_sessions:
                session_model = await self._load_session_record(session)
                if session_model is None:
                    continue
                session_id = session_model.id
                metadata = _task_metadata(session, session_model)
                run_id = session.get("metadata", {}).get("current_run_id") or metadata.get(
                    "current_run_id"
                )
                user_id = session.get("user_id")
                if not run_id or not user_id:
                    continue
                if _is_user_cancelled_task(metadata):
                    logger.info(
                        "Skipping user-cancelled queued task replay during startup recovery: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    continue

                if not _is_latest_run(metadata, run_id):
                    logger.debug(
                        "Skipping non-current queued task replay during startup recovery: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    continue

                queue_key = f"chat:queue:{user_id}"
                entries = await redis.lrange(queue_key, 0, -1)
                queue_entry = None
                for entry in entries:
                    data = json.loads(entry)
                    if data.get("run_id") == run_id:
                        queue_entry = data
                        break

                if queue_entry:
                    logger.info(
                        "Replaying queued task on startup: session=%s, run_id=%s",
                        session_id,
                        run_id,
                    )
                    try:
                        await limiter.release(user_id, run_id)
                        replayed += 1
                    except Exception as e:
                        logger.warning("Failed to replay queued task %s: %s", run_id, e)
                else:
                    active_key = f"chat:active:{user_id}"
                    in_active = await redis.zscore(active_key, run_id) is not None
                    heartbeat_exists = await self._heartbeat.check_exists(run_id)

                    if in_active or heartbeat_exists:
                        logger.debug(
                            "Pending task still active or running elsewhere: session=%s, run_id=%s",
                            session_id,
                            run_id,
                        )
                    else:
                        logger.warning(
                            "Abandoned queued task (no queue entry, no active, no heartbeat): session=%s, run_id=%s",
                            session_id,
                            run_id,
                        )
                        recovery_result = await self._resume_interrupted_run(
                            session_model,
                            run_id,
                            "server_restart",
                        )
                        if recovery_result.get("success"):
                            logger.info(
                                "Recovered abandoned queued task: session=%s, old_run=%s, new_run=%s",
                                session_id,
                                run_id,
                                recovery_result.get("run_id"),
                            )
                        else:
                            executor = self._ensure_executor()
                            await executor._update_session_status(
                                session_id,
                                TaskStatus.EXPIRED,
                                "Task abandoned (server restarted while queued)",
                                run_id=run_id,
                            )
                            abandoned += 1

            if replayed > 0:
                logger.info("Replayed %s queued tasks on startup", replayed)
            if abandoned > 0:
                logger.warning("Marked %s abandoned queued tasks as EXPIRED", abandoned)
        except Exception as e:
            logger.error("Failed to replay pending queued tasks: %s", e)
