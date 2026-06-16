from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.core.security import decode_access_token
from app.crud import crud_user
from app.db.session import AsyncSessionLocal
from app.services.redis_pubsub import INSTANCE_ID, redis_pubsub, unwrap_message, wrap_message
from app.websockets.connection_manager import MSG_PRESENCE, connection_manager

router = APIRouter()

MSG_UPDATE = 0x00
MSG_SYNC_REQUEST = 0x01
MSG_SYNC_RESPONSE = 0x02
MSG_PING = 0x04
MSG_PONG = 0x05
MSG_AWARENESS = 0x06

CRDT_MESSAGE_TYPES = {MSG_UPDATE, MSG_SYNC_REQUEST, MSG_SYNC_RESPONSE, MSG_AWARENESS}


async def _authenticate(token: str):
    user_id = decode_access_token(token)
    if user_id is None:
        return None

    async with AsyncSessionLocal() as db:
        return await crud_user.get_by_id(db, UUID(user_id))


async def _broadcast_presence(room_id: str) -> None:
    message = connection_manager.encode_presence(room_id)
    await connection_manager.broadcast_local(room_id, message)
    await redis_pubsub.publish(room_id, wrap_message(message))


@router.websocket("/ws/room/{room_id}")
@router.websocket("/ws/{room_id}")
async def room_websocket(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
):
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

    await redis_pubsub.subscribe(room_id, on_redis_message)
    await _broadcast_presence(room_id)

    try:
        while True:
            payload = await websocket.receive_bytes()
            if not payload:
                continue

            message_type = payload[0]

            if message_type == MSG_PING:
                await websocket.send_bytes(bytes([MSG_PONG]) + payload[1:])
                continue

            if message_type == MSG_PRESENCE:
                continue

            if message_type not in CRDT_MESSAGE_TYPES:
                continue

            await connection_manager.broadcast_local(
                room_id,
                payload,
                exclude_connection_id=connection.connection_id,
            )
            await redis_pubsub.publish(room_id, wrap_message(payload))
    except WebSocketDisconnect:
        pass
    finally:
        await redis_pubsub.unsubscribe(room_id, on_redis_message)
        connection_manager.disconnect(room_id, connection.connection_id)
        await _broadcast_presence(room_id)
