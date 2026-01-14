from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from . import models, schemas, crud
from .database import engine, get_db
from .sms_parser import parser

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Personal Finance Manager")

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

# --- Loan Endpoints ---
@app.post("/loans/", response_model=schemas.Loan)
def create_loan(loan: schemas.LoanCreate, db: Session = Depends(get_db)):
    return crud.create_loan(db=db, loan=loan)

@app.get("/loans/", response_model=List[schemas.Loan])
def read_loans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    loans = crud.get_loans(db, skip=skip, limit=limit)
    return loans

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
