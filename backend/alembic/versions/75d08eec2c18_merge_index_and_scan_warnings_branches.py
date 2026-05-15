"""merge index and scan_warnings branches

Revision ID: 75d08eec2c18
Revises: d4e5f6a7b8c9, f1a2b3c4d5e6
Create Date: 2026-05-15 21:59:17.547345

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '75d08eec2c18'
down_revision: Union[str, Sequence[str], None] = ('d4e5f6a7b8c9', 'f1a2b3c4d5e6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
