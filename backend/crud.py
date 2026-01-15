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

def update_account(db: Session, account_id: str, account_update: schemas.AccountUpdate):
    db_account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not db_account:
        return None
    
    update_data = account_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_account, key, value)
    
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

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

def update_loan(db: Session, loan_id: str, loan_update: schemas.LoanUpdate):
    db_loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not db_loan:
        return None
    
    update_data = loan_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_loan, key, value)
        
    db.add(db_loan)
    db.commit()
    db.refresh(db_loan)
    return db_loan

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

def update_obligation(db: Session, obligation_id: str, obligation_update: schemas.ObligationUpdate):
    db_obj = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
    if not db_obj:
        return None
        
    update_data = obligation_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_obj, key, value)
        
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_obligation(db: Session, obligation_id: str):
    db_obj = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
    if db_obj:
        db.delete(db_obj)
        db.commit()
    return db_obj

def get_transactions(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Transaction).order_by(models.Transaction.timestamp.desc()).offset(skip).limit(limit).all()

def update_transaction(db: Session, transaction_id: str, transaction_update: schemas.TransactionUpdate):
    db_tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not db_tx:
        return None
    
    update_data = transaction_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_tx, key, value)
        
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    db.refresh(db_tx)
    return db_tx

def create_obligation_payment(db: Session, obligation_id: str, payment: schemas.ObligationHistoryCreate):
    # Check for duplicate billing_month
    if payment.billing_month:
        existing = db.query(models.ObligationHistory).filter(
            models.ObligationHistory.obligation_id == obligation_id,
            models.ObligationHistory.billing_month == payment.billing_month
        ).first()
        if existing:
            # If it exists, check if we should allow overwrite or if it's just an update?
            # For now, stick to "Error if duplicate" UNLESS the existing one is just a placeholder (which we don't really have yet, 
            # as virtual items are frontend only). 
            # If user "edits" a virtual item, it sends a POST. If a real record exists, it fails.
            # But what if the record exists and is UNPAID? 
            # If it exists, we should arguably UPDATE it, not create new. 
            # But the frontend logic might be confused. 
            # Let's keep duplicate check but allow "update if exists" logic in frontend (PUT).
            # The strictly duplicate check creates a ValueError.
            raise ValueError(f"Payment for billing month {payment.billing_month} already exists.")

    # Convert status string to Enum
    status_enum = models.PaymentStatus.PAID
    if payment.status:
        try:
            status_enum = models.PaymentStatus(payment.status)
        except ValueError:
            pass # Default to PAID

    db_payment = models.ObligationHistory(
        obligation_id=obligation_id,
        amount=payment.amount,
        payment_date=payment.payment_date,
        billing_month=payment.billing_month,
        note=payment.note,
        status=status_enum
    )
    db.add(db_payment)
    
    # Auto-update the expected amount for next month based on this payment, 
    # BUT only if it is actually PAID. If Pending, maybe don't update expectation?
    if status_enum == models.PaymentStatus.PAID:
        obligation = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
        if obligation:
            obligation.amount = payment.amount
            db.add(obligation)

    db.commit()
    db.refresh(db_payment)
    return db_payment

def delete_obligation_history_entry(db: Session, history_id: int):
    db_history = db.query(models.ObligationHistory).filter(models.ObligationHistory.id == history_id).first()
    if db_history:
        db.delete(db_history)
        db.commit()
    return db_history

def update_obligation_history_entry(db: Session, history_id: int, update_data: schemas.ObligationHistoryUpdate):
    db_history = db.query(models.ObligationHistory).filter(models.ObligationHistory.id == history_id).first()
    if not db_history:
        return None
    
    if update_data.payment_date:
        db_history.payment_date = update_data.payment_date
    if update_data.billing_month:
        db_history.billing_month = update_data.billing_month
    if update_data.amount is not None:
        db_history.amount = update_data.amount
    if update_data.note is not None:
        db_history.note = update_data.note
    if update_data.status:
        try:
            db_history.status = models.PaymentStatus(update_data.status)
        except ValueError:
            pass
        
    db.commit()
    db.refresh(db_history)
    return db_history

def get_obligation_history(db: Session, obligation_id: str):
    return db.query(models.ObligationHistory).filter(models.ObligationHistory.obligation_id == obligation_id).order_by(models.ObligationHistory.payment_date.desc()).all()
