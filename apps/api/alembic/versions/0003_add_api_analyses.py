"""add api analyses

Revision ID: 0003_add_api_analyses
Revises: 0002_add_investigation_locale
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_add_api_analyses"
down_revision = "0002_add_investigation_locale"
branch_labels = None
depends_on = None


def upgrade() -> None:
    status_enum = postgresql.ENUM(
        "queued", "planning", "fetching_context", "analyzing",
        "waiting_approval", "approved", "rejected", "failed",
        name="investigationstatus", create_type=False,
    )
    op.create_table(
        "api_analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("document", sa.Text(), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("locale", sa.String(10), nullable=False),
        sa.Column("status", status_enum, nullable=False),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("approved_report", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("token_usage", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_api_analyses_status", "api_analyses", ["status"])


def downgrade() -> None:
    op.drop_index("ix_api_analyses_status", table_name="api_analyses")
    op.drop_table("api_analyses")
