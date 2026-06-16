import json
import uuid
from dataclasses import dataclass

from fastapi import WebSocket
from starlette.websockets import WebSocketState

MSG_PRESENCE = 0x03


@dataclass
class RoomConnection:
    websocket: WebSocket
    user_id: str
    user_name: str
    avatar_url: str
    connection_id: str


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, dict[str, RoomConnection]] = {}

    async def connect(
        self,
        room_id: str,
        websocket: WebSocket,
        *,
        user_id: str,
        user_name: str,
        avatar_url: str = "",
    ) -> RoomConnection:
        await websocket.accept()
        connection = RoomConnection(
            websocket=websocket,
            user_id=user_id,
            user_name=user_name,
            avatar_url=avatar_url,
            connection_id=str(uuid.uuid4()),
        )
        self._rooms.setdefault(room_id, {})[connection.connection_id] = connection
        return connection

    def disconnect(self, room_id: str, connection_id: str) -> None:
        room = self._rooms.get(room_id)
        if not room:
            return
        room.pop(connection_id, None)
        if not room:
            del self._rooms[room_id]

    async def broadcast_local(
        self,
        room_id: str,
        message: bytes,
        *,
        exclude_connection_id: str | None = None,
    ) -> None:
        room = self._rooms.get(room_id, {})
        for conn_id, conn in list(room.items()):
            if conn_id == exclude_connection_id:
                continue
            if conn.websocket.client_state != WebSocketState.CONNECTED:
                continue
            try:
                await conn.websocket.send_bytes(message)
            except Exception:
                self.disconnect(room_id, conn_id)

    def get_room_connections(self, room_id: str) -> list[RoomConnection]:
        return list(self._rooms.get(room_id, {}).values())

    def encode_presence(self, room_id: str) -> bytes:
        users_map: dict[str, dict] = {}
        for conn in self.get_room_connections(room_id):
            users_map[conn.user_id] = {
                "user_id": conn.user_id,
                "user_name": conn.user_name,
                "avatar_url": conn.avatar_url or None,
            }
        payload = json.dumps({"users": list(users_map.values())}).encode()
        return bytes([MSG_PRESENCE]) + payload


connection_manager = ConnectionManager()
