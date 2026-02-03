"""add_transaction_queue_table

Revision ID: c34ed76b5709
Revises: b66a4831eb7b
Create Date: 2026-02-03 06:17:02.828957

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c34ed76b5709'
down_revision = 'b66a4831eb7b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('transaction_queue',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('transaction_id', sa.String(), nullable=False),
        sa.Column('account_id', sa.String(), nullable=True),
        sa.Column('credit_card_id', sa.String(), nullable=True),
        sa.Column('status', sa.String(), server_default='queued', nullable=True),
        sa.Column('queued_at', sa.DateTime(), nullable=True),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.Column('blocked_reason', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
        sa.ForeignKeyConstraint(['credit_card_id'], ['credit_cards.id'], ),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_queue_status', 'transaction_queue', ['status'], unique=False)
    op.create_index('idx_queue_account', 'transaction_queue', ['account_id'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_queue_account', table_name='transaction_queue')
    op.drop_index('idx_queue_status', table_name='transaction_queue')
    op.drop_table('transaction_queue')
