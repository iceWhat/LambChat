from __future__ import annotations

from src.agents.core.recommendations import (
    generate_recommend_questions,
    schedule_recommend_questions,
)
from src.agents.fast_agent.graph import FastAgent
from src.agents.search_agent.graph import SearchAgent
from src.agents.team_agent.graph import TeamAgent


class _FakePresenter:
    def __init__(self) -> None:
        self.questions = None

    async def emit_recommend_questions(self, questions):
        self.questions = questions
        return {"event": "recommend:questions", "data": {"questions": questions}}


class _RecordingBuilder:
    def __init__(self) -> None:
        self.nodes = []
        self.edges = []
        self.entry_point = None

    def add_node(self, name, func, description=""):
        self.nodes.append((name, func))
        return self

    def set_entry_point(self, node_name):
        self.entry_point = node_name
        return self

    def add_edge(self, from_node, to_node):
        self.edges.append((from_node, to_node))
        return self


class _FakeResponse:
    content = '["问题一？", "问题二？", "问题三？"]'


class _FakeModel:
    def __init__(self) -> None:
        self.prompts = []

    async def ainvoke(self, prompt: str):
        self.prompts.append(prompt)
        return _FakeResponse()


async def test_generate_recommend_questions_uses_session_title_model(monkeypatch) -> None:
    calls = []
    model = _FakeModel()

    async def fake_get_model(**kwargs):
        calls.append(kwargs)
        return model

    monkeypatch.setattr("src.infra.llm.client.LLMClient.get_model", fake_get_model)
    monkeypatch.setattr(
        "src.agents.core.recommendations.settings.SESSION_TITLE_MODEL",
        "title-model",
    )
    monkeypatch.setattr(
        "src.agents.core.recommendations.settings.SESSION_TITLE_API_BASE",
        "https://title.example/v1",
    )
    monkeypatch.setattr(
        "src.agents.core.recommendations.settings.SESSION_TITLE_API_KEY",
        "title-key",
    )

    questions = await generate_recommend_questions("如何准备半程马拉松？", "先建立基础跑量。")

    assert calls == [
        {
            "model": "title-model",
            "api_base": "https://title.example/v1",
            "api_key": "title-key",
            "max_tokens": 300,
            "max_retries": 3,
        }
    ]
    assert "如何准备半程马拉松？" in model.prompts[0]
    assert "先建立基础跑量。" in model.prompts[0]
    assert questions == ["问题一？", "问题二？", "问题三？"]


async def test_generate_recommend_questions_falls_back_quietly_without_title_api(
    monkeypatch,
) -> None:
    async def fake_get_model(**kwargs):
        raise RuntimeError("title api missing")

    def fail_on_warning(*args, **kwargs):
        raise AssertionError("LLM recommendation fallback should not warn")

    monkeypatch.setattr("src.infra.llm.client.LLMClient.get_model", fake_get_model)
    monkeypatch.setattr(
        "src.agents.core.recommendations.settings.SESSION_TITLE_API_BASE",
        "",
    )
    monkeypatch.setattr(
        "src.agents.core.recommendations.settings.SESSION_TITLE_API_KEY",
        "",
    )
    monkeypatch.setattr(
        "src.agents.core.recommendations.logger.warning",
        fail_on_warning,
    )

    questions = await generate_recommend_questions("如何准备半程马拉松？")

    assert questions == [
        "如何准备半程马拉松？还有哪些关键步骤？",
        "如何准备半程马拉松？有哪些常见误区？",
        "下一步我应该怎么做？",
    ]


async def test_recommendation_node_emits_llm_followup_questions(monkeypatch) -> None:
    presenter = _FakePresenter()

    async def fake_generate_recommend_questions(user_input: str, output_text: str = ""):
        return ["问题一？", "问题二？", "问题三？"]

    monkeypatch.setattr(
        "src.agents.core.recommendations.generate_recommend_questions",
        fake_generate_recommend_questions,
    )

    task = schedule_recommend_questions(presenter, "如何准备半程马拉松？")

    assert presenter.questions is None
    await task
    assert presenter.questions == ["问题一？", "问题二？", "问题三？"]


def test_langgraph_agents_do_not_block_on_recommendation_node() -> None:
    for agent_cls in (SearchAgent, FastAgent, TeamAgent):
        builder = _RecordingBuilder()
        agent_cls().build_graph(builder)

        assert [name for name, _ in builder.nodes] == ["agent"]
        assert ("agent", "END") in builder.edges
