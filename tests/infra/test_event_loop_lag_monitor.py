from __future__ import annotations

import asyncio

import pytest

from src.infra.monitoring import event_loop as event_loop_module
from src.infra.monitoring.event_loop import EventLoopLagMonitor


class _FakeLogger:
    def __init__(self) -> None:
        self.warnings: list[tuple[str, tuple[object, ...]]] = []

    def warning(self, message: str, *args: object) -> None:
        self.warnings.append((message, args))


@pytest.mark.asyncio
async def test_event_loop_lag_monitor_logs_when_lag_exceeds_threshold() -> None:
    logger = _FakeLogger()
    monitor = EventLoopLagMonitor(interval_seconds=0.01, threshold_seconds=0.001, logger=logger)

    await monitor.start()
    await asyncio.sleep(0.02)
    import time

    time.sleep(0.03)
    await asyncio.sleep(0.03)
    await monitor.stop()

    assert logger.warnings
    assert "Event loop lag detected" in logger.warnings[0][0]


@pytest.mark.asyncio
async def test_stop_event_loop_lag_monitor_does_not_create_monitor_when_unused() -> None:
    event_loop_module._monitor = None

    await event_loop_module.stop_event_loop_lag_monitor()

    assert event_loop_module._monitor is None


@pytest.mark.asyncio
async def test_stop_event_loop_lag_monitor_releases_singleton() -> None:
    monitor = EventLoopLagMonitor(interval_seconds=60)
    event_loop_module._monitor = monitor

    await event_loop_module.start_event_loop_lag_monitor()
    await event_loop_module.stop_event_loop_lag_monitor()

    assert event_loop_module._monitor is None
