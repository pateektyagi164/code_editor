from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.models.user import User
from app.schemas.execution import (
    ExecutionHealthResponse,
    ExecutionRequest,
    ExecutionResult,
    LanguageInfo,
    LanguagesResponse,
)
from app.services import judge0_client
from app.services.judge0_client import Judge0Error

router = APIRouter(prefix="/execution", tags=["execution"])
settings = get_settings()


@router.get("/health", response_model=ExecutionHealthResponse)
async def execution_health():
    health = await judge0_client.check_health()
    return ExecutionHealthResponse(**health)


@router.get("/languages", response_model=LanguagesResponse)
async def list_languages():
    languages = [
        LanguageInfo(id=lang_id, language=language, label=label)
        for lang_id, language, label in judge0_client.list_supported_languages()
    ]
    return LanguagesResponse(languages=languages)


@router.post("/run", response_model=ExecutionResult)
async def run_code(
    body: ExecutionRequest,
    current_user: User = Depends(get_current_user),
):
    if len(body.source_code.encode("utf-8")) > settings.execution_max_source_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Source code exceeds {settings.execution_max_source_bytes} bytes",
        )

    language_id = body.language_id
    if language_id is None and body.language:
        language_id = judge0_client.get_language_id(body.language)

    if language_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language: {body.language}",
        )

    try:
        return await judge0_client.run_code(
            source_code=body.source_code,
            language_id=language_id,
            stdin=body.stdin,
        )
    except Judge0Error as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
