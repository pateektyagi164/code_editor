import contextlib
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.core.security import ACCESS_COOKIE_NAME, decode_access_token
from app.crud import crud_user
from app.db.session import AsyncSessionLocal
from app.services.document_state import append_update_blob, get_update_blob, replace_update_blob
from app.services.redis_pubsub import INSTANCE_ID, redis_pubsub, unwrap_message, wrap_message
from app.websockets.connection_manager import connection_manager

router = APIRouter()

MSG_UPDATE = 0x00
MSG_SYNC_REQUEST = 0x01
MSG_SYNC_RESPONSE = 0x02
MSG_PRESENCE = 0x03
MSG_PING = 0x04
MSG_PONG = 0x05
MSG_AWARENESS = 0x06
MSG_SNAPSHOT = 0x07

CRDT_MESSAGE_TYPES = {
    MSG_UPDATE,
    MSG_SYNC_REQUEST,
    MSG_SYNC_RESPONSE,
    MSG_AWARENESS,
    MSG_SNAPSHOT,
}


async def _authenticate(token: str):
    if not token:
        return None
    user_id = decode_access_token(token)
    if user_id is None:
        return None

    with contextlib.suppress(ValueError):
        user_uuid = UUID(user_id)
        async with AsyncSessionLocal() as db:
            return await crud_user.get_by_id(db, user_uuid)
    return None



async def _safe_publish(room_id: str, payload: bytes) -> None:
    with contextlib.suppress(Exception):
        await redis_pubsub.publish(room_id, wrap_message(payload))


async def _safe_broadcast_presence(room_id: str) -> None:
    presence = connection_manager.encode_presence(room_id)
    await connection_manager.broadcast_local(room_id, presence)
    await _safe_publish(room_id, presence)


@router.websocket("/ws/room/{room_id}")
@router.websocket("/ws/{room_id}")
async def room_websocket(
    websocket: WebSocket,
    room_id: str,
    token: str | None = Query(default=None),
):
    try:
        UUID(room_id)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    token = token or websocket.cookies.get(ACCESS_COOKIE_NAME)
    user = await _authenticate(token)
    if user is None or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    connection = await connection_manager.connect(
        room_id,
        websocket,
        user_id=str(user.id),
        user_name=user.name,
        avatar_url=user.avatar_url or "",
    )

    async def on_redis_message(data: bytes) -> None:
        origin, payload = unwrap_message(data)
        if origin == INSTANCE_ID:
            return
        await connection_manager.broadcast_local(room_id, payload)

    with contextlib.suppress(Exception):
        await redis_pubsub.subscribe(room_id, on_redis_message)
    await _safe_broadcast_presence(room_id)

    async with AsyncSessionLocal() as db:
        persisted = await get_update_blob(db, room_id)
        if persisted:
            response = bytes([MSG_SYNC_RESPONSE]) + persisted
            await websocket.send_bytes(response)

    try:
        while True:
            payload = await websocket.receive_bytes()
            if not payload:
                continue

            message_type = payload[0]

            if message_type == MSG_PING:
                await websocket.send_bytes(bytes([MSG_PONG]) + payload[1:])
                continue

            if message_type not in CRDT_MESSAGE_TYPES:
                continue

            if message_type == MSG_UPDATE:
                async with AsyncSessionLocal() as db:
                    await append_update_blob(db, room_id, payload[1:])
                    await db.commit()
            elif message_type == MSG_SNAPSHOT:
                async with AsyncSessionLocal() as db:
                    await replace_update_blob(db, room_id, payload[1:])
                    await db.commit()

            if message_type in {MSG_UPDATE, MSG_AWARENESS, MSG_SYNC_REQUEST, MSG_SYNC_RESPONSE}:
                await connection_manager.broadcast_local(
                    room_id,
                    payload,
                    exclude_connection_id=connection.connection_id,
                )
                await _safe_publish(room_id, payload)
    except WebSocketDisconnect:
        pass
    finally:
        with contextlib.suppress(Exception):
            await redis_pubsub.unsubscribe(room_id, on_redis_message)
        connection_manager.disconnect(room_id, connection.connection_id)
        await _safe_broadcast_presence(room_id)
