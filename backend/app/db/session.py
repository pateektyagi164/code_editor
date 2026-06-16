from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models import Room  # noqa: F401
from app.models.user import Base

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                "ALTER TABLE rooms "
                "ADD COLUMN IF NOT EXISTS name VARCHAR(120) NOT NULL "
                "DEFAULT 'Untitled Workspace'"
            )
        )
        await conn.execute(text("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_id UUID"))
        await conn.execute(
            text(
                "DO $$ BEGIN "
                "IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rooms') "
                "AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') "
                "AND NOT EXISTS ("
                "SELECT 1 FROM pg_constraint c "
                "JOIN pg_class t ON t.oid = c.conrelid "
                "JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) "
                "WHERE t.relname = 'rooms' AND a.attname = 'owner_id' AND c.contype = 'f'"
                ") THEN "
                "ALTER TABLE rooms ADD CONSTRAINT fk_rooms_owner_id_users "
                "FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL; "
                "END IF; END $$;"
            )
        )
        await conn.execute(text("ALTER TABLE rooms ALTER COLUMN name DROP DEFAULT"))
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE")
        )
