from sqlalchemy import create_engine, text
import os
import sys

# Add parent dir to path if running from scripts/
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Create engine manually to avoid import issues
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/finance_db")
engine = create_engine(DATABASE_URL)

def run_migration():
    print(f"Connecting to {DATABASE_URL}...")
    with engine.connect() as conn:
        try:
            # Check if column exists
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='obligations' AND column_name='provider'"))
            if result.fetchone():
                print("Column 'provider' already exists. Skipping.")
                return

            print("Adding 'provider' column to 'obligations' table...")
            conn.execute(text("ALTER TABLE obligations ADD COLUMN provider VARCHAR"))
            conn.commit()
            print("Migration successful! Column 'provider' added.")
        except Exception as e:
            print(f"Migration failed: {e}")
            sys.exit(1)

if __name__ == "__main__":
    run_migration()
