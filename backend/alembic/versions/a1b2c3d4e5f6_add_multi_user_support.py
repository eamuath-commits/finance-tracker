"""add multi-user support with users table and user_id columns

Revision ID: a1b2c3d4e5f6
Revises: 39e953a631c3
Create Date: 2026-06-06 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import uuid
import os

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '39e953a631c3'
branch_labels = None
depends_on = None

# Default admin user ID (fixed so backfill is deterministic)
ADMIN_USER_ID = str(uuid.uuid4())


def upgrade() -> None:
    # === 1. Create users table ===
    op.create_table(
        'users',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('telegram_user_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_telegram_user_id', 'users', ['telegram_user_id'], unique=True)

    # === 2. Seed default admin user ===
    # Hash for password "admin123" using passlib bcrypt
    # We generate this inline to avoid import issues in migration context
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
    hashed_pw = pwd_context.hash(default_password)

    op.execute(
        sa.text(
            "INSERT INTO users (id, username, email, hashed_password, is_active) "
            "VALUES (:id, :username, :email, :hashed_password, :is_active)"
        ).bindparams(
            id=ADMIN_USER_ID,
            username="admin",
            email=None,
            hashed_password=hashed_pw,
            is_active=True,
        )
    )

    # === 3. Add user_id column to all user-scoped tables ===
    user_scoped_tables = [
        'accounts',
        'credit_cards',
        'beneficiaries',
        'transactions',
        'loans',
        'obligations',
        'payments',
        'raw_messages',
        'savings_goals',
        'allocation_rules',
        'allocation_history',
        'distributions',
        'user_settings',
    ]

    for table_name in user_scoped_tables:
        op.add_column(table_name, sa.Column('user_id', sa.String(), nullable=True))
        # Backfill all existing rows to admin user
        op.execute(
            sa.text(f"UPDATE {table_name} SET user_id = :uid WHERE user_id IS NULL").bindparams(uid=ADMIN_USER_ID)
        )
        # Add foreign key constraint
        op.create_foreign_key(
            f'fk_{table_name}_user_id',
            table_name, 'users',
            ['user_id'], ['id'],
        )

    # === 4. Fix unique constraints for multi-user ===
    # Drop old unique constraints on last_4_digits (Account and CreditCard)
    # and replace with composite unique (user_id + last_4_digits)
    
    # accounts.last_4_digits — drop unique index, create composite
    try:
        op.drop_index('ix_accounts_last_4_digits', table_name='accounts')
    except Exception:
        pass
    try:
        op.drop_constraint('accounts_last_4_digits_key', 'accounts', type_='unique')
    except Exception:
        pass
    op.create_unique_constraint('uq_account_user_last4', 'accounts', ['user_id', 'last_4_digits'])
    op.create_index('ix_accounts_last_4_digits', 'accounts', ['last_4_digits'])

    # credit_cards.last_4_digits — drop unique index, create composite
    try:
        op.drop_index('ix_credit_cards_last_4_digits', table_name='credit_cards')
    except Exception:
        pass
    try:
        op.drop_constraint('credit_cards_last_4_digits_key', 'credit_cards', type_='unique')
    except Exception:
        pass
    op.create_unique_constraint('uq_cc_user_last4', 'credit_cards', ['user_id', 'last_4_digits'])
    op.create_index('ix_credit_cards_last_4_digits', 'credit_cards', ['last_4_digits'])

    # user_settings.key — drop unique, create composite
    try:
        op.drop_index('ix_user_settings_key', table_name='user_settings')
    except Exception:
        pass
    try:
        op.drop_constraint('user_settings_key_key', 'user_settings', type_='unique')
    except Exception:
        pass
    op.create_unique_constraint('uq_settings_user_key', 'user_settings', ['user_id', 'key'])
    op.create_index('ix_user_settings_key', 'user_settings', ['key'])


def downgrade() -> None:
    # Remove user_id columns from all user-scoped tables
    user_scoped_tables = [
        'accounts', 'credit_cards', 'beneficiaries', 'transactions',
        'loans', 'obligations', 'payments', 'raw_messages',
        'savings_goals', 'allocation_rules', 'allocation_history',
        'distributions', 'user_settings',
    ]

    # Drop composite unique constraints
    try:
        op.drop_constraint('uq_account_user_last4', 'accounts', type_='unique')
    except Exception:
        pass
    try:
        op.drop_constraint('uq_cc_user_last4', 'credit_cards', type_='unique')
    except Exception:
        pass
    try:
        op.drop_constraint('uq_settings_user_key', 'user_settings', type_='unique')
    except Exception:
        pass

    # Restore original unique constraints
    op.create_unique_constraint('accounts_last_4_digits_key', 'accounts', ['last_4_digits'])
    op.create_unique_constraint('credit_cards_last_4_digits_key', 'credit_cards', ['last_4_digits'])
    op.create_unique_constraint('user_settings_key_key', 'user_settings', ['key'])

    for table_name in user_scoped_tables:
        try:
            op.drop_constraint(f'fk_{table_name}_user_id', table_name, type_='foreignkey')
        except Exception:
            pass
        op.drop_column(table_name, 'user_id')

    # Drop users table
    op.drop_table('users')
