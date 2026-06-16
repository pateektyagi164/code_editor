from fastapi import APIRouter, Depends, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.room import Room
from app.models.user import User
from app.schemas.room import RoomCreateRequest, RoomCreateResponse, RoomRead

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=list[RoomRead])
async def list_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Room)
        .where(Room.owner_id == current_user.id)
        .order_by(desc(Room.created_at))
    )
    rooms = result.scalars().all()
    return [
        RoomRead(
            room_id=room.id,
            name=room.name,
            created_at=room.created_at.isoformat(),
        )
        for room in rooms
    ]


@router.post("", response_model=RoomCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    body: RoomCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = Room(owner_id=current_user.id, name=body.name.strip() or "Untitled Workspace")
    db.add(room)
    await db.flush()
    await db.refresh(room)
    return RoomCreateResponse(room_id=room.id, name=room.name)
