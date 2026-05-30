"""Simple LangGraph node for emitting recommended follow-up questions."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from langchain_core.runnables import RunnableConfig

from src.agents.core.base import get_presenter
from src.infra.logging import get_logger
from src.kernel.config import settings

_CJK_RE = re.compile(r"[\u3400-\u9fff]")
logger = get_logger(__name__)


def _compact_topic(user_input: str, max_len: int = 24) -> str:
    topic = " ".join(user_input.strip().split())
    if not topic:
        return ""
    if len(topic) <= max_len:
        return topic
    return topic[:max_len].rstrip("，,。.!！？? ") + "..."


def build_recommend_questions(user_input: str) -> list[str]:
    """Build lightweight fallback follow-up questions."""
    topic = _compact_topic(user_input)
    if _CJK_RE.search(user_input):
        if topic:
            return [
                f"{topic}还有哪些关键步骤？",
                f"{topic}有哪些常见误区？",
                "下一步我应该怎么做？",
            ]
        return ["还有哪些关键步骤？", "有哪些常见误区？", "下一步我应该怎么做？"]

    if topic:
        return [
            f"What are the key next steps for {topic}?",
            f"What are common mistakes with {topic}?",
            "What should I do next?",
        ]
    return [
        "What are the key next steps?",
        "What are common mistakes?",
        "What should I do next?",
    ]


def _extract_text(content: Any) -> str:
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                return str(item.get("text", "")).strip()
        return str(content[0]).strip() if content else ""
    return str(content).strip()


def _parse_questions(raw_text: str) -> list[str]:
    text = raw_text.strip().strip("`")
    if text.startswith("json"):
        text = text[4:].strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, list):
        questions = [str(item).strip() for item in parsed if str(item).strip()]
    elif isinstance(parsed, dict):
        raw_questions = parsed.get("questions")
        questions = (
            [str(item).strip() for item in raw_questions if str(item).strip()]
            if isinstance(raw_questions, list)
            else []
        )
    else:
        questions = [line.strip(" -0123456789.、") for line in text.splitlines() if line.strip()]

    return questions[:3]


async def _ainvoke_with_retry(model: Any, prompt: str, max_retries: int | None = None) -> Any:
    retries: int = (
        max_retries
        if isinstance(max_retries, int)
        else int(getattr(settings, "LLM_MAX_RETRIES", 3))
    )
    last_error: Exception | None = None

    for attempt in range(retries):
        try:
            return await model.ainvoke(prompt)
        except Exception as exc:
            last_error = exc
            if attempt >= retries - 1:
                raise
            await asyncio.sleep(settings.LLM_RETRY_DELAY * (2**attempt))

    if last_error is not None:
        raise last_error
    raise RuntimeError("Unexpected state: no error but retry loop exhausted")


async def generate_recommend_questions(user_input: str, output_text: str = "") -> list[str]:
    """Generate follow-up questions using the same model config as session titles."""
    from src.infra.llm.client import LLMClient

    prompt = (
        "Generate exactly 3 concise follow-up questions for a chat UI.\n"
        "Use the same language as the user message.\n"
        "Return ONLY a JSON array of strings, no markdown, no explanation.\n\n"
        f"User message:\n{user_input[:800]}\n\n"
        f"Assistant answer:\n{output_text[:1200]}"
    )

    try:
        model = await LLMClient.get_model(
            model=settings.SESSION_TITLE_MODEL,
            api_base=settings.SESSION_TITLE_API_BASE or None,
            api_key=settings.SESSION_TITLE_API_KEY or None,
            max_tokens=300,
            max_retries=settings.LLM_MAX_RETRIES,
        )
        response = await _ainvoke_with_retry(model, prompt)
        questions = _parse_questions(_extract_text(response.content))
        if questions:
            return questions
    except Exception as exc:
        logger.debug("Failed to generate recommended questions with LLM: %s", exc)

    return build_recommend_questions(user_input)


async def recommendation_node(
    state: dict[str, Any],
    config: RunnableConfig,
) -> dict[str, Any]:
    """Emit recommended questions as the final graph node."""
    presenter = get_presenter(config)
    if getattr(presenter, "recommend_questions_recorded", False):
        return {}
    questions = await generate_recommend_questions(
        str(state.get("input") or ""),
        str(state.get("output") or ""),
    )
    if questions:
        await presenter.emit_recommend_questions(questions)
    return {}


def schedule_recommend_questions(presenter: Any, user_input: str) -> asyncio.Task:
    """Start recommendation generation in the background without blocking chat."""

    async def run() -> None:
        if getattr(presenter, "recommend_questions_recorded", False):
            return
        questions = await generate_recommend_questions(user_input)
        if questions:
            await presenter.emit_recommend_questions(questions)

    task = asyncio.create_task(run())

    def log_failure(done_task: asyncio.Task) -> None:
        if done_task.cancelled():
            return
        try:
            done_task.result()
        except Exception as exc:
            logger.warning("Recommended question background task failed: %s", exc)

    task.add_done_callback(log_failure)
    return task
