"""Ensure password_reset_tokens.created_at has a MySQL default.

Revision ID: 0004_password_reset_created_at_default
Revises: 0003_password_reset_tokens
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_reset_created_at"
down_revision = "0003_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "password_reset_tokens",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=sa.text("CURRENT_TIMESTAMP"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "password_reset_tokens",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=None,
        existing_nullable=False,
    )
