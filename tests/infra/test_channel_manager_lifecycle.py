from __future__ import annotations

from typing import Any

import pytest

from src.infra.channel.base import BaseChannel, UserChannelManager
from src.kernel.schemas.channel import ChannelCapability, ChannelType


class _FakeChannel(BaseChannel):
    channel_type = ChannelType.FEISHU

    @classmethod
    def get_capabilities(cls) -> list[ChannelCapability]:
        return []

    @classmethod
    def get_config_schema(cls) -> dict[str, Any]:
        return {}

    @classmethod
    def get_setup_guide(cls) -> list[str]:
        return []

    async def start(self) -> bool:
        return True

    async def stop(self) -> None:
        return None

    async def send_message(self, chat_id: str, content: str, **kwargs) -> bool:
        return True


class _FakeManager(UserChannelManager):
    channel_type = ChannelType.FEISHU
    config_class = object

    def __init__(self) -> None:
        super().__init__()
        self.stop_calls = 0

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        self.stop_calls += 1

    async def reload_user(self, user_id: str, instance_id: str | None = None) -> bool:
        return True


@pytest.mark.asyncio
async def test_close_all_instances_stops_and_releases_channel_manager_singletons() -> None:
    UserChannelManager._instances.clear()
    manager = _FakeManager.get_instance()

    await UserChannelManager.close_all_instances()

    assert manager.stop_calls == 1
    assert UserChannelManager._instances == {}
