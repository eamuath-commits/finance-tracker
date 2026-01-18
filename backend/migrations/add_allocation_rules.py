from sqlalchemy import create_engine, MetaData, Table, Column, String, Enum, ForeignKey
import os
import enum

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/dbname")

def upgrade():
    engine = create_engine(DATABASE_URL)
    metadata = MetaData()

    # Define Enum just for migration context if needed (SQLAlchemy handles it usually)
    # But usually creating table with Enum requires care in Postgres.
    # We will let SQLAlchemy `create_all` handle strict types or use raw SQL if needed.
    # Actually, simplest way with current setup (using `migrations/` as ad-hoc scripts)
    # is to define the table and call create.
    
    # We can also use the models directly if we import them.
    # Let's try to import Base from models? No, circular deps risk.
    
    # Let's define the table explicitly here to be safe.
    
    allocation_rules = Table(
        'allocation_rules', metadata,
        Column('id', String, primary_key=True),
        Column('rule_type', String, nullable=False), # We'll use String for simplicity in migration, or Enum type
        Column('identifier', String, nullable=False, unique=True),
        Column('target_account_id', String, ForeignKey("accounts.id"), nullable=False)
    )

    try:
        metadata.create_all(engine)
        print("Successfully created 'allocation_rules' table.")
    except Exception as e:
        print(f"Error creating table: {e}")

if __name__ == "__main__":
    upgrade()
