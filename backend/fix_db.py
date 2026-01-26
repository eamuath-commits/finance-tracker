from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/finance_db")
engine = create_engine(DATABASE_URL)

def migrate():
    with engine.connect() as conn:
        # Check if type col exists
        res = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='categories' AND column_name='type'"))
        if not res.fetchone():
            print("Adding 'type' column to 'categories' table...")
            conn.execute(text("ALTER TABLE categories ADD COLUMN type VARCHAR DEFAULT 'BOTH'"))
            conn.commit()
            print("Migration successful.")
        else:
            print("'type' column already exists.")

if __name__ == "__main__":
    migrate()
