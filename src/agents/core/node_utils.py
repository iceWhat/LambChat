"""
Agent 节点共享工具函数

从 search_agent/nodes.py 和 fast_agent/nodes.py 中提取的公共逻辑。
"""

from __future__ import annotations

import base64

from langchain_core.messages import HumanMessage

from src.infra.agent import AgentEventProcessor
from src.infra.logging import get_logger

logger = get_logger(__name__)


async def resolve_fallback_model(
    model_id: str | None,
    selected_model: str | None,
    *,
    log_prefix: str = "",
) -> str | None:
    """从 DB 解析 fallback_model ID 到实际的 model value。

    Args:
        model_id: 当前模型的 DB ID（优先）
        selected_model: 当前模型的 value 字符串（备选）
        log_prefix: 日志前缀，如 "[FastAgent]" 或 "[Agent]"

    Returns:
        fallback model 的 value 字符串，或 None（无 fallback / 查询失败）
    """
    from src.infra.agent.model_storage import get_model_storage

    storage = get_model_storage()
    db_model = None

    try:
        if model_id:
            db_model = await storage.get(model_id)
        elif selected_model:
            db_model = await storage.get_by_value(selected_model)
    except Exception as e:
        logger.warning("%s Failed to lookup model config: %s", log_prefix, e)
        return None

    if not db_model or not db_model.fallback_model:
        return None

    try:
        fallback_db = await storage.get(db_model.fallback_model)
    except Exception as e:
        logger.warning("%s Failed to lookup fallback model: %s", log_prefix, e)
        return None

    if fallback_db:
        logger.info(
            "%s Fallback model: %s (%s)",
            log_prefix,
            fallback_db.label,
            fallback_db.value,
        )
        return fallback_db.value

    return None


async def resolve_model_supports_vision(
    model_id: str | None,
    selected_model: str | None,
    *,
    log_prefix: str = "",
) -> bool:
    """Resolve whether the selected model is configured for image input."""
    if not model_id and not selected_model:
        return False

    from src.infra.agent.model_storage import get_model_storage

    storage = get_model_storage()
    db_model = None

    try:
        if model_id:
            db_model = await storage.get(model_id)
        elif selected_model:
            db_model = await storage.get_by_value(selected_model)
    except Exception as e:
        logger.warning("%s Failed to lookup model vision capability: %s", log_prefix, e)
        return False

    if not db_model or not getattr(db_model, "profile", None):
        return False

    return bool(getattr(db_model.profile, "supports_vision", False))


def _is_image_attachment(attachment: dict) -> bool:
    file_type = str(attachment.get("type", "")).lower()
    mime_type = str(attachment.get("mime_type") or attachment.get("mimeType") or "").lower()
    return file_type == "image" or mime_type.startswith("image/")


async def inline_image_attachments_as_data_urls(attachments: list[dict] | None) -> list[dict]:
    """Return attachments with image bytes inlined as data URLs when storage keys exist."""
    if not attachments:
        return []

    from src.infra.storage.s3.service import get_or_init_storage

    storage = await get_or_init_storage()
    inlined: list[dict] = []

    for attachment in attachments:
        if not _is_image_attachment(attachment):
            inlined.append(attachment)
            continue

        key = attachment.get("key")
        if not key:
            inlined.append(attachment)
            continue

        try:
            raw = await storage.download_file(key)
        except Exception as e:
            logger.warning("Failed to inline image attachment %s: %s", key, e)
            inlined.append(attachment)
            continue

        mime_type = attachment.get("mime_type") or attachment.get("mimeType") or "image/jpeg"
        encoded = base64.b64encode(raw).decode("ascii")
        inlined.append(
            {
                **attachment,
                "data_url": f"data:{mime_type};base64,{encoded}",
            }
        )

    return inlined


def _format_attachment_summary(text: str, attachments: list[dict]) -> str:
    enhanced_text = text
    if not attachments:
        return enhanced_text

    enhanced_text += "\n\n---\n**User Uploaded Attachments:**"

    for attachment in attachments:
        url = attachment.get("url", "")
        name = attachment.get("name", "未知文件")
        file_type = attachment.get("type", "document")
        mime_type = attachment.get("mime_type") or attachment.get("mimeType") or ""
        size = attachment.get("size", 0)

        if not url:
            continue

        size_str = ""
        if size:
            if size < 1024:
                size_str = f"{size} B"
            elif size < 1024 * 1024:
                size_str = f"{size / 1024:.1f} KB"
            else:
                size_str = f"{size / (1024 * 1024):.1f} MB"

        enhanced_text += f"\n\n**[{name}]**"
        enhanced_text += f"\n- 类型: {file_type}"
        if mime_type:
            enhanced_text += f" ({mime_type})"
        if size_str:
            enhanced_text += f"\n- 大小: {size_str}"
        enhanced_text += f"\n- 链接: {url}"

    return enhanced_text


def build_human_message(
    text: str,
    attachments: list[dict] | None,
    *,
    supports_vision: bool = False,
) -> HumanMessage:
    """
    构建 HumanMessage，将附件信息以文本形式附加到消息中

    Args:
        text: 用户输入的文本
        attachments: 附件列表，每个附件包含:
            - url: 文件访问链接
            - type: 文件类型 (image/video/audio/document)
            - name: 文件名
            - mime_type: MIME 类型 (可选)
            - size: 文件大小 (可选)

    Returns:
        HumanMessage: 包含文本和附件信息的消息
    """
    if not attachments:
        return HumanMessage(content=text)

    multimodal_images: list[dict] = []
    text_summary_attachments: list[dict] = []

    for attachment in attachments:
        url = attachment.get("url")
        data_url = attachment.get("data_url")
        if supports_vision and _is_image_attachment(attachment) and data_url:
            multimodal_images.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                }
            )
        elif url:
            text_summary_attachments.append(attachment)

    enhanced_text = _format_attachment_summary(text, text_summary_attachments)
    if not multimodal_images:
        return HumanMessage(content=enhanced_text)

    return HumanMessage(
        content=[
            {"type": "text", "text": enhanced_text},
            *multimodal_images,
        ]
    )


async def emit_token_usage(
    event_processor: AgentEventProcessor,
    presenter,
    start_time: float,
    *,
    model_id: str | None = None,
    model: str | None = None,
) -> None:
    """发送 token 使用统计事件"""
    import time

    duration = time.time() - start_time
    try:
        await event_processor.emit_token_usage(
            duration=duration,
            model_id=model_id,
            model=model,
        )
    except Exception as e:
        logger.warning(f"Failed to emit token:usage event: {e}")
