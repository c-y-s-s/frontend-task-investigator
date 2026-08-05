"""add api analysis input context

Revision ID: 0004_api_analysis_context
Revises: 0003_add_api_analyses
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_api_analysis_context"
down_revision = "0003_add_api_analyses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("api_analyses", sa.Column("input_type", sa.String(20), nullable=False, server_default="response"))
    op.add_column("api_analyses", sa.Column("purpose", sa.String(500), nullable=False, server_default=""))
    op.add_column("api_analyses", sa.Column("method", sa.String(10), nullable=True))
    op.add_column("api_analyses", sa.Column("path", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("api_analyses", "path")
    op.drop_column("api_analyses", "method")
    op.drop_column("api_analyses", "purpose")
    op.drop_column("api_analyses", "input_type")
