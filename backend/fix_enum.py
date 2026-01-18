import os
import sqlalchemy
from sqlalchemy import create_engine, text

# Try localhost first if env var not set to something accessible
db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/finance_db")
if "db:5432" in db_url:
    print("Warning: DATABASE_URL points to 'db' container. Switching to 'localhost' for local migration script.")
    db_url = db_url.replace("db:5432", "localhost:5432")

print(f"Connecting to: {db_url}")
engine = create_engine(db_url)

def migrate():
    with engine.connect() as conn:
        print("Connected.")
        
        # 1. Attempt to Add 'BUDGET' to Enum type (Postgres specific)
        # This might fail if type doesn't exist or value exists, so we wrap in try/catch block logic via SQL
        print("Ensuring Enum has 'BUDGET' value...")
        try:
            conn.execute(text("ALTER TYPE paymentstatus ADD VALUE 'BUDGET';"))
            conn.commit()
            print("Added 'BUDGET' to Enum.")
        except Exception as e:
            print(f"Note: Enum modification skipped or failed (might already exist or not be an Enum type). Error: {e}")
            conn.rollback() # Important to rollback transaction on error

        # 2. Update Rows
        print("Updating PENDING records to BUDGET...")
        try:
            result = conn.execute(text("UPDATE payments SET status = 'BUDGET' WHERE status = 'PENDING'"))
            conn.commit()
            print(f"Updated {result.rowcount} records.")
        except Exception as e:
            print(f"Update failed: {e}")
            conn.rollback()
            
        # 3. Verify
        result = conn.execute(text("SELECT status, count(*) FROM payments GROUP BY status"))
        print("Current Status Counts:")
        for row in result:
            print(row)

if __name__ == "__main__":
    migrate()
