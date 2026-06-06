"""Tests for scheduled task execution status handling."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from src.infra.scheduler.runner import ScheduledTaskRunner
from src.infra.task.status import TaskStatus
from src.kernel.schemas.scheduled_task import (
    RunStatus,
    ScheduledTask,
    ScheduledTaskStatus,
    TriggerType,
)


def _make_task(**overrides: Any) -> ScheduledTask:
    defaults = dict(
        _id="task_1",
        name="Test Task",
        agent_id="agent_1",
        trigger_type=TriggerType.INTERVAL,
        trigger_config={"seconds": 300},
        input_payload={"message": "hello"},
        status=ScheduledTaskStatus.ACTIVE,
        enabled=True,
        owner_id="user_1",
        timeout_seconds=60,
        max_retries=0,
    )
    defaults.update(overrides)
    return ScheduledTask(**defaults)


@pytest.fixture
def mock_storage():
    with patch("src.infra.scheduler.runner.get_scheduled_task_storage") as mock:
        storage = AsyncMock()
        mock.return_value = storage
        yield storage


@pytest.fixture
def mock_lock():
    with (
        patch(
            "src.infra.scheduler.runner.acquire_task_lock",
            new=AsyncMock(return_value="token"),
        ),
        patch("src.infra.scheduler.runner.release_task_lock", new=AsyncMock()),
    ):
        yield


@pytest.mark.asyncio
async def test_runner_records_failed_agent_status_as_failed(
    mock_storage: AsyncMock,
    mock_lock: None,
) -> None:
    task = _make_task()
    mock_storage.get_task = AsyncMock(return_value=task)
    runner = ScheduledTaskRunner()
    runner._execute_agent = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "session_status": "failed",
            "session_id": "session_1",
            "trace_id": "trace_1",
        }
    )

    result = await runner.run("task_1")

    assert result["status"] == RunStatus.FAILED.value
    final_update = mock_storage.update_run.call_args_list[-1].args[1]
    assert final_update["status"] == RunStatus.FAILED
    assert final_update["error_message"] == "Agent run ended with status: failed"
    mock_storage.update_task_run_stats.assert_awaited_once()
    assert mock_storage.update_task_run_stats.call_args.args[2] == RunStatus.FAILED


@pytest.mark.asyncio
async def test_runner_retries_until_success(
    mock_storage: AsyncMock,
    mock_lock: None,
) -> None:
    task = _make_task(max_retries=1)
    mock_storage.get_task = AsyncMock(return_value=task)
    runner = ScheduledTaskRunner()
    runner._execute_agent = AsyncMock(  # type: ignore[method-assign]
        side_effect=[
            {"session_status": "failed", "session_id": "session_1"},
            {
                "session_status": "completed",
                "session_id": "session_2",
                "trace_id": "trace_2",
            },
        ]
    )

    result = await runner.run("task_1")

    assert result["status"] == RunStatus.SUCCESS.value
    assert runner._execute_agent.call_count == 2
    retry_updates = [
        call.args[1]["retry_count"]
        for call in mock_storage.update_run.call_args_list
        if "retry_count" in call.args[1]
    ]
    assert retry_updates == [0, 1]
    final_update = mock_storage.update_run.call_args_list[-1].args[1]
    assert final_update["status"] == RunStatus.SUCCESS


@pytest.mark.asyncio
async def test_runner_does_not_retry_timeout(
    mock_storage: AsyncMock,
    mock_lock: None,
) -> None:
    task = _make_task(max_retries=1)
    mock_storage.get_task = AsyncMock(return_value=task)
    runner = ScheduledTaskRunner()
    runner._execute_agent = AsyncMock(  # type: ignore[method-assign]
        return_value={"session_status": "timeout", "session_id": "session_1"}
    )

    result = await runner.run("task_1")

    assert result["status"] == RunStatus.TIMEOUT.value
    assert runner._execute_agent.call_count == 1
    final_update = mock_storage.update_run.call_args_list[-1].args[1]
    assert final_update["status"] == RunStatus.TIMEOUT


@pytest.mark.asyncio
async def test_wait_for_completion_times_out_and_cancels_run() -> None:
    manager = AsyncMock()
    manager.get_run_status = AsyncMock(return_value=TaskStatus.RUNNING)
    manager.cancel_run = AsyncMock(return_value={"success": True})
    runner = ScheduledTaskRunner()

    result = await runner._wait_for_completion(
        manager,
        session_id="session_1",
        run_id="run_1",
        user_id="user_1",
        timeout_seconds=0,
    )

    assert result == {"session_status": "timeout"}
    manager.cancel_run.assert_awaited_once_with("run_1", user_id="user_1")
