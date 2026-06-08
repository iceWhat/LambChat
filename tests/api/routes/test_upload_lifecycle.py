from __future__ import annotations

import pytest

from src.api.routes import upload


@pytest.mark.asyncio
async def test_close_upload_route_dependencies_drains_delete_tasks_and_closes_records(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    class _DeleteTasks:
        async def drain(self) -> None:
            calls.append("drain")

    class _RecordStorage:
        async def close(self) -> None:
            calls.append("records")

    monkeypatch.setattr(upload, "_upload_delete_tasks", _DeleteTasks())
    monkeypatch.setattr(upload, "_file_record_storage", _RecordStorage())

    await upload.close_upload_route_dependencies()

    assert calls == ["drain", "records"]
