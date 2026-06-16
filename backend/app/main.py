from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.v1.ai import router as ai_router
from app.api.v1.auth import router as auth_router
from app.api.v1.execution import router as execution_router
from app.api.v1.rooms import router as rooms_router
from app.core.config import get_settings
from app.db.session import init_db
from app.services import judge0_client, llm_gateway
from app.services.redis_pubsub import redis_pubsub
from app.websockets.routes import router as ws_router

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await redis_pubsub.connect()

    judge0_health = await judge0_client.check_health()
    if judge0_health["available"]:
        logger.info(
            "Judge0 connected at %s (v%s)",
            judge0_health["url"],
            judge0_health.get("version", "?"),
        )
    else:
        logger.warning(
            "Judge0 unavailable at %s — %s",
            judge0_health["url"],
            judge0_health.get("error", "unknown error"),
        )

    if llm_gateway.is_configured():
        logger.info(
            "AI provider configured: %s (%s)",
            settings.llm_provider,
            llm_gateway.get_model_name(),
        )
    else:
        logger.warning(
            "AI not configured — set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env"
        )

    yield
    await redis_pubsub.disconnect()


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(rooms_router, prefix="/api/v1")
app.include_router(execution_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(ws_router)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.app_env,
    }


@app.get("/api/v1/ping")
async def ping():
    return {"message": "pong"}
