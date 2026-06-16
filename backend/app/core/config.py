from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "Code Collab"
    app_env: str = "development"
    debug: bool = True

    database_url: str = "postgresql+asyncpg://codecollab:codecollab@localhost:5435/codecollab"
    redis_url: str = "redis://localhost:6380/0"

    secret_key: str = "change-me-to-a-random-secret-key-in-production"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    frontend_url: str = "http://localhost:5173"
    cors_origins: List[str] = ["http://localhost:5173"]

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"

    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/api/v1/auth/github/callback"

    # Public Judge0 CE works out of the box on Windows/macOS.
    # For self-hosted: set to http://localhost:2358 and run `docker compose --profile judge0 up -d`
    judge0_api_url: str = "https://ce.judge0.com"
    judge0_auth_token: str = ""
    judge0_timeout_seconds: float = 60.0
    execution_max_source_bytes: int = 65536

    llm_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    llm_timeout_seconds: float = 120.0

    @property
    def cookie_secure(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
