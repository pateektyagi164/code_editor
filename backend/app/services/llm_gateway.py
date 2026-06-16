import json
import logging
from collections.abc import AsyncGenerator

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an expert coding assistant embedded in a real-time collaborative code editor. "
    "Provide concise, actionable answers. When reviewing code, reference specific lines or "
    "patterns. Format code snippets with markdown fences matching the user's language."
)


class LLMError(Exception):
    pass


def is_configured() -> bool:
    settings = get_settings()
    if settings.llm_provider == "gemini":
        return bool(settings.gemini_api_key)
    return bool(settings.openai_api_key)


def get_model_name() -> str:
    settings = get_settings()
    if settings.llm_provider == "gemini":
        return settings.gemini_model
    return settings.openai_model


def _build_user_content(
    message: str,
    code_context: str | None,
    language: str,
    file_name: str,
) -> str:
    if code_context and code_context.strip():
        return (
            f"Current file: {file_name}\n"
            f"Language: {language}\n\n"
            f"Current editor code:\n```{language}\n{code_context.strip()}\n```\n\n"
            f"User request: {message}"
        )
    return message


async def _stream_openai(
    *,
    message: str,
    code_context: str | None,
    language: str,
    file_name: str,
) -> AsyncGenerator[str, None]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise LLMError("OpenAI API key is not configured. Set OPENAI_API_KEY in backend/.env")

    user_content = _build_user_content(message, code_context, language, file_name)
    payload = {
        "model": settings.openai_model,
        "stream": True,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    }

    async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise LLMError(f"OpenAI error {response.status_code}: {body.decode()[:200]}")

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0]["delta"].get("content")
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


async def _stream_gemini(
    *,
    message: str,
    code_context: str | None,
    language: str,
    file_name: str,
) -> AsyncGenerator[str, None]:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise LLMError("Gemini API key is not configured. Set GEMINI_API_KEY in backend/.env")

    user_content = _build_user_content(message, code_context, language, file_name)
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:streamGenerateContent"
    )
    payload = {
        "contents": [{"role": "user", "parts": [{"text": f"{SYSTEM_PROMPT}\n\n{user_content}"}]}]
    }

    async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
        async with client.stream(
            "POST",
            url,
            params={"key": settings.gemini_api_key, "alt": "sse"},
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise LLMError(f"Gemini error {response.status_code}: {body.decode()[:200]}")

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:].strip()
                try:
                    chunk = json.loads(data)
                    parts = chunk["candidates"][0]["content"]["parts"]
                    for part in parts:
                        text = part.get("text")
                        if text:
                            yield text
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


async def stream_chat(
    *,
    message: str,
    code_context: str | None = None,
    language: str = "python",
    file_name: str = "main.py",
) -> AsyncGenerator[str, None]:
    settings = get_settings()

    try:
        if settings.llm_provider == "gemini":
            async for token in _stream_gemini(
                message=message,
                code_context=code_context,
                language=language,
                file_name=file_name,
            ):
                yield token
        else:
            async for token in _stream_openai(
                message=message,
                code_context=code_context,
                language=language,
                file_name=file_name,
            ):
                yield token
    except LLMError:
        raise
    except httpx.RequestError as exc:
        logger.error("LLM connection error: %s", exc)
        raise LLMError("Failed to connect to the AI provider") from exc
