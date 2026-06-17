from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import UserSession


async def create(
    db: AsyncSession,
    *,
    user_id,
    refresh_token_hash: str,
    user_agent: str | None = None,
) -> UserSession:
    session = UserSession(
        user_id=user_id,
        refresh_token_hash=refresh_token_hash,
        user_agent=user_agent,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def get_by_refresh_token_hash(
    db: AsyncSession,
    refresh_token_hash: str,
) -> UserSession | None:
    result = await db.execute(
        select(UserSession).where(UserSession.refresh_token_hash == refresh_token_hash)
    )
    return result.scalar_one_or_none()


async def rotate_refresh_token_hash(
    db: AsyncSession,
    session: UserSession,
    refresh_token_hash: str,
) -> UserSession:
    session.refresh_token_hash = refresh_token_hash
    await db.flush()
    await db.refresh(session)
    return session


async def delete_by_refresh_token_hash(db: AsyncSession, refresh_token_hash: str) -> None:
    await db.execute(
        delete(UserSession).where(UserSession.refresh_token_hash == refresh_token_hash)
    )
