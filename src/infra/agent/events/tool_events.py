"""Generic tool start/end event handling."""

from __future__ import annotations

import json
import uuid
from typing import Any

import orjson

from src.infra.agent.events.binary_uploads import upload_binary_blocks
from src.infra.agent.events.tool_outputs import (
    detect_tool_error,
    extract_tool_output,
    normalize_content,
)
from src.infra.agent.events.types import StreamEvent


class ToolEventMixin:
    _presenter_emit: Any
    presenter: Any
    _base_url: str
    _started_tool_call_ids: set[str]

    def _get_tool_call_id(self, event: StreamEvent) -> str:
        return event.get("run_id") or f"tool_{uuid.uuid4().hex}"

    def _format_tool_error(self, tool_name: str, error: Any) -> str:
        if error is None:
            return f"[MCP Tool Error] {tool_name} failed: Unknown error"

        if isinstance(error, BaseException):
            error_type = type(error).__name__
            error_message = str(error) if str(error) else repr(error)
            return f"[MCP Tool Error] {tool_name} failed: [{error_type}] {error_message}"

        if isinstance(error, dict):
            error_type = error.get("type") or error.get("name") or "ToolError"
            error_message = error.get("message") or error.get("error") or str(error)
            return f"[MCP Tool Error] {tool_name} failed: [{error_type}] {error_message}"

        error_message = str(error) if str(error) else repr(error)
        if error_message.startswith("[MCP Tool Error]"):
            return error_message
        return f"[MCP Tool Error] {tool_name} failed: {error_message}"

    async def _handle_tool_start(
        self,
        event: StreamEvent,
        tool_name: str,
        current_agent_id: str | None,
        current_depth: int,
    ) -> None:
        inp: dict[str, Any] = event.get("data", {}).get("input", {})
        tool_call_id = self._get_tool_call_id(event)

        if tool_name == "write_todos":
            if isinstance(inp, dict):
                todos = inp.get("todos", [])
                if isinstance(todos, list) and todos:
                    await self._presenter_emit(
                        self.presenter.present_todo(
                            todos,
                            depth=current_depth,
                            agent_id=current_agent_id,
                        )
                    )
            return

        self._started_tool_call_ids.add(tool_call_id)
        await self._presenter_emit(
            self.presenter.present_tool_start(
                tool_name,
                inp,
                tool_call_id=tool_call_id,
                depth=current_depth,
                agent_id=current_agent_id,
            )
        )

    async def _handle_tool_end(
        self,
        event: StreamEvent,
        tool_name: str,
        current_agent_id: str | None,
        current_depth: int,
    ) -> None:
        if tool_name == "write_todos":
            return

        data = event.get("data", {})
        out = data.get("output", "")
        tool_call_id = self._get_tool_call_id(event)

        raw = extract_tool_output(out)
        is_error, error_message = detect_tool_error(out, raw)

        result: Any = raw
        if isinstance(raw, str) and raw and raw[0] in ("{", "["):
            try:
                parsed = orjson.loads(raw)
            except orjson.JSONDecodeError:
                try:
                    parsed = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    parsed = None
            except TypeError:
                parsed = None

            if isinstance(parsed, dict):
                result = parsed
            elif isinstance(parsed, list):
                normalized = normalize_content(parsed)
                result = normalized if isinstance(normalized, dict) else str(normalized)

        if isinstance(result, dict) and "blocks" in result:
            await upload_binary_blocks(result, self._base_url)

        await self._presenter_emit(
            self.presenter.present_tool_result(
                tool_name,
                result if isinstance(result, dict) else str(result),
                tool_call_id=tool_call_id,
                success=not is_error,
                error=error_message,
                depth=current_depth,
                agent_id=current_agent_id,
            )
        )
        self._started_tool_call_ids.discard(tool_call_id)

    async def _handle_tool_error(
        self,
        event: StreamEvent,
        tool_name: str,
        current_agent_id: str | None,
        current_depth: int,
    ) -> None:
        data = event.get("data", {})
        inp: dict[str, Any] = data.get("input", {})
        tool_call_id = self._get_tool_call_id(event)

        if tool_call_id not in self._started_tool_call_ids:
            await self._presenter_emit(
                self.presenter.present_tool_start(
                    tool_name,
                    inp,
                    tool_call_id=tool_call_id,
                    depth=current_depth,
                    agent_id=current_agent_id,
                )
            )

        error_message = self._format_tool_error(tool_name, data.get("error"))
        await self._presenter_emit(
            self.presenter.present_tool_result(
                tool_name,
                error_message,
                tool_call_id=tool_call_id,
                success=False,
                error=error_message,
                depth=current_depth,
                agent_id=current_agent_id,
            )
        )
        self._started_tool_call_ids.discard(tool_call_id)
