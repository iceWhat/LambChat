"""OpenAI-compatible image generation tool for LambChat agents."""

from __future__ import annotations

import base64
import json
import mimetypes
import re
import sys
from enum import Enum
from typing import Annotated, Any
from urllib.parse import urlparse

import httpx
from langchain_core.tools import BaseTool, InjectedToolArg

from src.infra.logging import get_logger
from src.infra.storage.s3.service import get_or_init_storage
from src.infra.tool.backend_utils import (
    get_base_url_from_runtime,
    get_user_id_from_runtime,
)
from src.infra.utils.datetime import utc_now
from src.kernel.config import settings

try:
    from langchain.tools import ToolRuntime  # type: ignore[assignment]
except ImportError:  # pragma: no cover
    _mod = type(sys)("langchain.tools")
    _mod.ToolRuntime = Any  # type: ignore[attr-defined]
    sys.modules.setdefault("langchain.tools", _mod)
    from langchain.tools import ToolRuntime  # type: ignore[assignment]

from langchain.tools import tool  # noqa: E402

logger = get_logger(__name__)

DEFAULT_IMAGE_GENERATION_BASE_URL = "https://api.openai.com/v1"
DEFAULT_IMAGE_GENERATION_MODEL = "gpt-image-2"


class ImageBackground(str, Enum):
    AUTO = "auto"
    OPAQUE = "opaque"
    TRANSPARENT = "transparent"


class ImageInputFidelity(str, Enum):
    LOW = "low"
    HIGH = "high"


class ImageSize(str, Enum):
    SQUARE = "1024x1024"
    PORTRAIT = "1024x1536"
    LANDSCAPE = "1536x1024"


class ImageQuality(str, Enum):
    AUTO = "auto"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ImageOutputFormat(str, Enum):
    PNG = "png"
    JPEG = "jpeg"
    WEBP = "webp"


def _json(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)


def _strip_data_url_prefix(value: str) -> tuple[str, str]:
    match = re.match(r"^data:([^;]+);base64,(.+)$", value, re.DOTALL)
    if not match:
        return "", value
    return match.group(1), match.group(2)


def _guess_mime(filename: str, fallback: str = "image/png") -> str:
    mime, _ = mimetypes.guess_type(filename)
    return mime or fallback


def _generated_filename(mime: str, index: int) -> str:
    ext = (mimetypes.guess_extension(mime) or ".png").lstrip(".")
    timestamp = utc_now().strftime("%Y%m%d_%H%M%S")
    return f"generated-{timestamp}-{index + 1}.{ext}"


def _filename_from_url(url: str, index: int) -> str:
    parsed = urlparse(url)
    name = parsed.path.rstrip("/").split("/")[-1]
    if name:
        return name
    return f"image-{index + 1}.png"


def _resolve_base_url() -> str:
    base_url = (
        getattr(settings, "IMAGE_GENERATION_BASE_URL", "") or DEFAULT_IMAGE_GENERATION_BASE_URL
    )
    return str(base_url).rstrip("/")


def _resolve_model() -> str:
    model = getattr(settings, "IMAGE_GENERATION_MODEL", "") or DEFAULT_IMAGE_GENERATION_MODEL
    return str(model).strip() or DEFAULT_IMAGE_GENERATION_MODEL


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def _normalize_image_size(size: Any) -> str:
    value = _enum_value(size).strip()
    if not value:
        return "1024x1024"
    if value in {item.value for item in ImageSize}:
        return value

    match = re.fullmatch(r"(\d+)x(\d+)", value)
    if not match:
        return value

    width = int(match.group(1))
    height = int(match.group(2))
    if width <= 0 or height <= 0:
        return "1024x1024"

    ratio = width / height
    supported = {
        "1024x1024": 1.0,
        "1024x1536": 1024 / 1536,
        "1536x1024": 1536 / 1024,
    }
    return min(supported, key=lambda candidate: abs(supported[candidate] - ratio))


async def _download_image_source(
    url: str,
    runtime: ToolRuntime | None,
    *,
    index: int = 0,
) -> tuple[bytes, str, str]:
    resolved = url
    if resolved.startswith("/"):
        base_url = get_base_url_from_runtime(runtime)
        if base_url:
            resolved = f"{base_url}{resolved}"

    if resolved.startswith("data:"):
        mime, data = _strip_data_url_prefix(resolved)
        decoded = base64.b64decode(data)
        ext = (mimetypes.guess_extension(mime) or ".png").lstrip(".")
        return decoded, mime or "image/png", f"inline-image-{index + 1}.{ext}"

    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        response = await client.get(resolved)
        response.raise_for_status()
        content = response.content
        content_type = response.headers.get("content-type", "") or _guess_mime(resolved)
        filename = _filename_from_url(resolved, index)
        return content, content_type, filename


async def _upload_image_bytes(
    data: bytes,
    *,
    user_id: str,
    filename: str,
    content_type: str,
) -> dict[str, Any]:
    storage = await get_or_init_storage()
    result = await storage.upload_bytes(
        data,
        folder=f"generated-images/{user_id}",
        filename=filename,
        content_type=content_type,
    )
    return {
        "key": result.key,
        "url": result.url,
        "size": getattr(result, "size", len(data)),
        "content_type": getattr(result, "content_type", content_type),
    }


def _extract_image_payload(data: dict[str, Any]) -> tuple[bytes, str]:
    if isinstance(data.get("b64_json"), str) and data["b64_json"].strip():
        raw = base64.b64decode(data["b64_json"])
        return raw, "image/png"

    if isinstance(data.get("url"), str) and data["url"].strip():
        parsed = urlparse(data["url"])
        filename = parsed.path.rstrip("/").split("/")[-1] or "image.png"
        mime = _guess_mime(filename)
        return b"", mime

    if isinstance(data.get("base64"), str) and data["base64"].strip():
        raw = base64.b64decode(data["base64"])
        return raw, "image/png"

    if isinstance(data.get("data"), str) and data["data"].strip():
        raw = base64.b64decode(data["data"])
        return raw, "image/png"

    raise ValueError("Image API response did not include a readable image payload")


async def _convert_result_item(
    item: dict[str, Any],
    *,
    user_id: str,
    runtime: ToolRuntime | None,
    index: int,
) -> dict[str, Any]:
    payload = item.get("result") if isinstance(item.get("result"), dict) else item
    if not isinstance(payload, dict):
        raise ValueError("Image API response item is not an object")

    image_bytes, mime = _extract_image_payload(payload)
    if not image_bytes and isinstance(payload.get("url"), str):
        source_bytes, source_mime, _ = await _download_image_source(payload["url"], runtime)
        image_bytes = source_bytes
        mime = source_mime
    filename = _generated_filename(mime, index)

    uploaded = await _upload_image_bytes(
        image_bytes,
        user_id=user_id,
        filename=filename,
        content_type=mime,
    )
    base_url = get_base_url_from_runtime(runtime)
    proxy_url = (
        f"{base_url}/api/upload/file/{uploaded['key']}"
        if base_url
        else f"/api/upload/file/{uploaded['key']}"
    )
    result: dict[str, Any] = {
        "url": proxy_url,
        "key": uploaded["key"],
        "content_type": uploaded["content_type"],
    }
    if payload.get("revised_prompt"):
        result["revised_prompt"] = payload.get("revised_prompt")
    return result


async def _call_generation_api(
    *,
    prompt: str,
    background: str,
    size: str,
    quality: str,
    n: int,
    output_format: str,
    runtime: ToolRuntime | None,
) -> dict[str, Any]:
    api_key = getattr(settings, "IMAGE_GENERATION_API_KEY", "") or ""
    if not api_key:
        return {"error": "IMAGE_GENERATION_API_KEY is not configured"}

    base_url = _resolve_base_url()
    model = _resolve_model()
    timeout = getattr(settings, "IMAGE_GENERATION_TIMEOUT", 120) or 120
    user_id = get_user_id_from_runtime(runtime) or "anonymous"

    headers = {
        "Authorization": f"Bearer {api_key}",
    }
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "background": _enum_value(background),
        "size": _normalize_image_size(size),
        "quality": _enum_value(quality),
        "n": max(1, min(int(n), 10)),
        "output_format": _enum_value(output_format),
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{base_url}/images/generations",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        body = response.json()

    items = []
    if isinstance(body, dict):
        raw_items = body.get("data")
        if isinstance(raw_items, list):
            items = [item for item in raw_items if isinstance(item, dict)]
        elif isinstance(raw_items, dict):
            items = [raw_items]

    if not items:
        return {
            "error": "Image API did not return any image data",
            "raw_response": body,
        }

    images = []
    for index, item in enumerate(items):
        images.append(
            await _convert_result_item(
                item,
                user_id=user_id,
                runtime=runtime,
                index=index,
            )
        )

    return {
        "success": True,
        "images": images,
    }


async def _call_edit_api(
    *,
    prompt: str,
    input_images: list[str],
    background: str,
    input_fidelity: str,
    size: str,
    quality: str,
    n: int,
    output_format: str,
    runtime: ToolRuntime | None,
) -> dict[str, Any]:
    api_key = getattr(settings, "IMAGE_GENERATION_API_KEY", "") or ""
    if not api_key:
        return {"error": "IMAGE_GENERATION_API_KEY is not configured"}

    base_url = _resolve_base_url()
    model = _resolve_model()
    timeout = getattr(settings, "IMAGE_GENERATION_TIMEOUT", 120) or 120
    user_id = get_user_id_from_runtime(runtime) or "anonymous"

    files: list[tuple[str, tuple[str, bytes, str]]] = []
    for index, image_url in enumerate(input_images[:16]):
        image_bytes, content_type, filename = await _download_image_source(
            image_url,
            runtime,
            index=index,
        )
        files.append(("image", (filename, image_bytes, content_type)))

    data: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "background": _enum_value(background),
        "input_fidelity": _enum_value(input_fidelity),
        "size": _normalize_image_size(size),
        "quality": _enum_value(quality),
        "n": max(1, min(int(n), 10)),
        "output_format": _enum_value(output_format),
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{base_url}/images/edits",
            headers={"Authorization": f"Bearer {api_key}"},
            data=data,
            files=files,
        )
        response.raise_for_status()
        body = response.json()

    items = []
    if isinstance(body, dict):
        raw_items = body.get("data")
        if isinstance(raw_items, list):
            items = [item for item in raw_items if isinstance(item, dict)]
        elif isinstance(raw_items, dict):
            items = [raw_items]

    if not items:
        return {
            "error": "Image API did not return any image data",
            "raw_response": body,
        }

    images = []
    for index, item in enumerate(items):
        images.append(
            await _convert_result_item(
                item,
                user_id=user_id,
                runtime=runtime,
                index=index,
            )
        )

    return {
        "success": True,
        "images": images,
    }


@tool
async def image_generate(
    prompt: Annotated[str, "Describe the image you want to create or edit."],
    input_images: Annotated[
        list[str] | None,
        "Optional source image URLs or project file URLs. Provide one or more images to switch to image-to-image mode; leave empty for pure text-to-image.",
    ] = None,
    background: Annotated[
        ImageBackground,
        "Background handling for the generated image. Choose auto, opaque, or transparent.",
    ] = ImageBackground.AUTO,
    input_fidelity: Annotated[
        ImageInputFidelity,
        "How strongly edits should preserve the input image. Choose low or high.",
    ] = ImageInputFidelity.LOW,
    size: Annotated[
        ImageSize,
        "Canvas size for the result. Choose square, portrait, or landscape.",
    ] = ImageSize.SQUARE,
    quality: Annotated[
        ImageQuality,
        "Generation quality. Choose auto, low, medium, or high.",
    ] = ImageQuality.AUTO,
    n: Annotated[
        int,
        "Number of images to generate. Values outside 1-10 are clamped.",
    ] = 1,
    output_format: Annotated[
        ImageOutputFormat,
        "Output file format. Choose png, jpeg, or webp.",
    ] = ImageOutputFormat.PNG,
    runtime: Annotated[ToolRuntime, InjectedToolArg] = None,  # type: ignore[assignment]
) -> str:
    """Generate or edit images with an OpenAI-compatible image API.

    Use this tool for either:
    - text-to-image generation when only `prompt` is provided
    - image-to-image editing when `input_images` is provided

    The tool accepts a small, opinionated set of options for canvas size, edit fidelity,
    background handling, quality, and output format. Input images can be uploaded files,
    project file URLs, or other accessible image URLs.

    The response contains uploaded image URLs plus metadata such as the generated file key
    and any revised prompt returned by the image API.
    """
    try:
        if input_images:
            result = await _call_edit_api(
                prompt=prompt,
                input_images=list(input_images),
                background=background,
                input_fidelity=input_fidelity,
                size=size,
                quality=quality,
                n=n,
                output_format=output_format,
                runtime=runtime,
            )
        else:
            result = await _call_generation_api(
                prompt=prompt,
                background=background,
                size=size,
                quality=quality,
                n=n,
                output_format=output_format,
                runtime=runtime,
            )
        return _json(result)
    except Exception as exc:
        logger.warning("[image_generate] failed: %s", exc)
        return _json({"error": f"Image generation failed: {exc}"})


def get_image_generation_tool() -> BaseTool:
    return image_generate
