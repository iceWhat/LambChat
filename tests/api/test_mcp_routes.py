from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api import deps as api_deps
from src.api.routes import mcp as mcp_route
from src.kernel.schemas.mcp import MCPServerResponse, MCPTransport
from src.kernel.schemas.user import TokenPayload


def _fake_user() -> TokenPayload:
    return TokenPayload(
        sub="user-1",
        username="tester",
        roles=["user"],
        permissions=["mcp:read"],
    )


@pytest.mark.asyncio
async def test_list_mcp_servers_returns_paginated_response() -> None:
    class _FakeStorage:
        async def get_visible_servers(self, user_id: str, is_admin: bool, user_roles):
            assert user_id == "user-1"
            assert is_admin is False
            assert user_roles == ["user"]
            return [
                MCPServerResponse(
                    name=f"server-{i}",
                    transport=MCPTransport.SSE,
                    enabled=True,
                    url=f"https://example.com/{i}",
                    is_system=False,
                    can_edit=True,
                )
                for i in range(5)
            ]

    app = FastAPI()
    app.include_router(mcp_route.router, prefix="/api/mcp")
    app.dependency_overrides[api_deps.get_current_user_required] = _fake_user
    app.dependency_overrides[mcp_route.get_mcp_storage] = lambda: _FakeStorage()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/mcp/?skip=2&limit=2&q=server")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 5
    assert payload["skip"] == 2
    assert payload["limit"] == 2
    assert [server["name"] for server in payload["servers"]] == ["server-2", "server-3"]
