"""Add room names

Revision ID: 003
Revises: 002
Create Date: 2026-06-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rooms",
        sa.Column(
            "name",
            sa.String(length=120),
            server_default="Untitled Workspace",
            nullable=False,
        ),
    )
    op.alter_column("rooms", "name", server_default=None)


def downgrade() -> None:
    op.drop_column("rooms", "name")
