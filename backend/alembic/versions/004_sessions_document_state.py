"""Add user sessions and document state

Revision ID: 004
Revises: 003
Create Date: 2026-06-16

"""
from typing import Sequence, Union

from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_sessions (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            refresh_token_hash VARCHAR(255) NOT NULL,
            user_agent VARCHAR(512),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_sessions_user_id ON user_sessions (user_id)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_user_sessions_refresh_token_hash "
        "ON user_sessions (refresh_token_hash)"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS document_states (
            room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
            update_blob BYTEA NOT NULL DEFAULT ''::bytea,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.drop_table("document_states")
    op.drop_index("ix_user_sessions_refresh_token_hash", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_column("users", "last_login_at")
