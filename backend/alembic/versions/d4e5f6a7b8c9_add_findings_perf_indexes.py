"""add findings performance indexes

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-05-08 05:17:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("idx_findings_severity", "findings", ["severity"], if_not_exists=True)
    op.create_index("idx_findings_repo_name", "findings", ["repo_name"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("idx_findings_repo_name", table_name="findings")
    op.drop_index("idx_findings_severity", table_name="findings")
