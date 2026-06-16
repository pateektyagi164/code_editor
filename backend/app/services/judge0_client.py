import logging
import re

import httpx

from app.core.config import get_settings
from app.schemas.execution import ExecutionResult

logger = logging.getLogger(__name__)

LANGUAGE_IDS: dict[str, int] = {
    "python": 71,
    "javascript": 93,
    "nodejs": 93,
    "typescript": 74,
    "java": 91,
    "cpp": 54,
    "c": 50,
    "go": 60,
    "rust": 73,
    "ruby": 72,
    "csharp": 51,
    "php": 68,
    "swift": 83,
    "kotlin": 78,
    "r": 80,
    "dart": 90,
    "scala": 81,
    "bash": 46,
    "sql": 82,
}

LANGUAGE_LABELS: dict[str, str] = {
    "python": "Python 3",
    "javascript": "Node.js",
    "nodejs": "Node.js",
    "typescript": "TypeScript",
    "java": "Java",
    "cpp": "C++",
    "c": "C",
    "go": "Go",
    "rust": "Rust",
    "ruby": "Ruby",
    "csharp": "C#",
    "php": "PHP",
    "swift": "Swift",
    "kotlin": "Kotlin",
    "r": "R",
    "dart": "Dart",
    "scala": "Scala",
    "bash": "Bash",
    "sql": "SQL",
}


class Judge0Error(Exception):
    pass


def get_language_id(language: str) -> int | None:
    return LANGUAGE_IDS.get(language.lower())


def list_supported_languages() -> list[tuple[int, str, str]]:
    ordered_languages = [
        "python",
        "javascript",
        "typescript",
        "cpp",
        "c",
        "java",
        "rust",
        "go",
        "ruby",
        "csharp",
        "php",
        "swift",
        "kotlin",
        "r",
        "dart",
        "scala",
        "bash",
        "sql",
    ]
    return [
        (LANGUAGE_IDS[key], key, LANGUAGE_LABELS[key])
        for key in ordered_languages
    ]


def _build_headers(settings) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.judge0_auth_token:
        headers["X-Auth-Token"] = settings.judge0_auth_token
    return headers


def _extract_error_location(stderr: str) -> tuple[int | None, int | None, str | None]:
    patterns = [
        r'File "([^"]+)", line (\d+)',
        r'([^:\s]+):(\d+):(\d+):\s+(?:error|warning)',
        r'line\s+(\d+),?\s+column\s+(\d+)',
        r':(\d+):(\d+):\s+(?:error|warning)',
    ]

    for pattern in patterns:
        match = re.search(pattern, stderr, re.IGNORECASE)
        if not match:
            continue

        groups = match.groups()
        if len(groups) == 2 and not groups[0].isdigit():
            return int(groups[1]), None, groups[0]
        if len(groups) == 3:
            if groups[0].isdigit():
                return int(groups[0]), int(groups[1]), None
            return int(groups[1]), int(groups[2]), groups[0]
        if len(groups) == 2:
            return int(groups[0]), int(groups[1]), None

    return None, None, None


def _parse_result(raw: dict) -> ExecutionResult:
    status = raw.get("status") or {}
    description = status.get("description", "Unknown")

    stdout = raw.get("stdout") or ""
    stderr = raw.get("stderr") or ""
    compile_output = raw.get("compile_output") or ""

    if compile_output:
        stderr = f"{compile_output}\n{stderr}".strip()

    error_line, error_column, error_file = _extract_error_location(stderr)

    time_str = raw.get("time")
    time_ms = round(float(time_str) * 1000, 2) if time_str else None

    memory = raw.get("memory")
    memory_kb = int(memory) if memory is not None else None

    return ExecutionResult(
        stdout=stdout or None,
        stderr=stderr or None,
        status=description,
        time_ms=time_ms,
        memory_kb=memory_kb,
        exit_code=raw.get("exit_code"),
        error_line=error_line,
        error_column=error_column,
        error_file=error_file,
    )


async def check_health() -> dict:
    settings = get_settings()
    base_url = settings.judge0_api_url.rstrip("/")

    try:
        async with httpx.AsyncClient(
            base_url=base_url,
            timeout=10.0,
            follow_redirects=True,
        ) as client:
            response = await client.get("/about")
            response.raise_for_status()
            info = response.json()
            return {
                "available": True,
                "url": base_url,
                "version": info.get("version"),
            }
    except httpx.HTTPStatusError as exc:
        logger.error("Judge0 health check HTTP error at %s: %s", base_url, exc.response.text)
        return {
            "available": False,
            "url": base_url,
            "error": f"Judge0 returned HTTP {exc.response.status_code}",
        }
    except httpx.RequestError as exc:
        logger.error("Judge0 health check connection error at %s: %s", base_url, exc)
        return {
            "available": False,
            "url": base_url,
            "error": str(exc),
        }


async def run_code(
    *,
    source_code: str,
    language_id: int,
    stdin: str | None = None,
) -> ExecutionResult:
    settings = get_settings()
    base_url = settings.judge0_api_url.rstrip("/")

    payload: dict[str, str | int] = {
        "source_code": source_code,
        "language_id": language_id,
    }
    if stdin:
        payload["stdin"] = stdin

    try:
        async with httpx.AsyncClient(
            base_url=base_url,
            timeout=settings.judge0_timeout_seconds,
            follow_redirects=True,
        ) as client:
            response = await client.post(
                "/submissions",
                params={"base64_encoded": "false", "wait": "true"},
                json=payload,
                headers=_build_headers(settings),
            )
            response.raise_for_status()
            return _parse_result(response.json())
    except httpx.HTTPStatusError as exc:
        response_text = exc.response.text
        logger.error("Judge0 HTTP error at %s: %s", base_url, response_text)
        detail = response_text[:500]
        try:
            body = exc.response.json()
            if isinstance(body, dict):
                detail = body.get("error") or body.get("message") or str(body)
        except ValueError:
            pass
        raise Judge0Error(
            f"Judge0 returned HTTP {exc.response.status_code}: {detail}"
        ) from exc
    except httpx.RequestError as exc:
        logger.error("Judge0 connection error at %s: %s", base_url, exc)
        raise Judge0Error(
            f"Cannot reach Judge0 at {base_url}. "
            "Use JUDGE0_API_URL=https://ce.judge0.com in backend/.env, "
            "or start local Judge0 with: docker compose --profile judge0 up -d"
        ) from exc
