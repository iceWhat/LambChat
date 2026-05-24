"""Shared grep helpers for sandbox backends."""

from __future__ import annotations

import shlex

from deepagents.backends.protocol import ExecuteResponse, GrepMatch

_DEFAULT_GREP_TIMEOUT = 30
_EXCLUDED_GLOB_PATTERNS = (
    "!node_modules/**",
    "!.git/**",
    "!dist/**",
    "!build/**",
    "!.venv/**",
    "!venv/**",
    "!__pycache__/**",
)
_EXCLUDED_GREP_DIRECTORIES = (
    "node_modules",
    ".git",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
)
_EXCLUDED_GREP_FILES = ("*.tsbuildinfo",)


def _join_shell_args(args: list[str]) -> str:
    return " ".join(shlex.quote(arg) for arg in args)


def get_sandbox_grep_timeout(settings_obj: object) -> int:
    """Return the configured grep timeout with a stable fallback."""
    value = getattr(settings_obj, "SANDBOX_GREP_TIMEOUT", _DEFAULT_GREP_TIMEOUT)
    try:
        timeout = int(value)
    except (TypeError, ValueError):
        return _DEFAULT_GREP_TIMEOUT
    return max(1, timeout)


def build_grep_command(pattern: str, path: str | None = None, glob: str | None = None) -> str:
    """Build a literal recursive grep command optimized for large code repositories."""
    search_path = path or "."
    rg_globs = ([glob] if glob else []) + list(_EXCLUDED_GLOB_PATTERNS)
    rg_args = [
        "rg",
        "-nH",
        "--no-heading",
        "--color=never",
        "--no-messages",
        "-F",
    ]
    for rg_glob in rg_globs:
        rg_args.extend(("-g", rg_glob))
    rg_args.extend((pattern, search_path))

    grep_args = ["grep", "-rHnIF"]
    if glob:
        grep_args.append(f"--include={glob}")
    grep_args.extend(f"--exclude-dir={directory}" for directory in _EXCLUDED_GREP_DIRECTORIES)
    grep_args.extend(f"--exclude={file_name}" for file_name in _EXCLUDED_GREP_FILES)
    grep_args.extend(("-e", pattern, search_path))

    rg_command = _join_shell_args(rg_args)
    grep_command = f"{_join_shell_args(grep_args)} 2>/dev/null"
    return (
        "if command -v rg >/dev/null 2>&1; "
        f"then {rg_command} || true; "
        f"else {grep_command} || true; "
        "fi"
    )


def parse_grep_response(result: ExecuteResponse, timeout: int) -> list[GrepMatch] | str:
    """Parse grep output or surface a user-facing timeout error."""
    output = result.output.rstrip()
    if result.exit_code == -1 and "timed out" in output.lower():
        return f"Error: grep timed out after {timeout}s. Try a more specific pattern or a narrower path."

    if not output:
        return []

    matches: list[GrepMatch] = []
    for line in output.split("\n"):
        parts = line.split(":", 2)
        if len(parts) < 3:
            continue
        try:
            line_number = int(parts[1])
        except ValueError:
            continue
        matches.append({"path": parts[0], "line": line_number, "text": parts[2]})

    return matches
