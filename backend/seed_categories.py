from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Category, Base
import os
from dotenv import load_dotenv

load_dotenv()
# Ensure we pick up the correct DB URL from env
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/finance_db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

CATEGORIES = ['Food', 'Transport', 'Utilities', 'Entertainment', 'Shopping', 'Housing', 'Health', 'Income', 'Transfer', 'Subscription', 'Obligation', 'Credit Card Payment', 'Deposit', 'Refund']

def seed():
    session = SessionLocal()
    try:
        existing = session.query(Category).all()
        existing_names = {c.name: c for c in existing}

        for name in CATEGORIES:
            if name in existing_names:
                cat = existing_names[name]
                if cat.type == 'OBLIGATION':
                    print(f"Updating {name} from OBLIGATION to BOTH")
                    cat.type = 'BOTH'
                elif not cat.type:
                     if name in ['Housing', 'Utilities', 'Obligation', 'Credit Card Payment']:
                         cat.type = 'BOTH'
                     else:
                         cat.type = 'TRANSACTION'
                session.add(cat)
            else:
                print(f"Creating {name} as TRANSACTION")
                new_type = 'TRANSACTION'
                if name in ['Housing', 'Utilities', 'Obligation', 'Credit Card Payment']:
                    new_type = 'BOTH'
                
                cat = Category(name=name, type=new_type)
                session.add(cat)
        
        session.commit()
        print("Seeding complete.")
    except Exception as e:
        print(f"Error: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    seed()
