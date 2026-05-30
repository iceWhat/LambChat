from __future__ import annotations

from src.infra.task import executor


def test_recommend_questions_are_enabled_by_default() -> None:
    assert executor.should_schedule_recommend_questions() is True


def test_recommend_questions_follow_admin_setting(monkeypatch) -> None:
    monkeypatch.setattr(executor.settings, "ENABLE_RECOMMEND_QUESTIONS", False)

    assert executor.should_schedule_recommend_questions() is False
