"""Team Agent module."""

from src.agents.team_agent.prompt import build_team_members_description

__all__ = ["build_team_members_description"]


def __getattr__(name):
    """Lazy import for heavy dependencies (graph, nodes)."""
    if name == "TeamAgent":
        from src.agents.team_agent.graph import TeamAgent

        return TeamAgent
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
