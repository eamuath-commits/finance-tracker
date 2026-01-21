import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '../backend/.env'))
DATABASE_URL = os.getenv("DATABASE_URL")

from models import Account

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

accounts = db.query(Account).all()
print(f"Found {len(accounts)} accounts:")
for acc in accounts:
    print(f"- {acc.name} (ID: {acc.id}) | Bank: '{acc.bank_name}' | Last4: {acc.last_4_digits}")

db.close()
