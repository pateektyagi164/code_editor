from pydantic import BaseModel, Field


class ExecutionRequest(BaseModel):
    source_code: str = Field(..., min_length=1)
    language_id: int | None = None
    language: str | None = "python"
    stdin: str | None = None


class ExecutionResult(BaseModel):
    stdout: str | None = None
    stderr: str | None = None
    status: str
    time_ms: float | None = None
    memory_kb: int | None = None
    exit_code: int | None = None
    error_line: int | None = None
    error_column: int | None = None
    error_file: str | None = None


class ExecutionHealthResponse(BaseModel):
    available: bool
    url: str
    version: str | None = None
    error: str | None = None


class LanguageInfo(BaseModel):
    id: int
    language: str
    label: str


class LanguagesResponse(BaseModel):
    languages: list[LanguageInfo]
