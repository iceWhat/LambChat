from src.infra.session.manager import SessionManager


def test_build_fork_session_name_reuses_source_title() -> None:
    assert SessionManager._build_fork_session_name("Budget planning") == "Budget planning (Fork)"


def test_build_fork_session_name_falls_back_for_blank_title() -> None:
    assert SessionManager._build_fork_session_name("  ") == "New Chat (Fork)"


def test_build_fork_session_name_does_not_stack_fork_suffix() -> None:
    assert (
        SessionManager._build_fork_session_name("Budget planning (Fork)")
        == "Budget planning (Fork)"
    )
