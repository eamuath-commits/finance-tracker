import os
import sqlalchemy
from sqlalchemy import create_engine, text

# Trust the environment variable if set (Docker)
db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/finance_db")
print(f"Connecting to: {db_url}")
engine = create_engine(db_url)

def migrate():
    with engine.connect() as conn:
        print("Connected.")
        
        # Add bank_name
        try:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN bank_name VARCHAR;"))
            conn.commit()
            print("Added 'bank_name' column.")
        except Exception as e:
            print(f"Skipping bank_name (might exist): {e}")
            conn.rollback()

        # Add bank_logo_url
        try:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN bank_logo_url VARCHAR;"))
            conn.commit()
            print("Added 'bank_logo_url' column.")
        except Exception as e:
            print(f"Skipping bank_logo_url (might exist): {e}")
            conn.rollback()

if __name__ == "__main__":
    migrate()
