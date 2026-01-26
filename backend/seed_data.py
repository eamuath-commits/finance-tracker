from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Account, Transaction, AccountType, Category, CurrencyWallet, TransactionType
from datetime import datetime, timedelta
import uuid
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/finance_db")
if "sqlite" in DATABASE_URL:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(bind=engine)
session = SessionLocal()

def seed():
    print("Seeding Simplified Data...")
    try:
        # 1. Accounts
        if session.query(Account).count() == 0:
            print("Creating accounts...")
            checking = Account(
                id=str(uuid.uuid4()),
                name="Main Checking",
                account_type=AccountType.CHECKING,
                last_4_digits="1234",
                current_balance=15450.00,
                bank_name="Al Rajhi Bank"
            )
            credit = Account(
                id=str(uuid.uuid4()),
                name="Platinum Card",
                account_type=AccountType.CREDIT_CARD,
                last_4_digits="9876",
                current_balance=-2300.50,
                credit_limit=20000,
                bank_name="SNB"
            )
            session.add_all([checking, credit])
            session.commit()
            
            # Wallets
            w1 = CurrencyWallet(id=str(uuid.uuid4()), account_id=checking.id, currency_code="SAR", balance=15450.00)
            w2 = CurrencyWallet(id=str(uuid.uuid4()), account_id=credit.id, currency_code="SAR", balance=-2300.50)
            session.add_all([w1, w2])
        else:
            print("Accounts exist, fetching...")
            checking = session.query(Account).filter_by(account_type=AccountType.CHECKING).first()
            credit = session.query(Account).filter_by(account_type=AccountType.CREDIT_CARD).first()

        # 2. Categories
        cats = ['Food', 'Transport', 'Utilities', 'Salary', 'Shopping']
        for c in cats:
            if not session.query(Category).filter_by(name=c).first():
                session.add(Category(id=str(uuid.uuid4()), name=c))
        session.commit()

        # 3. Transactions
        if session.query(Transaction).count() == 0:
            print("Creating transactions...")
            t1 = Transaction(
                id=str(uuid.uuid4()),
                account_id=checking.id,
                amount=25000.00,
                merchant="Employer Co",
                category="Salary",
                type=TransactionType.CREDIT,
                status="completed",
                timestamp=datetime.now() - timedelta(days=5),
                raw_sms_content="Salary deposit"
            )
            t2 = Transaction(
                id=str(uuid.uuid4()),
                account_id=checking.id,
                amount=450.00,
                merchant="Danube",
                category="Food",
                type=TransactionType.DEBIT,
                status="completed",
                timestamp=datetime.now() - timedelta(days=2),
                raw_sms_content="Purchase Danube"
            )
            session.add_all([t1, t2])
            session.commit()
            
        print("Seeding complete!")
    except Exception as e:
        print(f"Error: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    seed()
