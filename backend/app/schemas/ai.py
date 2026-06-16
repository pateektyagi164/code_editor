from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    code_context: str | None = Field(default=None, max_length=32000)
    language: str = "python"
    file_name: str = "main.py"


class AIStatusResponse(BaseModel):
    configured: bool
    provider: str
    model: str
