"""add type column to transactions

Revision ID: add_type_col
Revises: add_logo_url
Create Date: 2026-01-20 15:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_type_col'
down_revision = 'add_logo_url'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add 'type' column as nullable first
    op.add_column('transactions', sa.Column('type', sa.String(), nullable=True))
    
    # Populate existing rows with 'debit' by default
    op.execute("UPDATE transactions SET type = 'debit'")
    
    # Now verify if we can set some to credit based on category for smarter migration
    # Income, Deposit, Refund, Interest -> credit
    op.execute("UPDATE transactions SET type = 'credit' WHERE category IN ('Income', 'Deposit', 'Refund', 'Interest')")

    # Enforce non-nullable now
    op.alter_column('transactions', 'type', nullable=False, server_default='debit')

def downgrade() -> None:
    op.drop_column('transactions', 'type')
