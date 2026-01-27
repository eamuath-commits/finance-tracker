"""
Migration: Add parsed_data column to transactions table
Run this script once to add the new column.
"""
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/finance_db")
engine = create_engine(DATABASE_URL)

def migrate():
    with engine.connect() as conn:
        # Add parsed_data column if it doesn't exist
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'transactions' AND column_name = 'parsed_data'
                ) THEN
                    ALTER TABLE transactions ADD COLUMN parsed_data TEXT;
                    RAISE NOTICE 'Added parsed_data column to transactions table';
                ELSE
                    RAISE NOTICE 'parsed_data column already exists';
                END IF;
            END $$;
        """))
        conn.commit()
        print("✅ Migration completed: parsed_data column added to transactions table")

if __name__ == "__main__":
    migrate()
