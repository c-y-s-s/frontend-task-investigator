"""add known api contract

Revision ID: 0005_known_api_contract
Revises: 0004_api_analysis_context
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_known_api_contract"
down_revision = "0004_api_analysis_context"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("api_analyses", sa.Column("known_contract", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("api_analyses", "known_contract")
