"""Rename payroll_transfers to distributions

Revision ID: badb62cb666c
Revises: 6f5a27f6a6ff
Create Date: 2026-01-29 14:56:03.862997

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'badb62cb666c'
down_revision = '6f5a27f6a6ff'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The 'distributions' table is already created by the model on app startup.
    # We need to migrate data from the old 'payroll_transfers' table if it exists.
    
    conn = op.get_bind()
    
    # Check if payroll_transfers exists and distributions exists
    old_exists = conn.execute(sa.text(
        "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'payroll_transfers')"
    )).scalar()
    
    new_exists = conn.execute(sa.text(
        "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'distributions')"
    )).scalar()
    
    if old_exists and new_exists:
        # Copy data from old table to new table if there's no data in new table
        new_count = conn.execute(sa.text("SELECT COUNT(*) FROM distributions")).scalar()
        if new_count == 0:
            conn.execute(sa.text("""
                INSERT INTO distributions (id, source_account_id, target_account_id, amount, billing_month, note, transaction_id, created_at)
                SELECT id, source_account_id, target_account_id, amount, billing_month, note, transaction_id, created_at
                FROM payroll_transfers
            """))
        
        # Drop old table
        op.drop_table('payroll_transfers')
    elif old_exists and not new_exists:
        # Just rename the table
        op.rename_table('payroll_transfers', 'distributions')


def downgrade() -> None:
    conn = op.get_bind()
    
    new_exists = conn.execute(sa.text(
        "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'distributions')"
    )).scalar()
    
    old_exists = conn.execute(sa.text(
        "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = 'payroll_transfers')"
    )).scalar()
    
    if new_exists and not old_exists:
        op.rename_table('distributions', 'payroll_transfers')
