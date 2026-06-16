from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    name: str
    avatar_url: str | None = None


class UserCreate(UserBase):
    provider: str
    provider_id: str


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    provider: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthProvidersResponse(BaseModel):
    google: bool
    github: bool
