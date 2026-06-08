"""Event loop lag monitoring for detecting accidental blocking calls."""

from __future__ import annotations

import asyncio
from typing import Any

from src.infra.logging import get_logger

logger = get_logger(__name__)


class EventLoopLagMonitor:
    """Periodically warns when the current event loop is blocked too long."""

    def __init__(
        self,
        *,
        interval_seconds: float = 1.0,
        threshold_seconds: float = 2.0,
        logger: Any = logger,
    ) -> None:
        self._interval_seconds = interval_seconds
        self._threshold_seconds = threshold_seconds
        self._logger = logger
        self._task: asyncio.Task[None] | None = None

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.is_running:
            return
        self._task = asyncio.create_task(self._run(), name="event-loop-lag-monitor")

    async def stop(self) -> None:
        task = self._task
        self._task = None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _run(self) -> None:
        loop = asyncio.get_running_loop()
        expected = loop.time() + self._interval_seconds
        try:
            while True:
                await asyncio.sleep(self._interval_seconds)
                now = loop.time()
                lag = max(0.0, now - expected)
                if lag >= self._threshold_seconds:
                    self._logger.warning(
                        "Event loop lag detected: %.3fs over threshold %.3fs",
                        lag,
                        self._threshold_seconds,
                    )
                expected = now + self._interval_seconds
        except asyncio.CancelledError:
            raise


_monitor: EventLoopLagMonitor | None = None


def get_event_loop_lag_monitor() -> EventLoopLagMonitor:
    global _monitor
    if _monitor is None:
        _monitor = EventLoopLagMonitor()
    return _monitor


async def start_event_loop_lag_monitor() -> None:
    await get_event_loop_lag_monitor().start()


async def stop_event_loop_lag_monitor() -> None:
    global _monitor
    monitor = _monitor
    _monitor = None
    if monitor is not None:
        await monitor.stop()
