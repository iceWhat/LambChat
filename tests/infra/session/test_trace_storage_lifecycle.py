from __future__ import annotations

import asyncio

import pytest

from src.infra.session import trace_storage as trace_storage_module
from src.infra.session.trace_storage import TraceStorage


class _FakeMongoClient:
    def __init__(self, collection) -> None:
        self._collection = collection

    def __getitem__(self, name: str):
        if name == trace_storage_module.settings.MONGODB_TRACES_COLLECTION:
            return self._collection
        return self


@pytest.mark.asyncio
async def test_close_trace_storage_releases_singleton_without_creating_one() -> None:
    trace_storage_module._trace_storage = None

    await trace_storage_module.close_trace_storage()

    assert trace_storage_module._trace_storage is None


@pytest.mark.asyncio
async def test_ensure_indexes_initializes_collection_and_tracks_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Collection:
        def __init__(self) -> None:
            self.create_index_calls = 0

        async def create_index(self, *_args, **_kwargs) -> None:
            self.create_index_calls += 1

    collection = _Collection()
    monkeypatch.setattr(
        trace_storage_module,
        "get_mongo_client",
        lambda: _FakeMongoClient(collection),
    )
    monkeypatch.setattr(trace_storage_module.settings, "ENABLE_EVENT_MERGER", False)

    storage = TraceStorage()

    await storage.ensure_indexes_if_needed()
    task = storage._indexes_task
    assert task is not None
    await task

    assert storage._collection is collection
    assert collection.create_index_calls > 0


@pytest.mark.asyncio
async def test_close_trace_storage_cancels_inflight_index_task_and_clears_refs() -> None:
    started = asyncio.Event()

    class _SlowIndexStorage(TraceStorage):
        async def _ensure_indexes(self) -> None:
            started.set()
            await asyncio.Event().wait()

    storage = _SlowIndexStorage()
    storage._collection = object()
    storage._merger = object()
    storage._start_merger = lambda: None
    trace_storage_module._trace_storage = storage

    await storage.ensure_indexes_if_needed()
    task = storage._indexes_task
    assert task is not None
    await asyncio.wait_for(started.wait(), timeout=1)

    await trace_storage_module.close_trace_storage()

    assert task.cancelled() is True
    assert storage._indexes_task is None
    assert storage._collection is None
    assert storage._merger is None
    assert not hasattr(storage, "_indexes_ensured")
    assert trace_storage_module._trace_storage is None

    storage = TraceStorage()
    trace_storage_module._trace_storage = storage

    await trace_storage_module.close_trace_storage()

    assert trace_storage_module._trace_storage is None
