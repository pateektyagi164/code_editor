from uuid import UUID

from pydantic import BaseModel, Field


class RoomCreateRequest(BaseModel):
    name: str = Field(default="Untitled Workspace", min_length=1, max_length=120)


class RoomUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


class RoomCreateResponse(BaseModel):
    room_id: UUID
    name: str


class RoomRead(BaseModel):
    room_id: UUID
    name: str
    created_at: str
