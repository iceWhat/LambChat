from __future__ import annotations

import json
from typing import Any

import pytest

from src.infra.skill.storage import SkillStorage


class _AsyncCursor:
    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = docs
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._docs):
            raise StopAsyncIteration
        doc = self._docs[self._index]
        self._index += 1
        return doc


class _FakeSkillFilesCollection:
    def __init__(self) -> None:
        self.aggregate_pipelines: list[list[dict[str, Any]]] = []

    def aggregate(self, pipeline: list[dict[str, Any]]) -> _AsyncCursor:
        self.aggregate_pipelines.append(pipeline)
        return _AsyncCursor(
            [
                {
                    "_id": "planner",
                    "file_count": 2,
                    "file_paths": ["SKILL.md", "notes.md"],
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-02T00:00:00Z",
                }
            ]
        )

    def find(self, query: dict[str, Any], projection: dict[str, int]) -> _AsyncCursor:
        assert query == {
            "skill_name": {"$in": ["planner"]},
            "user_id": "user-1",
            "file_path": "__meta__",
        }
        assert projection == {"skill_name": 1, "content": 1}
        return _AsyncCursor(
            [
                {
                    "skill_name": "planner",
                    "content": json.dumps(
                        {
                            "installed_from": "manual",
                            "published_marketplace_name": "public-planner",
                        }
                    ),
                }
            ]
        )


@pytest.mark.asyncio
async def test_list_user_skills_without_filters_returns_paginated_skills(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    collection = _FakeSkillFilesCollection()
    storage = SkillStorage()
    monkeypatch.setattr(storage, "_get_files_collection", lambda: collection)

    skills = await storage.list_user_skills(
        "user-1",
        skip=20,
        limit=10,
        disabled_skills=["planner"],
    )

    assert skills == [
        {
            "skill_name": "planner",
            "enabled": False,
            "file_count": 2,
            "file_paths": ["SKILL.md", "notes.md"],
            "installed_from": "manual",
            "published_marketplace_name": "public-planner",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "is_pinned": False,
            "is_favorite": False,
        }
    ]
    assert collection.aggregate_pipelines[0][-2:] == [{"$skip": 20}, {"$limit": 10}]
