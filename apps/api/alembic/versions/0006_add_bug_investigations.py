"""add bug investigations

Revision ID: 0006_bug_investigations
Revises: 0005_known_api_contract
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_bug_investigations"
down_revision = "0005_known_api_contract"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bug_investigations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("repository", sa.String(200), nullable=False),
        sa.Column("branch", sa.String(120), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("console_log", sa.Text(), nullable=False),
        sa.Column("network_context", sa.Text(), nullable=False),
        sa.Column("expected_behavior", sa.Text(), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("locale", sa.String(10), nullable=False),
        # Store the same validated application states without attempting to
        # recreate the PostgreSQL enum type already owned by investigations.
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("tool_calls", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("approved_report", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("token_usage", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_bug_investigations_repository", "bug_investigations", ["repository"])
    op.create_index("ix_bug_investigations_status", "bug_investigations", ["status"])


def downgrade() -> None:
    op.drop_index("ix_bug_investigations_status", table_name="bug_investigations")
    op.drop_index("ix_bug_investigations_repository", table_name="bug_investigations")
    op.drop_table("bug_investigations")
