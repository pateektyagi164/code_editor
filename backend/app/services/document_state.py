from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document_state import DocumentState
from app.models.room import Room


async def get_update_blob(db: AsyncSession, room_id: str) -> bytes | None:
    room_uuid = UUID(room_id)
    result = await db.execute(
        select(DocumentState).where(DocumentState.room_id == room_uuid)
    )
    state = result.scalar_one_or_none()
    return state.update_blob if state else None


def _frame_update(update: bytes) -> bytes:
    return len(update).to_bytes(4, "big") + update


async def _get_or_create_state(db: AsyncSession, room_uuid: UUID) -> DocumentState | None:
    room_exists = await db.scalar(select(Room.id).where(Room.id == room_uuid))
    if room_exists is None:
        return None

    result = await db.execute(
        select(DocumentState).where(DocumentState.room_id == room_uuid)
    )
    state = result.scalar_one_or_none()
    if state is None:
        state = DocumentState(room_id=room_uuid, update_blob=b"")
        db.add(state)
    return state


async def append_update_blob(db: AsyncSession, room_id: str, update: bytes) -> bool:
    # Updates are length-prefixed so clients can replay every persisted Yjs update.
    room_uuid = UUID(room_id)
    state = await _get_or_create_state(db, room_uuid)
    if state is None:
        return False

    framed_update = _frame_update(update)
    state.update_blob = (state.update_blob or b"") + framed_update
    await db.flush()
    return True


async def replace_update_blob(db: AsyncSession, room_id: str, update: bytes) -> bool:
    """Replace persisted state with a single framed snapshot (compaction)."""
    room_uuid = UUID(room_id)
    state = await _get_or_create_state(db, room_uuid)
    if state is None:
        return False

    state.update_blob = _frame_update(update)
    await db.flush()
    return True
