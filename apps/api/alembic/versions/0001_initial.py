"""initial investigation schema"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("investigations",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("repository", sa.String(200), nullable=False),
        sa.Column("issue_number", sa.Integer, nullable=False), sa.Column("branch", sa.String(120), nullable=False),
        sa.Column("include_pull_requests", sa.Boolean, nullable=False), sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("requester_ip", sa.String(64), nullable=False),
        sa.Column("status", sa.Enum("queued","planning","fetching_context","analyzing","waiting_approval","approved","rejected","failed", name="investigationstatus"), nullable=False),
        sa.Column("report", sa.JSON), sa.Column("approved_report", sa.JSON), sa.Column("error", sa.Text),
        sa.Column("token_usage", sa.Integer, nullable=False), sa.Column("estimated_cost_usd", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_investigations_repository", "investigations", ["repository"])
    op.create_index("ix_investigations_status", "investigations", ["status"])
    op.create_table("workflow_steps", sa.Column("id", sa.Integer, primary_key=True), sa.Column("investigation_id", sa.String(36), sa.ForeignKey("investigations.id"), nullable=False), sa.Column("position", sa.Integer, nullable=False), sa.Column("key", sa.String(80), nullable=False), sa.Column("label", sa.String(180), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("summary", sa.Text), sa.Column("duration_ms", sa.Integer), sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("completed_at", sa.DateTime(timezone=True)))
    op.create_table("tool_calls", sa.Column("id", sa.Integer, primary_key=True), sa.Column("investigation_id", sa.String(36), sa.ForeignKey("investigations.id"), nullable=False), sa.Column("tool_name", sa.String(100), nullable=False), sa.Column("input_summary", sa.JSON, nullable=False), sa.Column("output_summary", sa.JSON, nullable=False), sa.Column("success", sa.Boolean, nullable=False), sa.Column("duration_ms", sa.Integer, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("audit_logs", sa.Column("id", sa.Integer, primary_key=True), sa.Column("investigation_id", sa.String(36), sa.ForeignKey("investigations.id"), nullable=False), sa.Column("action", sa.String(80), nullable=False), sa.Column("actor", sa.String(120), nullable=False), sa.Column("detail", sa.JSON, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("audit_logs"); op.drop_table("tool_calls"); op.drop_table("workflow_steps")
    op.drop_index("ix_investigations_status", table_name="investigations"); op.drop_index("ix_investigations_repository", table_name="investigations"); op.drop_table("investigations")

