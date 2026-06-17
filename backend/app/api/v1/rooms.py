from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.room import Room
from app.models.user import User
from app.schemas.room import RoomCreateRequest, RoomCreateResponse, RoomRead, RoomUpdateRequest

router = APIRouter(prefix="/rooms", tags=["rooms"])


async def _unique_room_name(db: AsyncSession, owner_id, requested_name: str) -> str:
    base_name = requested_name.strip() or "Untitled Workspace"
    result = await db.execute(select(Room.name).where(Room.owner_id == owner_id))
    existing = {name for (name,) in result.all()}
    if base_name not in existing:
        return base_name

    index = 1
    while f"{base_name} ({index})" in existing:
        index += 1
    return f"{base_name} ({index})"


async def _get_room_or_404(db: AsyncSession, room_id: UUID) -> Room:
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return room


@router.get("", response_model=list[RoomRead])
@router.get("/", response_model=list[RoomRead], include_in_schema=False)
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
@router.post("/", response_model=RoomCreateResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_room(
    body: RoomCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = Room(owner_id=current_user.id, name=await _unique_room_name(db, current_user.id, body.name))
    db.add(room)
    await db.flush()
    await db.refresh(room)
    return RoomCreateResponse(room_id=room.id, name=room.name)


@router.get("/{room_id}", response_model=RoomRead)
async def get_room(
    room_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room_or_404(db, room_id)
    return RoomRead(
        room_id=room.id,
        name=room.name,
        created_at=room.created_at.isoformat(),
    )


@router.patch("/{room_id}", response_model=RoomRead)
async def update_room(
    room_id: UUID,
    body: RoomUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room_or_404(db, room_id)
    if room.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can rename this workspace")
    if body.name is not None:
        room.name = await _unique_room_name(db, current_user.id, body.name)
    await db.flush()
    await db.refresh(room)
    return RoomRead(
        room_id=room.id,
        name=room.name,
        created_at=room.created_at.isoformat(),
    )


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await _get_room_or_404(db, room_id)
    if room.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can delete this workspace")
    await db.delete(room)
    await db.flush()
    return None
