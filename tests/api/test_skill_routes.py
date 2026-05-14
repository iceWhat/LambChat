from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api import deps as api_deps
from src.api.routes import skill as skill_route
from src.kernel.schemas.user import TokenPayload


def _fake_user() -> TokenPayload:
    return TokenPayload(
        sub="user-1",
        username="tester",
        roles=["user"],
        permissions=["skill:read"],
    )


@pytest.mark.asyncio
async def test_list_user_skills_returns_paginated_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeUserDoc:
        metadata = {"disabled_skills": ["archived"]}

    class _FakeUserStorage:
        async def get_by_id(self, user_id: str):
            assert user_id == "user-1"
            return _FakeUserDoc()

    class _FakeStorage:
        async def list_user_skills(
            self,
            user_id: str,
            skip: int = 0,
            limit: int = 100,
            disabled_skills=None,
            q: str | None = None,
            tags=None,
        ):
            assert user_id == "user-1"
            assert skip == 20
            assert limit == 10
            assert disabled_skills == ["archived"]
            assert q == "plan"
            assert tags == ["planning"]
            return [
                {
                    "skill_name": "planner",
                    "enabled": True,
                    "file_count": 1,
                    "file_paths": ["SKILL.md"],
                    "installed_from": "manual",
                    "published_marketplace_name": None,
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-02T00:00:00Z",
                }
            ]

        async def count_user_skills(self, user_id: str, q: str | None = None, tags=None):
            assert user_id == "user-1"
            assert q == "plan"
            assert tags == ["planning"]
            return 37

        async def list_user_skill_tags(self, user_id: str):
            assert user_id == "user-1"
            return ["planning"]

        async def batch_get_skill_md_contents(self, skill_names, user_id: str):
            assert skill_names == ["planner"]
            assert user_id == "user-1"
            return {"planner": "---\nname: planner\ndescription: Plan work\ntags:\n- planning\n---"}

    class _FakeMarketplace:
        async def get_user_published_skills(self, user_id: str):
            assert user_id == "user-1"
            return {}

    monkeypatch.setattr(skill_route, "UserStorage", lambda: _FakeUserStorage())

    app = FastAPI()
    app.include_router(skill_route.router, prefix="/api/skills")
    app.dependency_overrides[api_deps.get_current_user_required] = _fake_user
    app.dependency_overrides[skill_route.get_storage] = lambda: _FakeStorage()
    app.dependency_overrides[skill_route.get_marketplace_storage] = lambda: _FakeMarketplace()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/skills/?skip=20&limit=10&q=plan&tags=planning")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 37
    assert payload["skip"] == 20
    assert payload["limit"] == 10
    assert payload["available_tags"] == ["planning"]
    assert [skill["skill_name"] for skill in payload["skills"]] == ["planner"]
