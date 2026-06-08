from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

import src.agents.core.base as base_module
from src.agents.core.base import BaseGraphAgent


class _TestAgent(BaseGraphAgent):
    def build_graph(self, builder) -> None:
        return None


class _CaptureStreamAgent(_TestAgent):
    def _stream(self, _message, session_id, user_id=None, **_kwargs):
        async def _gen():
            yield {"session_id": session_id, "user_id": user_id}

        return _gen()


class _CaptureInvokeGraph:
    def __init__(self) -> None:
        self.thread_ids: list[str] = []

    async def ainvoke(self, _state, config):
        self.thread_ids.append(config["configurable"]["thread_id"])
        return {"output": "ok"}


def test_stream_generates_fresh_default_session_id_per_call() -> None:
    agent = _CaptureStreamAgent()

    first = agent.stream("hello")
    second = agent.stream("hello")

    async def _collect():
        return await first.__anext__(), await second.__anext__()

    first_event, second_event = asyncio.run(_collect())

    assert first_event["session_id"] != second_event["session_id"]


@pytest.mark.asyncio
async def test_invoke_generates_fresh_default_session_id_per_call() -> None:
    agent = _TestAgent()
    graph = _CaptureInvokeGraph()
    agent._initialized = True
    agent._graph = graph

    await agent.invoke("hello")
    await agent.invoke("hello")

    assert graph.thread_ids[0] != graph.thread_ids[1]


@pytest.mark.asyncio
async def test_close_cancels_background_cleanup_task() -> None:
    agent = _TestAgent()
    cleanup_task = asyncio.create_task(asyncio.sleep(3600))
    agent._cleanup_task = cleanup_task

    await agent.close()

    assert cleanup_task.cancelled() is True


@pytest.mark.asyncio
async def test_memory_saver_cleanup_offloads_checkpoint_scan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    class _FakeMemorySaver:
        def __init__(self) -> None:
            self.storage = {
                "thread-old": {"checkpoint-old": SimpleNamespace(ts="2020-01-01T00:00:00+00:00")}
            }

    fake_checkpointer = _FakeMemorySaver()
    sleep_calls = 0

    async def _fake_sleep(seconds: float) -> None:
        nonlocal sleep_calls
        del seconds
        sleep_calls += 1
        if sleep_calls > 1:
            raise asyncio.CancelledError

    async def _fake_run_blocking_io(func, /, *args, **kwargs):
        calls.append(func.__name__)
        return func(*args, **kwargs)

    monkeypatch.setattr("langgraph.checkpoint.memory.MemorySaver", _FakeMemorySaver)
    monkeypatch.setattr(base_module.asyncio, "sleep", _fake_sleep)
    monkeypatch.setattr(base_module, "run_blocking_io", _fake_run_blocking_io, raising=False)

    agent = _TestAgent()
    agent._checkpointer = fake_checkpointer

    await agent._cleanup_memory_saver()

    assert calls == ["_prune_memory_saver_storage"]
    assert fake_checkpointer.storage == {}
