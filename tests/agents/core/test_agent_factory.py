from __future__ import annotations

import pytest

from src.agents.core.base import AgentFactory
from src.kernel.schemas.agent import AgentCatalogConfig, AgentCatalogLocale


class _DummyAgent:
    def __init__(self) -> None:
        self.initialized = False

    async def initialize(self) -> None:
        self.initialized = True


@pytest.mark.asyncio
async def test_agent_factory_get_discovers_agents_when_registry_is_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.agents.core import base as base_module

    AgentFactory._instances.clear()
    monkeypatch.setattr(base_module, "_AGENT_REGISTRY", {})

    def _fake_discover_agents() -> None:
        base_module._AGENT_REGISTRY["dummy"] = _DummyAgent

    monkeypatch.setattr("src.agents.discover_agents", _fake_discover_agents)

    agent = await AgentFactory.get("dummy")

    assert isinstance(agent, _DummyAgent)
    assert agent.initialized is True


class _SearchAgentClass:
    _agent_name = "agents.search.name"
    _description = "agents.search.description"
    _version = "1.0.0"
    _sort_order = 1
    _supports_sandbox = True
    _options = {}


class _FastAgentClass:
    _agent_name = "agents.fast.name"
    _description = "agents.fast.description"
    _version = "1.0.0"
    _sort_order = 2
    _supports_sandbox = False
    _options = {}


class _CatalogStorage:
    async def get_catalog_config(self) -> list[AgentCatalogConfig]:
        return [
            AgentCatalogConfig(
                id="fast",
                name="agents.fast.name",
                description="agents.fast.description",
                enabled=True,
                icon="Zap",
                sort_order=5,
                labels={
                    "zh": AgentCatalogLocale(
                        name="快速助手",
                        description="日常对话",
                    )
                },
            ),
            AgentCatalogConfig(
                id="search",
                name="agents.search.name",
                description="agents.search.description",
                enabled=False,
                icon="Search",
                sort_order=10,
                labels={},
            ),
        ]

    async def get_global_config(self) -> list:
        raise AssertionError("catalog config should replace legacy global config")


@pytest.mark.asyncio
async def test_filtered_agents_use_catalog_enabled_state_and_display_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.agents.core import base as base_module

    monkeypatch.setattr(
        base_module,
        "_AGENT_REGISTRY",
        {"search": _SearchAgentClass, "fast": _FastAgentClass},
    )
    monkeypatch.setattr(
        "src.infra.agent.config_storage.get_agent_config_storage",
        lambda: _CatalogStorage(),
    )

    agents = await AgentFactory.get_filtered_agents(
        user_roles=[],
        role_agent_map={},
        default_agent_id="fast",
    )

    assert [agent["id"] for agent in agents] == ["fast"]
    assert agents[0]["icon"] == "Zap"
    assert agents[0]["labels"]["zh"]["name"] == "快速助手"
