from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserCreate


async def get_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_provider(
    db: AsyncSession, provider: str, provider_id: str
) -> User | None:
    result = await db.execute(
        select(User).where(User.provider == provider, User.provider_id == provider_id)
    )
    return result.scalar_one_or_none()


async def create(db: AsyncSession, user_in: UserCreate) -> User:
    user = User(
        email=user_in.email,
        name=user_in.name,
        avatar_url=user_in.avatar_url,
        provider=user_in.provider,
        provider_id=user_in.provider_id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def update_refresh_token_hash(
    db: AsyncSession, user: User, refresh_token_hash: str | None
) -> User:
    user.refresh_token_hash = refresh_token_hash
    await db.flush()
    await db.refresh(user)
    return user
