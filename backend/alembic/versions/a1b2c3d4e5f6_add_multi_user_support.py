"""add multi-user support with users table and user_id columns

Revision ID: a1b2c3d4e5f6
Revises: 556634f808a2
Create Date: 2026-06-06 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import uuid
import os

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '556634f808a2'
branch_labels = None
depends_on = None

# Default admin user ID (fixed so backfill is deterministic)
ADMIN_USER_ID = str(uuid.uuid4())


def _exists(conn, query, **params):
    """Helper to check existence queries."""
    return conn.execute(sa.text(query).bindparams(**params)).scalar()


def upgrade() -> None:
    conn = op.get_bind()

    # === 1. Create users table (idempotent — may already exist via create_all) ===
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)", t='users'):
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

    # Create indexes idempotently
    for idx, col in [('ix_users_username', 'username'), ('ix_users_email', 'email'), ('ix_users_telegram_user_id', 'telegram_user_id')]:
        if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :n)", n=idx):
            op.create_index(idx, 'users', [col], unique=True)

    # === 2. Seed default admin user ===
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM users WHERE username = 'admin')"):
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
        hashed_pw = pwd_context.hash(default_password)

        op.execute(
            sa.text(
                "INSERT INTO users (id, username, email, hashed_password, is_active) "
                "VALUES (:id, :username, :email, :hashed_password, :is_active)"
            ).bindparams(
                id=ADMIN_USER_ID, username="admin", email=None,
                hashed_password=hashed_pw, is_active=True,
            )
        )

    # Get admin ID (whether just created or pre-existing)
    admin_id = conn.execute(sa.text("SELECT id FROM users WHERE username = 'admin'")).scalar()

    # === 3. Add user_id column to all user-scoped tables ===
    user_scoped_tables = [
        'accounts', 'credit_cards', 'beneficiaries', 'transactions',
        'loans', 'obligations', 'payments', 'raw_messages',
        'savings_goals', 'allocation_rules', 'allocation_history',
        'distributions', 'user_settings',
    ]

    for tbl in user_scoped_tables:
        # Add column if missing
        if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = 'user_id')", t=tbl):
            op.add_column(tbl, sa.Column('user_id', sa.String(), nullable=True))

        # Backfill existing rows
        op.execute(sa.text(f"UPDATE {tbl} SET user_id = :uid WHERE user_id IS NULL").bindparams(uid=admin_id))

        # Add FK if missing
        fk = f'fk_{tbl}_user_id'
        if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = :fk AND table_name = :t)", fk=fk, t=tbl):
            op.create_foreign_key(fk, tbl, 'users', ['user_id'], ['id'])

    # === 4. Fix unique constraints for multi-user ===
    # Helper: drop index/constraint only if they exist (avoids PG transaction abort)
    def _drop_index_if_exists(name, table):
        if _exists(conn, "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :n)", n=name):
            op.drop_index(name, table_name=table)

    def _drop_constraint_if_exists(name, table):
        if _exists(conn, "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = :n AND table_name = :t)", n=name, t=table):
            op.drop_constraint(name, table, type_='unique')

    # accounts.last_4_digits
    _drop_index_if_exists('ix_accounts_last_4_digits', 'accounts')
    _drop_constraint_if_exists('accounts_last_4_digits_key', 'accounts')
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = :n)", n='uq_account_user_last4'):
        op.create_unique_constraint('uq_account_user_last4', 'accounts', ['user_id', 'last_4_digits'])
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :n)", n='ix_accounts_last_4_digits'):
        op.create_index('ix_accounts_last_4_digits', 'accounts', ['last_4_digits'])

    # credit_cards.last_4_digits
    _drop_index_if_exists('ix_credit_cards_last_4_digits', 'credit_cards')
    _drop_constraint_if_exists('credit_cards_last_4_digits_key', 'credit_cards')
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = :n)", n='uq_cc_user_last4'):
        op.create_unique_constraint('uq_cc_user_last4', 'credit_cards', ['user_id', 'last_4_digits'])
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :n)", n='ix_credit_cards_last_4_digits'):
        op.create_index('ix_credit_cards_last_4_digits', 'credit_cards', ['last_4_digits'])

    # user_settings.key
    _drop_index_if_exists('ix_user_settings_key', 'user_settings')
    _drop_constraint_if_exists('user_settings_key_key', 'user_settings')
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = :n)", n='uq_settings_user_key'):
        op.create_unique_constraint('uq_settings_user_key', 'user_settings', ['user_id', 'key'])
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :n)", n='ix_user_settings_key'):
        op.create_index('ix_user_settings_key', 'user_settings', ['key'])
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = :n)", n='uq_settings_user_key'):
        op.create_unique_constraint('uq_settings_user_key', 'user_settings', ['user_id', 'key'])
    if not _exists(conn, "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :n)", n='ix_user_settings_key'):
        op.create_index('ix_user_settings_key', 'user_settings', ['key'])


def downgrade() -> None:
    user_scoped_tables = [
        'accounts', 'credit_cards', 'beneficiaries', 'transactions',
        'loans', 'obligations', 'payments', 'raw_messages',
        'savings_goals', 'allocation_rules', 'allocation_history',
        'distributions', 'user_settings',
    ]

    for con in ['uq_account_user_last4', 'uq_cc_user_last4', 'uq_settings_user_key']:
        try:
            tbl = 'accounts' if 'account' in con else ('credit_cards' if 'cc' in con else 'user_settings')
            op.drop_constraint(con, tbl, type_='unique')
        except Exception:
            pass

    op.create_unique_constraint('accounts_last_4_digits_key', 'accounts', ['last_4_digits'])
    op.create_unique_constraint('credit_cards_last_4_digits_key', 'credit_cards', ['last_4_digits'])
    op.create_unique_constraint('user_settings_key_key', 'user_settings', ['key'])

    for tbl in user_scoped_tables:
        try:
            op.drop_constraint(f'fk_{tbl}_user_id', tbl, type_='foreignkey')
        except Exception:
            pass
        op.drop_column(tbl, 'user_id')

    op.drop_table('users')
