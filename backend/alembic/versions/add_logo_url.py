"""add logo_url to transactions

Revision ID: add_logo_url
Revises: 9880b1b7852e
Create Date: 2026-01-20 14:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_logo_url'
down_revision = '9880b1b7852e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('transactions', sa.Column('logo_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('transactions', 'logo_url')
