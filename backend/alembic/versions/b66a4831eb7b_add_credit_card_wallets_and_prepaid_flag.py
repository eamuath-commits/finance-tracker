"""add_credit_card_wallets_and_prepaid_flag

Revision ID: b66a4831eb7b
Revises: 39e953a631c3
Create Date: 2026-01-31 01:59:30.582770

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = 'b66a4831eb7b'
down_revision = '39e953a631c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if is_prepaid column exists
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('credit_cards')]
    
    if 'is_prepaid' not in columns:
        op.add_column('credit_cards', sa.Column('is_prepaid', sa.Boolean(), nullable=True, server_default='false'))
    
    # Check if credit_card_wallets table exists
    tables = inspector.get_table_names()
    if 'credit_card_wallets' not in tables:
        op.create_table(
            'credit_card_wallets',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('credit_card_id', sa.String(), sa.ForeignKey('credit_cards.id', ondelete='CASCADE'), nullable=False),
            sa.Column('currency_code', sa.String(), nullable=False),
            sa.Column('balance', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('last_updated', sa.DateTime(), nullable=True),
        )
        op.create_unique_constraint(
            'uq_credit_card_wallets_card_currency',
            'credit_card_wallets',
            ['credit_card_id', 'currency_code']
        )
        op.create_index('ix_credit_card_wallets_credit_card_id', 'credit_card_wallets', ['credit_card_id'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    columns = [col['name'] for col in inspector.get_columns('credit_cards')]
    
    if 'credit_card_wallets' in tables:
        op.drop_index('ix_credit_card_wallets_credit_card_id', table_name='credit_card_wallets')
        op.drop_constraint('uq_credit_card_wallets_card_currency', 'credit_card_wallets', type_='unique')
        op.drop_table('credit_card_wallets')
    
    if 'is_prepaid' in columns:
        op.drop_column('credit_cards', 'is_prepaid')
