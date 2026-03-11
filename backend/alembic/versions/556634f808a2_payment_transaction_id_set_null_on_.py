"""payment_transaction_id_set_null_on_delete

Revision ID: 556634f808a2
Revises: 63d38b8abbbf
Create Date: 2026-03-11 22:12:19.088707

"""
from alembic import op

revision = '556634f808a2'
down_revision = '63d38b8abbbf'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing FK and re-create with ON DELETE SET NULL
    op.drop_constraint('payments_transaction_id_fkey', 'payments', type_='foreignkey')
    op.create_foreign_key(
        'payments_transaction_id_fkey',
        'payments', 'transactions',
        ['transaction_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('payments_transaction_id_fkey', 'payments', type_='foreignkey')
    op.create_foreign_key(
        'payments_transaction_id_fkey',
        'payments', 'transactions',
        ['transaction_id'], ['id']
    )
