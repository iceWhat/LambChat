from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from src.infra.task import arq_worker


class _FakePayloadStore:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.deleted: list[str] = []

    async def load(self, run_id: str):
        return self.payload if run_id == self.payload["run_id"] else None

    async def delete(self, run_id: str) -> bool:
        self.deleted.append(run_id)
        return True


class _FakeTaskExecutor:
    def __init__(self) -> None:
        self.run_calls: list[dict] = []

    async def run_task(self, **kwargs) -> None:
        self.run_calls.append(kwargs)


class _CancelledTaskExecutor:
    def __init__(self) -> None:
        self.run_calls: list[dict] = []

    async def run_task(self, **kwargs) -> None:
        self.run_calls.append(kwargs)
        raise asyncio.CancelledError()


class _GenericFailingTaskExecutor:
    def __init__(self) -> None:
        self.run_calls: list[dict] = []

    async def run_task(self, **kwargs) -> None:
        self.run_calls.append(kwargs)
        raise RuntimeError("boom")


@pytest.mark.asyncio
async def test_run_agent_task_loads_payload_and_invokes_executor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "session_id": "session-1",
        "run_id": "run-1",
        "trace_id": "trace-1",
        "agent_id": "search",
        "message": "hello",
        "display_message": "hello display",
        "user_id": "user-1",
        "executor_key": "agent_stream",
        "user_message_written": True,
        "agent_options": {"model": "test"},
    }
    payload_store = _FakePayloadStore(payload)
    task_executor = _FakeTaskExecutor()
    task_manager = SimpleNamespace(
        _run_info={},
        _ensure_executor=lambda: task_executor,
    )

    async def _executor_fn(*args, **kwargs):
        if False:
            yield None

    monkeypatch.setattr(arq_worker, "get_task_manager", lambda: task_manager)
    monkeypatch.setattr(arq_worker, "get_registered_executor", lambda key: _executor_fn)

    await arq_worker.run_agent_task({"payload_store": payload_store}, "run-1")

    assert task_executor.run_calls
    assert task_executor.run_calls[0]["session_id"] == "session-1"
    assert task_executor.run_calls[0]["existing_trace_id"] == "trace-1"
    assert task_executor.run_calls[0]["executor"] is _executor_fn
    assert task_manager._run_info["run-1"]["trace_id"] == "trace-1"
    assert payload_store.deleted == ["run-1"]


@pytest.mark.asyncio
async def test_run_agent_task_marks_recoverable_and_deletes_payload_when_cancelled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "session_id": "session-1",
        "run_id": "run-1",
        "trace_id": "trace-1",
        "agent_id": "search",
        "message": "hello",
        "display_message": "hello display",
        "user_id": "user-1",
        "executor_key": "agent_stream",
        "user_message_written": True,
    }
    payload_store = _FakePayloadStore(payload)
    task_executor = _CancelledTaskExecutor()
    recoverable_failures: list[tuple[str, str, str]] = []

    async def _fake_mark_recoverable_failure(
        session_id: str,
        run_id: str,
        error_message: str,
    ) -> None:
        recoverable_failures.append((session_id, run_id, error_message))

    task_manager = SimpleNamespace(
        _run_info={},
        _ensure_executor=lambda: task_executor,
        _mark_run_recoverable_failure=_fake_mark_recoverable_failure,
    )

    async def _executor_fn(*args, **kwargs):
        if False:
            yield None

    monkeypatch.setattr(arq_worker, "get_task_manager", lambda: task_manager)
    monkeypatch.setattr(arq_worker, "get_registered_executor", lambda key: _executor_fn)

    with pytest.raises(asyncio.CancelledError):
        await arq_worker.run_agent_task({"payload_store": payload_store}, "run-1")

    assert task_executor.run_calls
    assert recoverable_failures == [("session-1", "run-1", "Server shutdown")]
    assert payload_store.deleted == ["run-1"]


@pytest.mark.asyncio
async def test_run_agent_task_keeps_payload_for_non_cancel_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "session_id": "session-1",
        "run_id": "run-1",
        "trace_id": "trace-1",
        "agent_id": "search",
        "message": "hello",
        "display_message": "hello display",
        "user_id": "user-1",
        "executor_key": "agent_stream",
        "user_message_written": True,
    }
    payload_store = _FakePayloadStore(payload)
    task_executor = _GenericFailingTaskExecutor()
    task_manager = SimpleNamespace(
        _run_info={},
        _ensure_executor=lambda: task_executor,
    )

    async def _executor_fn(*args, **kwargs):
        if False:
            yield None

    monkeypatch.setattr(arq_worker, "get_task_manager", lambda: task_manager)
    monkeypatch.setattr(arq_worker, "get_registered_executor", lambda key: _executor_fn)

    with pytest.raises(RuntimeError, match="boom"):
        await arq_worker.run_agent_task({"payload_store": payload_store}, "run-1")

    assert task_executor.run_calls
    assert payload_store.deleted == []


@pytest.mark.asyncio
async def test_run_agent_task_deletes_payload_after_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "session_id": "session-1",
        "run_id": "run-1",
        "trace_id": "trace-1",
        "agent_id": "search",
        "message": "hello",
        "display_message": "hello display",
        "user_id": "user-1",
        "executor_key": "agent_stream",
        "user_message_written": True,
    }
    payload_store = _FakePayloadStore(payload)
    task_executor = _FakeTaskExecutor()
    task_manager = SimpleNamespace(
        _run_info={},
        _ensure_executor=lambda: task_executor,
    )

    async def _executor_fn(*args, **kwargs):
        if False:
            yield None

    monkeypatch.setattr(arq_worker, "get_task_manager", lambda: task_manager)
    monkeypatch.setattr(arq_worker, "get_registered_executor", lambda key: _executor_fn)

    await arq_worker.run_agent_task({"payload_store": payload_store}, "run-1")

    assert payload_store.deleted == ["run-1"]
