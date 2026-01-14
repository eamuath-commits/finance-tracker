from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from typing import List

import models
import schemas
import crud
from database import engine, get_db
from sms_parser import parser
import analysis
import analysis_schema

# --- Migration Logic ---
def run_migrations(engine):
    try:
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('transactions')]
        if 'category' not in columns:
            print("Migrating: Adding category column to transactions table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN category VARCHAR"))
                conn.commit()

        # Check obligation_history for billing_month
        history_columns = [col['name'] for col in inspector.get_columns('obligation_history')]
        if 'billing_month' not in history_columns:
            print("Migrating: Adding billing_month to obligation_history")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE obligation_history ADD COLUMN billing_month DATE"))
                # Backfill: Set billing_month = start of month of payment_date
                conn.execute(text("UPDATE obligation_history SET billing_month = DATE_TRUNC('month', payment_date)"))
                conn.commit()

    except Exception as e:
        print(f"Migration failed: {e}")

# Run migrations
run_migrations(engine)

# Create tables (if they don't exist)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Personal Finance Manager")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Finance API is running"}

# --- Account Endpoints ---
@app.post("/accounts/", response_model=schemas.Account)
def create_account(account: schemas.AccountCreate, db: Session = Depends(get_db)):
    return crud.create_account(db=db, account=account)

@app.get("/accounts/", response_model=List[schemas.Account])
def read_accounts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    accounts = crud.get_accounts(db, skip=skip, limit=limit)
    return accounts

@app.put("/accounts/{account_id}", response_model=schemas.Account)
def update_account(account_id: str, account_update: schemas.AccountUpdate, db: Session = Depends(get_db)):
    updated_account = crud.update_account(db, account_id, account_update)
    if not updated_account:
        raise HTTPException(status_code=404, detail="Account not found")
    return updated_account

# --- Loan Endpoints ---
@app.post("/loans/", response_model=schemas.Loan)
def create_loan(loan: schemas.LoanCreate, db: Session = Depends(get_db)):
    return crud.create_loan(db=db, loan=loan)

@app.get("/loans/", response_model=List[schemas.Loan])
def read_loans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    loans = crud.get_loans(db, skip=skip, limit=limit)
    return loans

@app.put("/loans/{loan_id}", response_model=schemas.Loan)
def update_loan(loan_id: str, loan_update: schemas.LoanUpdate, db: Session = Depends(get_db)):
    updated_loan = crud.update_loan(db, loan_id, loan_update)
    if not updated_loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    return updated_loan

# --- Obligation Endpoints ---
@app.post("/obligations/", response_model=schemas.Obligation)
def create_obligation(obligation: schemas.ObligationCreate, db: Session = Depends(get_db)):
    return crud.create_obligation(db=db, obligation=obligation)

@app.get("/obligations/", response_model=List[schemas.Obligation])
def read_obligations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_obligations(db, skip=skip, limit=limit)

@app.put("/obligations/{obligation_id}", response_model=schemas.Obligation)
def update_obligation(obligation_id: str, obligation_update: schemas.ObligationUpdate, db: Session = Depends(get_db)):
    updated_obj = crud.update_obligation(db, obligation_id, obligation_update)
    if not updated_obj:
        raise HTTPException(status_code=404, detail="Obligation not found")
    return updated_obj

@app.delete("/obligations/{obligation_id}", response_model=schemas.Obligation)
def delete_obligation(obligation_id: str, db: Session = Depends(get_db)):
    deleted_obj = crud.delete_obligation(db, obligation_id)
    if not deleted_obj:
        raise HTTPException(status_code=404, detail="Obligation not found")
    return deleted_obj

@app.post("/obligations/{obligation_id}/pay", response_model=schemas.ObligationHistory)
def pay_obligation(obligation_id: str, payment: schemas.ObligationHistoryCreate, db: Session = Depends(get_db)):
    # Verify obligation exists
    obligation = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
    if not obligation:
        raise HTTPException(status_code=404, detail="Obligation not found")
    
    return crud.create_obligation_payment(db=db, obligation_id=obligation_id, payment=payment)

@app.get("/obligations/{obligation_id}/history", response_model=List[schemas.ObligationHistory])
def read_obligation_history(obligation_id: str, db: Session = Depends(get_db)):
    return crud.get_obligation_history(db, obligation_id)

@app.delete("/obligations/history/{history_id}")
def delete_obligation_history(history_id: int, db: Session = Depends(get_db)):
    killed = crud.delete_obligation_history_entry(db, history_id)
    if not killed:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"message": "History entry deleted"}

@app.put("/obligations/history/{history_id}", response_model=schemas.ObligationHistory)
def update_obligation_history(history_id: int, history_update: schemas.ObligationHistoryUpdate, db: Session = Depends(get_db)):
    updated = crud.update_obligation_history_entry(db, history_id, history_update)
    if not updated:
        raise HTTPException(status_code=404, detail="History entry not found")
    return updated

# --- Transaction Endpoints ---
@app.get("/transactions/", response_model=List[schemas.Transaction])
def read_transactions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_transactions(db, skip=skip, limit=limit)

@app.put("/transactions/{transaction_id}", response_model=schemas.Transaction)
def update_transaction(transaction_id: str, transaction_update: schemas.TransactionUpdate, db: Session = Depends(get_db)):
    updated_tx = crud.update_transaction(db, transaction_id, transaction_update)
    if not updated_tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return updated_tx

# --- Analysis Endpoints ---
@app.get("/analysis/allocation", response_model=analysis_schema.AllocationResponse)
def get_allocation_analysis(db: Session = Depends(get_db)):
    return analysis.calculate_allocation(db)

# --- Webhook Endpoint ---
@app.post("/webhook/sms")
def receive_sms(payload: schemas.SMSPayload, db: Session = Depends(get_db)):
    """
    Receives an SMS body, parses it, finds the matching account, 
    and logs the transaction.
    """
    sms_text = payload.body
    print(f"Received SMS: {sms_text}") # Debug log

    parsed_data = parser.parse(sms_text)
    
    if not parsed_data:
        return {"status": "ignored", "reason": "No pattern matched", "raw": sms_text}
    
    last_4 = parsed_data["last_4"]
    amount = parsed_data["amount"]
    merchant = parsed_data["merchant"]

    # Find Account
    account = crud.get_account_by_last_4(db, last_4=last_4)
    if not account:
        return {
            "status": "warning", 
            "reason": f"Account with last 4 digits {last_4} not found",
            "parsed": parsed_data
        }

    # Create Transaction & Update Balance
    transaction_data = schemas.TransactionCreate(
        account_id=account.id,
        amount=amount,
        merchant=merchant,
        raw_sms_content=sms_text
    )
    crud.create_transaction(db, transaction_data)

    return {
        "status": "success",
        "message": f"Logged {amount} at {merchant} for account {account.name}"
    }
