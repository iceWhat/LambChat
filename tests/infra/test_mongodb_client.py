import sys
import types
from datetime import timezone

import pytest


def test_mongo_client_reads_datetimes_as_utc_aware(monkeypatch):
    from src.infra.storage import mongodb

    captured: dict[str, object] = {}

    class FakeAsyncIOMotorClient:
        def __init__(self, connection_string: str, **kwargs: object) -> None:
            captured["connection_string"] = connection_string
            captured.update(kwargs)

    fake_motor = types.ModuleType("motor")
    fake_motor_asyncio = types.ModuleType("motor.motor_asyncio")
    fake_motor_asyncio.AsyncIOMotorClient = FakeAsyncIOMotorClient
    monkeypatch.setitem(sys.modules, "motor", fake_motor)
    monkeypatch.setitem(sys.modules, "motor.motor_asyncio", fake_motor_asyncio)
    monkeypatch.setattr(mongodb.settings, "MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setattr(mongodb.settings, "MONGODB_USERNAME", "")
    monkeypatch.setattr(mongodb.settings, "MONGODB_PASSWORD", "")
    mongodb.get_mongo_client.cache_clear()

    try:
        mongodb.get_mongo_client()
    finally:
        mongodb.get_mongo_client.cache_clear()

    assert captured["tz_aware"] is True
    assert captured["tzinfo"] is timezone.utc


@pytest.mark.asyncio
async def test_close_mongo_client_does_not_create_client_when_unused(monkeypatch):
    from src.infra.storage import mongodb

    created = 0

    class FakeAsyncIOMotorClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            nonlocal created
            created += 1

        def close(self) -> None:
            raise AssertionError("unused MongoDB client should not be created during close")

    fake_motor = types.ModuleType("motor")
    fake_motor_asyncio = types.ModuleType("motor.motor_asyncio")
    fake_motor_asyncio.AsyncIOMotorClient = FakeAsyncIOMotorClient
    monkeypatch.setitem(sys.modules, "motor", fake_motor)
    monkeypatch.setitem(sys.modules, "motor.motor_asyncio", fake_motor_asyncio)
    mongodb.get_mongo_client.cache_clear()

    await mongodb.close_mongo_client()

    assert created == 0
