import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable

import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

INSTANCE_ID = uuid.uuid4().bytes


def wrap_message(payload: bytes) -> bytes:
    return INSTANCE_ID + payload


def unwrap_message(data: bytes) -> tuple[bytes, bytes]:
    if len(data) <= len(INSTANCE_ID):
        return b"", data
    return data[: len(INSTANCE_ID)], data[len(INSTANCE_ID) :]


class RedisPubSub:
    def __init__(self) -> None:
        self._redis: aioredis.Redis | None = None
        self._pubsub: aioredis.client.PubSub | None = None
        self._listener_task: asyncio.Task | None = None
        self._handlers: dict[str, set[Callable[[bytes], Awaitable[None]]]] = {}
        self.available = False

    async def connect(self) -> None:
        try:
            self._redis = aioredis.from_url(
                settings.redis_url,
                decode_responses=False,
                socket_connect_timeout=3,
            )
            await self._redis.ping()
            self._pubsub = self._redis.pubsub()
            self._listener_task = asyncio.create_task(self._listen())
            self.available = True
        except Exception as exc:
            logger.warning("Redis unavailable, running without pub/sub: %s", exc)
            self.available = False
            if self._redis:
                await self._redis.close()
            self._redis = None
            self._pubsub = None

    async def disconnect(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None

        if self._pubsub:
            await self._pubsub.close()
            self._pubsub = None

        if self._redis:
            await self._redis.close()
            self._redis = None

        self._handlers.clear()

    def _channel(self, room_id: str) -> str:
        return f"room:{room_id}"

    async def subscribe(
        self, room_id: str, handler: Callable[[bytes], Awaitable[None]]
    ) -> None:
        if not self.available:
            return

        channel = self._channel(room_id)
        if channel not in self._handlers:
            self._handlers[channel] = set()
            if self._pubsub:
                await self._pubsub.subscribe(channel)
        self._handlers[channel].add(handler)

    async def unsubscribe(
        self, room_id: str, handler: Callable[[bytes], Awaitable[None]]
    ) -> None:
        channel = self._channel(room_id)
        handlers = self._handlers.get(channel)
        if not handlers:
            return

        handlers.discard(handler)
        if not handlers:
            del self._handlers[channel]
            if self._pubsub:
                await self._pubsub.unsubscribe(channel)

    async def publish(self, room_id: str, message: bytes) -> None:
        if self._redis and self.available:
            await self._redis.publish(self._channel(room_id), message)

    async def _listen(self) -> None:
        if not self._pubsub:
            return

        async for raw in self._pubsub.listen():
            if raw["type"] != "message":
                continue

            channel = raw["channel"]
            if isinstance(channel, bytes):
                channel = channel.decode()

            handlers = self._handlers.get(channel, set())
            data = raw["data"]
            for handler in list(handlers):
                await handler(data)


redis_pubsub = RedisPubSub()
