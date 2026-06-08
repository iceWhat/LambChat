from __future__ import annotations

import pytest

from src.api.routes.auth import rate_limiter as rate_limiter_module
from src.api.routes.auth.rate_limiter import RateLimiter


@pytest.mark.asyncio
async def test_close_rate_limiter_releases_existing_singleton_without_creating_one() -> None:
    rate_limiter_module._rate_limiter = None

    await rate_limiter_module.close_rate_limiter()

    assert rate_limiter_module._rate_limiter is None

    limiter = RateLimiter()
    rate_limiter_module._rate_limiter = limiter

    await rate_limiter_module.close_rate_limiter()

    assert rate_limiter_module._rate_limiter is None
