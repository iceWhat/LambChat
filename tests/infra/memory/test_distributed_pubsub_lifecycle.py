from __future__ import annotations

import pytest

from src.infra.memory import distributed
from src.infra.memory.distributed import close_memory_pubsub


class _FakeMemoryPubSub:
    def __init__(self) -> None:
        self.stop_calls = 0

    async def stop_listener(self) -> None:
        self.stop_calls += 1


@pytest.mark.asyncio
async def test_close_memory_pubsub_stops_and_releases_singleton(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_pubsub = _FakeMemoryPubSub()
    monkeypatch.setattr(distributed, "_memory_pubsub", fake_pubsub)

    await close_memory_pubsub()

    assert fake_pubsub.stop_calls == 1
    assert distributed._memory_pubsub is None


@pytest.mark.asyncio
async def test_close_memory_pubsub_does_not_create_singleton_when_unused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(distributed, "_memory_pubsub", None)

    await close_memory_pubsub()

    assert distributed._memory_pubsub is None
