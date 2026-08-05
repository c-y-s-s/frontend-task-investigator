"""add code reviews

Revision ID: 0008_code_reviews
Revises: 0007_bug_rejection_reason
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_code_reviews"
down_revision = "0007_bug_rejection_reason"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table("code_reviews", sa.Column("id", sa.String(36), primary_key=True), sa.Column("repository", sa.String(200), nullable=False), sa.Column("pull_request_number", sa.Integer(), nullable=False), sa.Column("mode", sa.String(20), nullable=False), sa.Column("locale", sa.String(10), nullable=False), sa.Column("status", sa.String(30), nullable=False), sa.Column("steps", sa.JSON(), nullable=False), sa.Column("tool_calls", sa.JSON(), nullable=False), sa.Column("report", sa.JSON(), nullable=True), sa.Column("approved_report", sa.JSON(), nullable=True), sa.Column("rejection_reason", sa.Text(), nullable=True), sa.Column("error", sa.Text(), nullable=True), sa.Column("token_usage", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_code_reviews_repository", "code_reviews", ["repository"])
    op.create_index("ix_code_reviews_status", "code_reviews", ["status"])

def downgrade() -> None:
    op.drop_index("ix_code_reviews_status", table_name="code_reviews"); op.drop_index("ix_code_reviews_repository", table_name="code_reviews"); op.drop_table("code_reviews")
