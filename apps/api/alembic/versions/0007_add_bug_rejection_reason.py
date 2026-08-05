"""add bug rejection reason

Revision ID: 0007_bug_rejection_reason
Revises: 0006_bug_investigations
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_bug_rejection_reason"
down_revision = "0006_bug_investigations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bug_investigations", sa.Column("rejection_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("bug_investigations", "rejection_reason")
