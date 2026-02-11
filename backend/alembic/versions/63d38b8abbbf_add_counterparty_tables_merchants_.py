"""add_counterparty_tables_merchants_beneficiaries_billers

Revision ID: 63d38b8abbbf
Revises: c34ed76b5709
Create Date: 2026-02-11 16:09:31.187200

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '63d38b8abbbf'
down_revision = 'c34ed76b5709'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create merchants table
    op.create_table('merchants',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('display_name', sa.String(), nullable=True),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('logo_url', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Create beneficiaries table
    op.create_table('beneficiaries',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('display_name', sa.String(), nullable=True),
        sa.Column('bank_name', sa.String(), nullable=True),
        sa.Column('iban', sa.String(), nullable=True),
        sa.Column('account_last4', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create billers table
    op.create_table('billers',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('display_name', sa.String(), nullable=True),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Add FK columns to transactions
    op.add_column('transactions', sa.Column('merchant_id', sa.String(), nullable=True))
    op.add_column('transactions', sa.Column('beneficiary_id', sa.String(), nullable=True))
    op.add_column('transactions', sa.Column('biller_id', sa.String(), nullable=True))
    op.create_foreign_key('fk_tx_merchant', 'transactions', 'merchants', ['merchant_id'], ['id'])
    op.create_foreign_key('fk_tx_beneficiary', 'transactions', 'beneficiaries', ['beneficiary_id'], ['id'])
    op.create_foreign_key('fk_tx_biller', 'transactions', 'billers', ['biller_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_tx_biller', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_tx_beneficiary', 'transactions', type_='foreignkey')
    op.drop_constraint('fk_tx_merchant', 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'biller_id')
    op.drop_column('transactions', 'beneficiary_id')
    op.drop_column('transactions', 'merchant_id')
    op.drop_table('billers')
    op.drop_table('beneficiaries')
    op.drop_table('merchants')
