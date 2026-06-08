from __future__ import annotations

import pytest

from src.infra.scheduler import runtime as runtime_module
from src.infra.scheduler.runtime import RuntimeScheduler, ScheduledJob


async def _noop_handler() -> None:
    return None


@pytest.mark.asyncio
async def test_close_runtime_scheduler_stops_clears_jobs_and_releases_singleton() -> None:
    scheduler = RuntimeScheduler()
    scheduler.register_job(
        ScheduledJob.from_interval(
            id="test-job",
            interval_seconds=60,
            handler=_noop_handler,
        )
    )
    runtime_module._runtime_scheduler = scheduler

    await runtime_module.close_runtime_scheduler()

    assert scheduler.has_job("test-job") is False
    assert scheduler._scheduled_intervals == {}
    assert runtime_module._runtime_scheduler is None
