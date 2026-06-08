from src.agents.fast_agent.context import FastAgentContext
from src.agents.search_agent.context import SearchAgentContext


def test_fast_agent_context_generates_fresh_default_session_id_per_instance() -> None:
    first = FastAgentContext()
    second = FastAgentContext()

    assert first.session_id != second.session_id


def test_search_agent_context_generates_fresh_default_session_id_per_instance() -> None:
    first = SearchAgentContext()
    second = SearchAgentContext()

    assert first.session_id != second.session_id
