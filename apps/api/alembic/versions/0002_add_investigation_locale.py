"""add investigation locale

Revision ID: 0002_add_investigation_locale
Revises: 0001_initial
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_add_investigation_locale"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "investigations",
        sa.Column("locale", sa.String(length=10), nullable=False, server_default="zh-TW"),
    )


def downgrade() -> None:
    op.drop_column("investigations", "locale")
