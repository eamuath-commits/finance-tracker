"""merge heads

Revision ID: merge_current_heads
Revises: add_status_column, faeb1661cc0c
Create Date: 2026-01-21 00:05:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'merge_current_heads'
down_revision = ('add_status_column', 'faeb1661cc0c')
branch_labels = None
depends_on = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
