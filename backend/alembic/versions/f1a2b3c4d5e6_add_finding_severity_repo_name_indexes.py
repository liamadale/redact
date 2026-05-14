"""add finding severity and repo_name indexes

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-05-14 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("idx_findings_severity", "findings", ["severity"])
    op.create_index("idx_findings_repo_name", "findings", ["repo_name"])


def downgrade() -> None:
    op.drop_index("idx_findings_repo_name", table_name="findings")
    op.drop_index("idx_findings_severity", table_name="findings")
