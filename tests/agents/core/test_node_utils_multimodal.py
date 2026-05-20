from types import SimpleNamespace

import pytest
from langchain_core.messages import HumanMessage

from src.agents.core import node_utils
from src.agents.core.node_utils import (
    build_human_message,
    inline_image_attachments_as_data_urls,
)


def image_attachment(**overrides):
    return {
        "id": "img-1",
        "key": "uploads/img.png",
        "name": "img.png",
        "type": "image",
        "mime_type": "image/png",
        "size": 1234,
        "url": "/api/upload/file/uploads/img.png",
        **overrides,
    }


def image_attachment_with_data_url(**overrides):
    return image_attachment(data_url="data:image/png;base64,aW1hZ2UtYnl0ZXM=", **overrides)


def doc_attachment(**overrides):
    return {
        "id": "doc-1",
        "key": "uploads/doc.pdf",
        "name": "doc.pdf",
        "type": "document",
        "mime_type": "application/pdf",
        "size": 2048,
        "url": "/api/upload/file/uploads/doc.pdf",
        **overrides,
    }


def test_vision_model_sends_image_attachment_as_multimodal_block():
    message = build_human_message(
        "what is this?",
        [image_attachment_with_data_url()],
        supports_vision=True,
    )

    assert isinstance(message, HumanMessage)
    assert isinstance(message.content, list)
    assert message.content[0] == {"type": "text", "text": "what is this?"}
    assert message.content[1] == {
        "type": "image_url",
        "image_url": {"url": "data:image/png;base64,aW1hZ2UtYnl0ZXM="},
    }


def test_non_vision_model_keeps_image_attachment_as_text_summary():
    message = build_human_message("what is this?", [image_attachment()], supports_vision=False)

    assert isinstance(message.content, str)
    assert "User Uploaded Attachments" in message.content
    assert "img.png" in message.content
    assert "/api/upload/file/uploads/img.png" in message.content


def test_vision_model_keeps_document_attachments_in_text_summary():
    message = build_human_message(
        "compare these",
        [image_attachment_with_data_url(), doc_attachment()],
        supports_vision=True,
    )

    assert isinstance(message.content, list)
    assert message.content[0]["type"] == "text"
    assert "doc.pdf" in message.content[0]["text"]
    assert message.content[1]["type"] == "image_url"


def test_vision_model_skips_image_blocks_without_url():
    message = build_human_message("what is this?", [image_attachment(url="")], supports_vision=True)

    assert isinstance(message.content, str)
    assert message.content == "what is this?"


class FakeImageStorage:
    async def download_file(self, key):
        assert key == "uploads/img.png"
        return b"image-bytes"


class FailingImageStorage:
    async def download_file(self, _key):
        raise FileNotFoundError("missing")


@pytest.mark.asyncio
async def test_inline_image_attachments_as_data_urls_reads_storage_key(monkeypatch):
    async def fake_get_or_init_storage():
        return FakeImageStorage()

    monkeypatch.setattr(
        "src.infra.storage.s3.service.get_or_init_storage",
        fake_get_or_init_storage,
    )

    attachments = await inline_image_attachments_as_data_urls([image_attachment()])

    assert attachments[0]["data_url"] == "data:image/png;base64,aW1hZ2UtYnl0ZXM="


@pytest.mark.asyncio
async def test_inline_image_attachments_falls_back_without_data_url_on_download_error(
    monkeypatch,
):
    async def fake_get_or_init_storage():
        return FailingImageStorage()

    monkeypatch.setattr(
        "src.infra.storage.s3.service.get_or_init_storage",
        fake_get_or_init_storage,
    )

    attachments = await inline_image_attachments_as_data_urls([image_attachment()])

    assert "data_url" not in attachments[0]
    message = build_human_message("what is this?", attachments, supports_vision=True)
    assert isinstance(message.content, str)
    assert "/api/upload/file/uploads/img.png" in message.content


class FakeStorage:
    async def get(self, model_id):
        if model_id == "vision-id":
            return SimpleNamespace(profile=SimpleNamespace(supports_vision=True))
        return None

    async def get_by_value(self, value):
        if value == "text-model":
            return SimpleNamespace(profile=SimpleNamespace(supports_vision=False))
        return None


@pytest.mark.asyncio
async def test_resolve_model_supports_vision_uses_model_id(monkeypatch):
    monkeypatch.setattr(
        "src.infra.agent.model_storage.get_model_storage",
        lambda: FakeStorage(),
    )

    assert await node_utils.resolve_model_supports_vision("vision-id", None) is True


@pytest.mark.asyncio
async def test_resolve_model_supports_vision_defaults_false(monkeypatch):
    monkeypatch.setattr(
        "src.infra.agent.model_storage.get_model_storage",
        lambda: FakeStorage(),
    )

    assert await node_utils.resolve_model_supports_vision(None, "text-model") is False
    assert await node_utils.resolve_model_supports_vision(None, "missing") is False
