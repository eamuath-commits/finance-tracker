from sqlalchemy.orm import Session
import models
import schemas
import uuid
from datetime import datetime

def get_account_by_last_4(db: Session, last_4: str):
    return db.query(models.Account).filter(models.Account.last_4_digits == last_4).first()

def create_account(db: Session, account: schemas.AccountCreate):
    db_account = models.Account(
        name=account.name,
        account_type=account.account_type,
        last_4_digits=account.last_4_digits,
        current_balance=account.current_balance
    )
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

def get_accounts(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Account).offset(skip).limit(limit).all()

def create_transaction(db: Session, transaction: schemas.TransactionCreate):
    db_transaction = models.Transaction(
        account_id=transaction.account_id,
        amount=transaction.amount,
        merchant=transaction.merchant,
        raw_sms_content=transaction.raw_sms_content,
        timestamp=datetime.utcnow()
    )
    db.add(db_transaction)
    
    # Update Account Balance
    account = db.query(models.Account).filter(models.Account.id == transaction.account_id).first()
    if account:
        # Assuming outgoing transaction is negative? Or positive?
        # Convention: User spends money -> Subtract from checking, Add to Credit Card debt?
        # For simplicity Phase 1: Just subtract from "Balance".
        # If it's a Credit Card, "Balance" usually means "Limit Available" or "Debt"?
        # Let's assume Balance is "Net Worth" style. Spending decreases it.
        account.current_balance -= transaction.amount
        db.add(account)

    db.commit()
    db.refresh(db_transaction)
    return db_transaction

def create_loan(db: Session, loan: schemas.LoanCreate):
    # Initial remaining balance = principal
    db_loan = models.Loan(
        name=loan.name,
        principal_amount=loan.principal_amount,
        interest_rate=loan.interest_rate,
        start_date=loan.start_date,
        term_months=loan.term_months,
        remaining_balance=loan.principal_amount 
    )
    db.add(db_loan)
    db.commit()
    db.refresh(db_loan)
    return db_loan

def get_loans(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Loan).offset(skip).limit(limit).all()

def create_obligation(db: Session, obligation: schemas.ObligationCreate):
    db_obj = models.MonthlyObligation(
        name=obligation.name,
        amount=obligation.amount,
        due_day=obligation.due_day,
        category=obligation.category
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def get_obligations(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.MonthlyObligation).offset(skip).limit(limit).all()

def get_transactions(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Transaction).order_by(models.Transaction.timestamp.desc()).offset(skip).limit(limit).all()
