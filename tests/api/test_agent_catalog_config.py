from __future__ import annotations

import pytest

from src.api.routes.agent import config as config_routes
from src.kernel.schemas.agent import (
    AgentCatalogConfig,
    AgentCatalogConfigUpdate,
    AgentCatalogLocale,
    AgentConfig,
)
from src.kernel.schemas.user import TokenPayload


class _CatalogStorage:
    def __init__(
        self,
        catalog: list[AgentCatalogConfig] | None = None,
        legacy_global: list[AgentConfig] | None = None,
    ) -> None:
        self.catalog = catalog or []
        self.legacy_global = legacy_global or []
        self.saved: list[AgentCatalogConfig] | None = None

    async def get_catalog_config(self) -> list[AgentCatalogConfig]:
        return self.catalog

    async def get_global_config(self) -> list[AgentConfig]:
        return self.legacy_global

    async def set_catalog_config(
        self,
        agents: list[AgentCatalogConfig],
    ) -> list[AgentCatalogConfig]:
        self.saved = agents
        self.catalog = agents
        return agents


def _admin() -> TokenPayload:
    return TokenPayload(sub="admin-1", username="admin", roles=["admin"])


def _registered_agents() -> list[dict]:
    return [
        {
            "id": "search",
            "name": "agents.search.name",
            "description": "agents.search.description",
            "version": "1.0.0",
            "sort_order": 1,
            "supports_sandbox": True,
            "options": {},
        },
        {
            "id": "fast",
            "name": "agents.fast.name",
            "description": "agents.fast.description",
            "version": "1.0.0",
            "sort_order": 2,
            "supports_sandbox": False,
            "options": {},
        },
    ]


@pytest.mark.asyncio
async def test_get_catalog_config_seeds_registered_agents_in_dedicated_catalog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = _CatalogStorage()
    monkeypatch.setattr(config_routes, "get_agent_config_storage", lambda: storage)
    monkeypatch.setattr(config_routes.AgentFactory, "list_agents", _registered_agents)

    response = await config_routes.get_agent_catalog_config(_admin())

    assert storage.saved is not None
    assert [agent.id for agent in response.agents] == ["search", "fast"]
    assert response.agents[0].name == "agents.search.name"
    assert response.agents[0].description == "agents.search.description"
    assert response.agents[0].icon == "Bot"
    assert response.agents[0].sort_order == 1
    assert response.agents[0].labels == {}


@pytest.mark.asyncio
async def test_get_catalog_config_migrates_legacy_global_enabled_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = _CatalogStorage(
        legacy_global=[
            AgentConfig(
                id="search",
                name="agents.search.name",
                description="agents.search.description",
                enabled=False,
            )
        ]
    )
    monkeypatch.setattr(config_routes, "get_agent_config_storage", lambda: storage)
    monkeypatch.setattr(config_routes.AgentFactory, "list_agents", _registered_agents)

    response = await config_routes.get_agent_catalog_config(_admin())

    search = next(agent for agent in response.agents if agent.id == "search")
    assert search.enabled is False
    assert response.available_agents == ["fast"]


@pytest.mark.asyncio
async def test_update_catalog_config_persists_multilingual_display_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = _CatalogStorage()
    monkeypatch.setattr(config_routes, "get_agent_config_storage", lambda: storage)
    monkeypatch.setattr(config_routes, "list_registered_agents", lambda: ["search"])
    monkeypatch.setattr(config_routes.AgentFactory, "list_agents", _registered_agents)

    update = AgentCatalogConfigUpdate(
        agents=[
            AgentCatalogConfig(
                id="search",
                name="agents.search.name",
                description="agents.search.description",
                enabled=True,
                icon="Search",
                sort_order=10,
                labels={
                    "zh": AgentCatalogLocale(
                        name="搜索助手",
                        description="面向检索和复杂任务",
                    ),
                    "en": AgentCatalogLocale(
                        name="Research Agent",
                        description="For research and complex tasks",
                    ),
                },
            )
        ]
    )

    response = await config_routes.update_agent_catalog_config(update, _admin())

    assert storage.saved is not None
    assert storage.saved[0].labels["zh"].name == "搜索助手"
    assert response.agents[0].icon == "Search"
    assert response.available_agents == ["search"]
