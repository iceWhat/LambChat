from __future__ import annotations

import pytest

from src.infra.channel.channel_storage import ChannelStorage


class _FakeCollection:
    def __init__(self) -> None:
        self.created_indexes: list[tuple[object, dict[str, object]]] = []

    async def create_index(self, keys, **kwargs):
        self.created_indexes.append((keys, kwargs))


class _FakeDb:
    def __init__(self, collection: _FakeCollection) -> None:
        self._collection = collection

    def __getitem__(self, name: str):
        return self._collection


class _FakeClient:
    def __init__(self, collection: _FakeCollection) -> None:
        self._db = _FakeDb(collection)

    def __getitem__(self, name: str):
        return self._db


@pytest.mark.asyncio
async def test_channel_storage_indexes_created_once_across_instances(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    collection = _FakeCollection()
    client = _FakeClient(collection)
    monkeypatch.setattr("src.infra.channel.channel_storage.get_mongo_client", lambda: client)
    monkeypatch.setattr(ChannelStorage, "_indexes_done", False, raising=False)
    monkeypatch.setattr(ChannelStorage, "_indexes_task", None, raising=False)
    monkeypatch.setattr(ChannelStorage, "_indexes_lock", None, raising=False)

    first = ChannelStorage()
    second = ChannelStorage()

    await first.ensure_indexes_if_needed()
    await second.ensure_indexes_if_needed()

    assert len(collection.created_indexes) == 2
    assert collection.created_indexes[0][1]["name"] == "user_channel_instance_idx"
    assert collection.created_indexes[1][1]["name"] == "channel_enabled_idx"
