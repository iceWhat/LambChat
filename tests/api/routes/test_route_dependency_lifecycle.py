from __future__ import annotations

import pytest


class _FakeManager:
    def __init__(self) -> None:
        self.close_calls = 0

    async def close(self) -> None:
        self.close_calls += 1


@pytest.mark.asyncio
async def test_close_notification_manager_closes_cached_manager(monkeypatch) -> None:
    from src.api.routes import notification

    fake_manager = _FakeManager()
    notification.get_notification_manager.cache_clear()
    monkeypatch.setattr(notification, "NotificationManager", lambda: fake_manager)

    assert notification.get_notification_manager() is fake_manager

    await notification.close_notification_manager()

    assert fake_manager.close_calls == 1
    assert notification.get_notification_manager.cache_info().currsize == 0


@pytest.mark.asyncio
async def test_close_notification_manager_does_not_create_unused_manager(monkeypatch) -> None:
    from src.api.routes import notification

    notification.get_notification_manager.cache_clear()

    def _fail_create():
        raise AssertionError("unused notification manager should not be created during close")

    monkeypatch.setattr(notification, "NotificationManager", _fail_create)

    await notification.close_notification_manager()

    assert notification.get_notification_manager.cache_info().currsize == 0


@pytest.mark.asyncio
async def test_close_feedback_manager_closes_cached_manager(monkeypatch) -> None:
    from src.api.routes import feedback

    fake_manager = _FakeManager()
    feedback.get_feedback_manager.cache_clear()
    monkeypatch.setattr(feedback, "FeedbackManager", lambda: fake_manager)

    assert feedback.get_feedback_manager() is fake_manager

    await feedback.close_feedback_manager()

    assert fake_manager.close_calls == 1
    assert feedback.get_feedback_manager.cache_info().currsize == 0


@pytest.mark.asyncio
async def test_close_feedback_manager_does_not_create_unused_manager(monkeypatch) -> None:
    from src.api.routes import feedback

    feedback.get_feedback_manager.cache_clear()

    def _fail_create():
        raise AssertionError("unused feedback manager should not be created during close")

    monkeypatch.setattr(feedback, "FeedbackManager", _fail_create)

    await feedback.close_feedback_manager()

    assert feedback.get_feedback_manager.cache_info().currsize == 0
