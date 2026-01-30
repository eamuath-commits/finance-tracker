"""Add source column to transactions table"""
from sqlalchemy import text
from database import engine

def upgrade():
    with engine.connect() as conn:
        # Add source column to transactions table
        conn.execute(text("""
            ALTER TABLE transactions 
            ADD COLUMN IF NOT EXISTS source VARCHAR(50)
        """))
        conn.commit()
        print("Added 'source' column to transactions table")

if __name__ == "__main__":
    upgrade()
