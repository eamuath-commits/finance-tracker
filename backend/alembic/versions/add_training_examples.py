"""add training examples

Revision ID: add_training_examples
Revises: merge_current_heads
Create Date: 2026-01-21 21:05:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_training_examples'
down_revision = 'merge_current_heads'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table('training_examples',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('raw_text', sa.String(), nullable=False),
    sa.Column('parsed_json', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('training_examples')
