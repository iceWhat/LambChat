from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import pytest

from src.infra.scheduler import storage as storage_module
from src.infra.scheduler.storage import ScheduledTaskStorage
from src.kernel.schemas.scheduled_task import ScheduledTaskStatus, TriggerType


def _task_doc(task_id: str) -> dict[str, Any]:
    now = datetime(2026, 4, 25, tzinfo=timezone.utc)
    return {
        "_id": task_id,
        "name": f"Task {task_id}",
        "description": None,
        "agent_id": "agent_1",
        "trigger_type": TriggerType.INTERVAL,
        "trigger_config": {"seconds": 300},
        "input_payload": {"message": "hello"},
        "status": ScheduledTaskStatus.ACTIVE,
        "enabled": True,
        "run_on_start": False,
        "max_retries": 0,
        "timeout_seconds": 600,
        "owner_id": "user_1",
        "source_session_id": None,
        "source_run_id": None,
        "created_by": "user",
        "created_at": now,
        "updated_at": now,
    }


class _ConcurrentCursor:
    def __init__(self, docs: list[dict[str, Any]], count_started: asyncio.Event) -> None:
        self._docs = docs
        self._count_started = count_started
        self.skip_value: int | None = None
        self.limit_value: int | None = None

    def sort(self, *_args):
        return self

    def skip(self, value: int):
        self.skip_value = value
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    def __aiter__(self):
        self._iter = iter(self._docs[: self.limit_value or None])
        return self

    async def __anext__(self):
        await asyncio.wait_for(self._count_started.wait(), timeout=1)
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _ConcurrentCollection:
    def __init__(self) -> None:
        self.count_started = asyncio.Event()
        self.find_started = asyncio.Event()
        self.cursor: _ConcurrentCursor | None = None

    async def count_documents(self, _query: dict[str, Any]) -> int:
        self.count_started.set()
        await asyncio.wait_for(self.find_started.wait(), timeout=1)
        return 1

    def find(self, _query: dict[str, Any]):
        self.find_started.set()
        self.cursor = _ConcurrentCursor([_task_doc("task_1")], self.count_started)
        return self.cursor


@pytest.mark.asyncio
async def test_list_tasks_paginated_fetches_rows_and_count_concurrently() -> None:
    storage = ScheduledTaskStorage()
    collection = _ConcurrentCollection()
    storage._collections["scheduled_tasks"] = collection

    tasks, total = await storage.list_tasks_paginated(owner_id="user_1")

    assert total == 1
    assert [task.id for task in tasks] == ["task_1"]


def test_close_scheduled_task_storage_releases_singleton() -> None:
    storage = storage_module.get_scheduled_task_storage()

    storage_module.close_scheduled_task_storage()

    assert storage_module._storage is None
    assert storage_module.get_scheduled_task_storage() is not storage
    storage_module.close_scheduled_task_storage()


def test_close_scheduled_task_storage_does_not_create_singleton_when_unused() -> None:
    storage_module._storage = None

    storage_module.close_scheduled_task_storage()

    assert storage_module._storage is None
