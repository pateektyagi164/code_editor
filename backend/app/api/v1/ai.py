import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.models.user import User
from app.schemas.ai import AIStatusResponse, ChatRequest
from app.services import llm_gateway
from app.services.llm_gateway import LLMError

router = APIRouter(prefix="/ai", tags=["ai"])
settings = get_settings()


@router.get("/status", response_model=AIStatusResponse)
async def ai_status():
    return AIStatusResponse(
        configured=llm_gateway.is_configured(),
        provider=settings.llm_provider,
        model=llm_gateway.get_model_name(),
    )


@router.post("/chat/stream")
async def stream_chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    if not llm_gateway.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"AI provider '{settings.llm_provider}' is not configured. "
                "Add OPENAI_API_KEY or GEMINI_API_KEY to backend/.env"
            ),
        )

    async def event_generator():
        try:
            async for token in llm_gateway.stream_chat(
                message=body.message,
                code_context=body.code_context,
                language=body.language,
                file_name=body.file_name,
            ):
                yield f"data: {json.dumps({'content': token})}\n\n"
            yield "data: [DONE]\n\n"
        except LLMError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
