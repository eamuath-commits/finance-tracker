from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from typing import List, Optional
from datetime import datetime
import re
import logging

# Setup logger for API
logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

import models
import schemas
import crud
from database import engine, get_db
from sms_parser import parser
import sms_agent
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
        
        if 'notes' not in columns:
            print("Migrating: Adding notes to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN notes TEXT"))
                conn.commit()

        if 'fees' not in columns:
            print("Migrating: Adding fees to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN fees FLOAT DEFAULT 0.0"))
                conn.commit()

        # Check for table rename (obligation_history -> payments)
        table_names = inspector.get_table_names()
        if 'obligation_history' in table_names and 'payments' not in table_names:
            print("Migrating: Renaming obligation_history to payments")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE obligation_history RENAME TO payments"))
                conn.commit()
        
        # Check for amount optionality
        # (This is harder to check via inspector easily without iterating constraint, allow it to run if needed or just try/except)
        # We can just try to alter it.
        try:
             with engine.connect() as conn:
                # Postgres syntax
                conn.execute(text("ALTER TABLE obligations ALTER COLUMN amount DROP NOT NULL"))
                conn.commit()
        except Exception:
            pass # Already nullable or other error
            
        # Check for display_order in loans
        if 'loans' in table_names:
            loan_columns = [col['name'] for col in inspector.get_columns('loans')]
            if 'display_order' not in loan_columns:
                print("Migrating: Adding display_order to loans")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE loans ADD COLUMN display_order INTEGER DEFAULT 0"))
                    conn.commit()

        # Check payments for billing_month (if renaming didn't happen or previously migrated)
        # Note: If we renamed, the columns are there.
        # But if we are starting fresh, create_all does it.
        
        # Check payments table for status column
        # We need to refresh inspector if we renamed
        inspector = inspect(engine)
        if 'payments' in inspector.get_table_names():
            p_columns = [col['name'] for col in inspector.get_columns('payments')]
            if 'status' not in p_columns:
                print("Migrating: Adding status to payments")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE payments ADD COLUMN status VARCHAR DEFAULT 'PAID'"))
                    conn.commit()
            
            if 'transaction_id' not in p_columns:
                print("Migrating: Adding transaction_id to payments")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE payments ADD COLUMN transaction_id VARCHAR REFERENCES transactions(id)"))
                    conn.commit()

        # Check accounts table for credit_limit
        if 'accounts' in inspector.get_table_names():
            a_columns = [col['name'] for col in inspector.get_columns('accounts')]
            if 'credit_limit' not in a_columns:
                print("Migrating: Adding credit_limit to accounts")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE accounts ADD COLUMN credit_limit FLOAT"))
                    conn.commit()
            
            # Check for first_4_digits while we are at it
            if 'first_4_digits' not in a_columns:
                 print("Migrating: Adding first_4_digits to accounts")
                 with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE accounts ADD COLUMN first_4_digits VARCHAR"))
                    conn.commit()

            if 'notes' not in a_columns:
                print("Migrating: Adding notes to accounts")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE accounts ADD COLUMN notes TEXT"))
                    conn.commit()



        # Check loans table for display_order and due_day
        if 'loans' in inspector.get_table_names():
            l_columns = [col['name'] for col in inspector.get_columns('loans')]
            if 'display_order' not in l_columns:
                print("Migrating: Adding display_order to loans")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE loans ADD COLUMN display_order INTEGER DEFAULT 0"))
                    conn.commit()
            
            if 'due_day' not in l_columns:
                print("Migrating: Adding due_day to loans")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE loans ADD COLUMN due_day INTEGER"))
                    conn.commit()

            if 'notes' not in l_columns:
                print("Migrating: Adding notes to loans")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE loans ADD COLUMN notes TEXT"))
                    conn.commit()

        # Check obligations table for display_order
        if 'obligations' in inspector.get_table_names():
            o_columns = [col['name'] for col in inspector.get_columns('obligations')]
            if 'display_order' not in o_columns:
                print("Migrating: Adding display_order to obligations")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE obligations ADD COLUMN display_order INTEGER DEFAULT 0"))
                    conn.commit()

            if 'notes' not in o_columns:
                print("Migrating: Adding notes to obligations")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE obligations ADD COLUMN notes TEXT"))
                    conn.commit()

        # Check accounts table for is_income
        if 'accounts' in inspector.get_table_names():
            a_columns = [col['name'] for col in inspector.get_columns('accounts')]
            if 'is_income' not in a_columns:
                print("Migrating: Adding is_income to accounts")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE accounts ADD COLUMN is_income BOOLEAN DEFAULT FALSE"))
                    conn.commit()

        # Check allocation_rules table for new schema columns
        if 'allocation_rules' in inspector.get_table_names():
            ar_columns = [col['name'] for col in inspector.get_columns('allocation_rules')]
            if 'rule_type' not in ar_columns:
                print("Migrating: Recreating allocation_rules with new schema")
                with engine.connect() as conn:
                    # Drop and recreate to avoid complex migration
                    conn.execute(text("DROP TABLE IF EXISTS allocation_rules"))
                    conn.commit()
                # Let create_all recreate with new schema

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

@app.delete("/accounts/{account_id}")
def delete_account(account_id: str, db: Session = Depends(get_db)):
    deleted_account = crud.delete_account(db, account_id)
    if not deleted_account:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"message": "Account deleted successfully"}

# --- Credit Card Endpoints ---
@app.post("/credit-cards/", response_model=schemas.CreditCard)
def create_credit_card(card: schemas.CreditCardCreate, db: Session = Depends(get_db)):
    return crud.create_credit_card(db=db, card=card)

@app.get("/credit-cards/", response_model=List[schemas.CreditCard])
def read_credit_cards(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_credit_cards(db, skip=skip, limit=limit)

@app.get("/credit-cards/{card_id}", response_model=schemas.CreditCard)
def read_credit_card(card_id: str, db: Session = Depends(get_db)):
    card = crud.get_credit_card(db, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return card

@app.put("/credit-cards/{card_id}", response_model=schemas.CreditCard)
def update_credit_card(card_id: str, card_update: schemas.CreditCardUpdate, db: Session = Depends(get_db)):
    updated_card = crud.update_credit_card(db, card_id, card_update)
    if not updated_card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return updated_card

@app.delete("/credit-cards/{card_id}")
def delete_credit_card(card_id: str, db: Session = Depends(get_db)):
    deleted = crud.delete_credit_card(db, card_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return {"message": "Credit card deleted successfully"}

@app.get("/credit-cards/{card_id}/transactions", response_model=List[schemas.Transaction])
def get_credit_card_transactions(card_id: str, db: Session = Depends(get_db)):
    """Get all transactions for a specific credit card"""
    card = crud.get_credit_card(db, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    transactions = db.query(models.Transaction).filter(
        models.Transaction.credit_card_id == card_id
    ).order_by(models.Transaction.timestamp.desc()).all()
    return transactions

@app.post("/credit-cards/{card_id}/payment")
def record_credit_card_payment(card_id: str, amount: float, from_account_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Record a payment to a credit card (reduces balance)"""
    card = crud.get_credit_card(db, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    
    # Create the credit transaction on the card (payment = credit)
    from datetime import datetime
    tx_data = schemas.TransactionCreate(
        credit_card_id=card_id,
        amount=amount,
        merchant=f"Payment to {card.name}",
        category="Payment",
        type="credit",
        status="completed",
        timestamp=datetime.now()
    )
    tx = crud.create_transaction(db, tx_data)
    
    # If paying from an account, create a corresponding debit there
    if from_account_id:
        account = db.query(models.Account).filter(models.Account.id == from_account_id).first()
        if account:
            debit_tx = schemas.TransactionCreate(
                account_id=from_account_id,
                amount=amount,
                merchant=f"Credit Card Payment - {card.name}",
                category="Credit Card Payment",
                type="debit",
                status="completed",
                timestamp=datetime.now()
            )
            crud.create_transaction(db, debit_tx)
    
    return {"message": f"Payment of {amount} SAR recorded", "new_balance": card.current_balance}

@app.post("/accounts/{account_id}/aliases", response_model=schemas.AccountAlias)
def create_alias(account_id: str, alias: schemas.AccountAliasCreate, db: Session = Depends(get_db)):
    # Verify account exists
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return crud.create_account_alias(db, account_id, alias)

@app.delete("/aliases/{alias_id}")
def delete_alias(alias_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_account_alias(db, alias_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alias not found")
    return {"message": "Alias deleted"}

# --- Loan Endpoints ---
@app.post("/loans/", response_model=schemas.Loan)
def create_loan(loan: schemas.LoanCreate, db: Session = Depends(get_db)):
    return crud.create_loan(db=db, loan=loan)

@app.get("/loans/", response_model=List[schemas.Loan])
def read_loans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    loans = crud.get_loans(db, skip=skip, limit=limit)
    return loans

@app.put("/loans/reorder")
def reorder_loans(payload: schemas.ReorderSchema, db: Session = Depends(get_db)):
    crud.reorder_loans(db, payload.ordered_ids)
    return {"status": "success"}

@app.put("/loans/{loan_id}", response_model=schemas.Loan)
def update_loan(loan_id: str, loan_update: schemas.LoanUpdate, db: Session = Depends(get_db)):
    updated_loan = crud.update_loan(db, loan_id, loan_update)
    if not updated_loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if not updated_loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    return updated_loan

@app.delete("/loans/{loan_id}", response_model=schemas.Loan)
def delete_loan(loan_id: str, db: Session = Depends(get_db)):
    deleted = crud.delete_loan(db, loan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Loan not found")
    return deleted

# --- Obligation Endpoints ---
@app.post("/obligations/", response_model=schemas.Obligation)
def create_obligation(obligation: schemas.ObligationCreate, db: Session = Depends(get_db)):
    return crud.create_obligation(db=db, obligation=obligation)

@app.get("/obligations/", response_model=List[schemas.Obligation])
def read_obligations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_obligations(db, skip=skip, limit=limit)

@app.put("/obligations/reorder")
def reorder_obligations(payload: schemas.ReorderSchema, db: Session = Depends(get_db)):
    crud.reorder_obligations(db, payload.ordered_ids)
    return {"status": "success"}

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

@app.get("/obligations/{obligation_id}/matches", response_model=List[schemas.Transaction])
def get_obligation_matches(obligation_id: str, db: Session = Depends(get_db)):
    # 1. Get Obligation
    obligation = crud.get_obligation(db, obligation_id)
    if not obligation:
        raise HTTPException(status_code=404, detail="Obligation not found")

    # 2. Get Search Date Range (Current Month)
    today = datetime.now()
    # Look back 5 days before start of month for early payments
    search_start = datetime(today.year, today.month, 1)

    # 3. Keyword Extraction (Simple: First word of name or strict name)
    keyword = obligation.name.split(" ")[0].lower() # e.g. "Stc" from "STC Internet"
    
    # 4. Search Candidates
    # Criteria: Debit type, timestamp >= search_start
    query = db.query(models.Transaction).filter(
        models.Transaction.timestamp >= search_start,
        models.Transaction.type == 'debit'
    )
    
    candidates = query.all()
    
    # 5. Filter Candidates (Python side for flexibility)
    matches = []
    
    # Get all linked Transaction IDs to exclude
    linked_tx_ids = [p.transaction_id for p in db.query(models.Payment).filter(models.Payment.transaction_id != None).all()]
    
    for tx in candidates:
        if tx.id in linked_tx_ids:
            continue
            
        match_score = 0
        
        # A. Name Match
        # A. Name/Keyword Match
        # Check Name
        if keyword in (tx.merchant or "").lower() or keyword in (tx.notes or "").lower():
            match_score += 50
        
        # Check Notes (User defined aliases)
        if obligation.notes:
            note_keywords = [w.lower() for w in obligation.notes.split() if len(w) > 2] # Ignore small words
            for k in note_keywords:
                if k in (tx.merchant or "").lower() or k in (tx.notes or "").lower():
                    match_score += 50
                    break # Only bonus once for notes match
            
        # B. Amount Match (if Obligation has amount)
        if obligation.amount and tx.amount:
            # 10% tolerance
            diff = abs(tx.amount - obligation.amount)
            if diff / obligation.amount <= 0.1:
                match_score += 40
            # Exact match bonus
            if diff == 0:
                match_score += 20
        
        # C. Category Match (if matches obligation category)
        if obligation.category and tx.category and obligation.category.lower() == tx.category.lower():
            match_score += 20
            
        # Threshold
        if match_score >= 40:
             matches.append(tx)
             
    # Sort by closest amount, then date desc
    matches.sort(key=lambda x: abs(x.amount - (obligation.amount or 0)))
    
    return matches

@app.post("/obligations/{obligation_id}/pay", response_model=schemas.Payment)
def pay_obligation(obligation_id: str, payment: schemas.PaymentCreate, db: Session = Depends(get_db)):
    # Verify obligation exists
    obligation = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
    if not obligation:
        raise HTTPException(status_code=404, detail="Obligation not found")
    
    try:
        return crud.create_payment(db=db, obligation_id=obligation_id, payment=payment)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/obligations/{obligation_id}/payments", response_model=List[schemas.Payment])
def read_obligation_payments(obligation_id: str, db: Session = Depends(get_db)):
    return crud.get_payments(db, obligation_id)

@app.get("/obligations/{obligation_id}/history", response_model=List[schemas.Payment]) # Keep deprecated endpoint for safety temporarily?
def read_obligation_history_legacy(obligation_id: str, db: Session = Depends(get_db)):
    return crud.get_payments(db, obligation_id)

@app.delete("/obligations/history/{payment_id}") # Backward compat URL for frontend
def delete_payment(payment_id: int, db: Session = Depends(get_db)):
    killed = crud.delete_payment(db, payment_id)
    if not killed:
        raise HTTPException(status_code=404, detail="Payment entry not found")
    return {"message": "Payment deleted"}

@app.put("/obligations/history/{payment_id}", response_model=schemas.Payment) # Backward compat URL
def update_payment(payment_id: int, payment_update: schemas.PaymentUpdate, db: Session = Depends(get_db)):
    updated = crud.update_payment(db, payment_id, payment_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Payment entry not found")
    return updated

# --- Payment-Transaction Linking Endpoints ---
@app.get("/payments/{payment_id}/suggested-transactions")
def get_suggested_transactions(payment_id: int, db: Session = Depends(get_db)):
    """
    Suggest transactions that might match this payment.
    Matching criteria:
    - Date within ±5 days of billing month's due date
    - Amount within 10% tolerance
    - Merchant name contains obligation/provider name
    """
    # Get the payment
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Get the related obligation
    obligation = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == payment.obligation_id).first()
    if not obligation:
        return []
    
    # Parse billing month (YYYY-MM format)
    from datetime import datetime, timedelta
    try:
        billing_date = datetime.strptime(payment.billing_month + "-01", "%Y-%m-%d")
    except:
        return []
    
    # Calculate the target due date for this billing month
    due_day = obligation.due_day or 1
    try:
        target_date = billing_date.replace(day=due_day)
    except ValueError:
        # Handle months with fewer days
        import calendar
        last_day = calendar.monthrange(billing_date.year, billing_date.month)[1]
        target_date = billing_date.replace(day=min(due_day, last_day))
    
    # Search window: ±5 days around due date
    start_date = target_date - timedelta(days=5)
    end_date = target_date + timedelta(days=5)
    
    # Query transactions in date range
    transactions = db.query(models.Transaction).filter(
        models.Transaction.timestamp >= start_date,
        models.Transaction.timestamp <= end_date,
        models.Transaction.type == "debit"  # Payments are typically debits
    ).order_by(models.Transaction.timestamp.desc()).all()
    
    # Score and filter suggestions
    suggestions = []
    payment_amount = payment.amount or 0
    search_terms = [obligation.name.lower()]
    if obligation.provider:
        search_terms.append(obligation.provider.lower())
    
    for tx in transactions:
        score = 0
        reasons = []
        
        # Amount matching (within 10% tolerance)
        if payment_amount > 0 and tx.amount:
            diff_pct = abs(tx.amount - payment_amount) / payment_amount * 100
            if diff_pct < 1:
                score += 50
                reasons.append("exact_amount")
            elif diff_pct < 10:
                score += 30
                reasons.append("similar_amount")
        
        # Merchant name matching
        merchant_lower = (tx.merchant or "").lower()
        for term in search_terms:
            if term in merchant_lower:
                score += 40
                reasons.append("name_match")
                break
        
        # Date proximity bonus
        if tx.timestamp:
            days_diff = abs((tx.timestamp.date() - target_date.date()).days)
            if days_diff == 0:
                score += 20
                reasons.append("exact_date")
            elif days_diff <= 2:
                score += 10
                reasons.append("close_date")
        
        # Only include if there's some relevance
        if score > 0:
            suggestions.append({
                "transaction_id": tx.id,
                "merchant": tx.merchant,
                "amount": tx.amount,
                "date": tx.timestamp.isoformat() if tx.timestamp else None,
                "score": score,
                "reasons": reasons,
                "already_linked": tx.id == payment.transaction_id
            })
    
    # Sort by score descending
    suggestions.sort(key=lambda x: x["score"], reverse=True)
    
    return suggestions[:5]  # Return top 5 suggestions

@app.post("/payments/{payment_id}/link-transaction")
def link_payment_to_transaction(payment_id: int, transaction_id: str, db: Session = Depends(get_db)):
    """Link a payment to a transaction and mark it as paid."""
    # Get the payment
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Verify transaction exists
    transaction = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Update payment
    payment.transaction_id = transaction_id
    payment.status = models.PaymentStatus.PAID
    
    # Optionally update amount if not set
    if payment.amount is None or payment.amount == 0:
        payment.amount = transaction.amount
    
    db.commit()
    db.refresh(payment)
    
    return {
        "message": "Payment linked successfully",
        "payment_id": payment.id,
        "transaction_id": transaction_id,
        "status": payment.status.value
    }

@app.delete("/payments/{payment_id}/unlink-transaction")
def unlink_payment_transaction(payment_id: int, db: Session = Depends(get_db)):
    """Remove the link between a payment and its transaction."""
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    payment.transaction_id = None
    db.commit()
    
    return {"message": "Transaction unlinked"}

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

@app.post("/transactions/", response_model=schemas.Transaction)
def create_transaction(transaction: schemas.TransactionCreate, db: Session = Depends(get_db)):
    # Verify account exists
    account = db.query(models.Account).filter(models.Account.id == transaction.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return crud.create_transaction(db=db, transaction=transaction)

@app.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: str, db: Session = Depends(get_db)):
    deleted = crud.delete_transaction(db, transaction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted"}

@app.post("/transactions/bulk-delete")
def bulk_delete_transactions(payload: schemas.BulkDeleteRequest, db: Session = Depends(get_db)):
    deleted_count = 0
    for tx_id in payload.ids:
        crud.delete_transaction(db, tx_id)
        deleted_count += 1
    return {"message": f"Deleted {deleted_count} transactions"}

@app.post("/transactions/{transaction_id}/complete-transfer")
def complete_pending_transfer(transaction_id: str, source_account_id: str, db: Session = Depends(get_db)):
    """
    Complete a pending internal transfer by specifying the source account.
    This will:
    1. Mark the credit transaction as completed
    2. Create a corresponding debit transaction on the source account
    """
    # Get the pending transaction
    pending_tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not pending_tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if pending_tx.status != "pending_action":
        raise HTTPException(status_code=400, detail="Transaction is not pending")
    
    # Validate source account
    source_account = db.query(models.Account).filter(models.Account.id == source_account_id).first()
    if not source_account:
        raise HTTPException(status_code=404, detail="Source account not found")
    
    # Don't allow selecting the same account as both source and destination
    if source_account_id == pending_tx.account_id:
        raise HTTPException(status_code=400, detail="Source and destination accounts cannot be the same")
    
    # Get destination account for naming
    dest_account = db.query(models.Account).filter(models.Account.id == pending_tx.account_id).first()
    
    # 1. Create the DEBIT transaction on source account
    debit_tx = models.Transaction(
        account_id=source_account_id,
        amount=pending_tx.amount,
        original_amount=pending_tx.original_amount,
        original_currency=pending_tx.original_currency,
        exchange_rate=pending_tx.exchange_rate,
        merchant=f"Transfer to {dest_account.name}" if dest_account else "Outgoing Transfer",
        raw_sms_content=pending_tx.raw_sms_content,
        parsed_data=pending_tx.parsed_data,
        timestamp=pending_tx.timestamp,
        category="Transfer",
        type="debit",
        status="completed",
        fees=pending_tx.fees
    )
    
    # Update source account balance (subtract)
    source_account.current_balance -= pending_tx.amount
    debit_tx.balance_after_transaction = source_account.current_balance
    
    db.add(debit_tx)
    
    # 2. Update the credit transaction: mark as completed and update merchant name
    pending_tx.status = "completed"
    pending_tx.merchant = f"Transfer from {source_account.name}"
    
    # Update destination account balance (add) - was pending, now apply
    dest_account.current_balance += pending_tx.amount
    pending_tx.balance_after_transaction = dest_account.current_balance
    
    db.commit()
    db.refresh(pending_tx)
    
    return {
        "message": "Transfer completed successfully",
        "credit_transaction": schemas.Transaction.model_validate(pending_tx),
        "debit_transaction": schemas.Transaction.model_validate(debit_tx)
    }

@app.get("/transactions/pending")
def get_pending_transactions(db: Session = Depends(get_db)):
    """Get all pending transactions that need user action"""
    pending = db.query(models.Transaction).filter(
        models.Transaction.status == "pending_action"
    ).order_by(models.Transaction.timestamp.desc()).all()
    return pending

# --- Analysis Endpoints ---
@app.get("/analysis/allocation", response_model=analysis_schema.AllocationResponse)
def get_allocation_analysis(db: Session = Depends(get_db)):
    return analysis.calculate_allocation(db)

# --- Webhook Endpoint ---
@app.post("/webhook/sms")
async def receive_sms(request: Request, db: Session = Depends(get_db)):
    try:
        raw_body = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Validate or Fallback
    sender = raw_body.get("sender", "Unknown")
    body = raw_body.get("body", "")
    
    if not body:
         # Try full dump if body key doesn't exist
         body = str(raw_body)

    # 1. Save Raw Message
    raw_msg = models.RawMessage(
        sender=sender,
        body=body,
        status=models.MessageStatus.PENDING
    )
    db.add(raw_msg)
    db.commit() # Commit to get ID and ensure persistence even if crash
    db.refresh(raw_msg)
    
    print(f"Extract SMS Body: {body}")

    # 2. Unified AI Parse
    try:
        result = await sms_agent.parse_with_ai(db, body)
    except Exception as e:
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"AI Parse Error: {str(e)}"
        db.commit()
        return {"status": "failed", "reason": f"AI Parse Error: {str(e)}"}

    if not result or not result.get("is_financial_event"):
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = "Not a financial event"
        db.commit()
        return {"status": "ignored", "reason": "Not a financial event"}

    # 3. Find Account
    last_4 = result.get("destination_account_last4") or result.get("source_account_last4")
    if not last_4 and result.get("card_info"):
        # Heuristic for cards
        card_match = re.search(r"(\d{4})", result["card_info"])
        if card_match: last_4 = card_match.group(1)

    account = crud.get_account_by_last_4(db, last_4=last_4) if last_4 else None
    
    if not account:
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"Account {last_4} not found"
        db.commit()
        return {
            "status": "warning", 
            "reason": f"Account with last 4 digits {last_4} not found",
            "parsed": result
        }

    # 4. Create Transaction Logic (Handles Conversion, Credit/Debit, etc.)
    try:
        await sms_agent._create_transaction_logic(db, result, account, None, body, reply_target=None)
        raw_msg.status = models.MessageStatus.PARSED
        raw_msg.error_log = None
        db.commit()
        return {"status": "success", "message": "Logged successfully via AI"}
    except Exception as e:
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"Storage Error: {str(e)}"
        db.commit()
        return {"status": "failed", "reason": str(e)}

# --- SMS Inbox Endpoints ---
@app.get("/messages/", response_model=List[schemas.RawMessage])
def read_messages(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.RawMessage).order_by(models.RawMessage.timestamp.desc()).offset(skip).limit(limit).all()

@app.post("/messages/{message_id}/retry")
async def retry_message(message_id: str, db: Session = Depends(get_db)):
    # Fetch Message
    msg = db.query(models.RawMessage).filter(models.RawMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    logger.info(f"[RETRY] Starting retry for message {message_id}: {msg.body[:100]}...")

    # 1. Re-Run AI Parse
    try:
        result = await sms_agent.parse_with_ai(db, msg.body)
        logger.info(f"[RETRY] AI Response: {result}")
    except Exception as e:
        logger.error(f"[RETRY] AI Parse Exception: {str(e)}")
        msg.status = models.MessageStatus.FAILED
        msg.error_log = f"Retry AI Error: {str(e)}"
        db.commit()
        return {"status": "failed", "reason": str(e)}
    
    # Check for AI errors
    if result and result.get("error"):
        logger.warning(f"[RETRY] AI returned error: {result.get('error')}")
        msg.status = models.MessageStatus.FAILED
        msg.error_log = f"Retry AI Error: {result.get('error')}"
        db.commit()
        return {"status": "failed", "reason": result.get("error")}
        
    if not result or not result.get("is_financial_event"):
        reason = result.get("reason", "Unknown") if result else "No response"
        logger.warning(f"[RETRY] AI said not financial. Reason: {reason}, Full response: {result}")
        msg.status = models.MessageStatus.FAILED
        msg.error_log = f"Retry: AI said not financial - {reason}"
        db.commit()
        return {"status": "ignored", "reason": f"Not financial: {reason}"}

    # 2. Find Account logic (Unified)
    last_4 = result.get("destination_account_last4") or result.get("source_account_last4")
    # Fallback to card info
    if not last_4 and result.get("card_info"):
         card_match = re.search(r"(\d{4})", result["card_info"])
         if card_match: last_4 = card_match.group(1)

    account = crud.get_account_by_last_4(db, last_4=last_4) if last_4 else None

    if not account:
        msg.status = models.MessageStatus.FAILED
        msg.error_log = f"Retry: Account {last_4} not found"
        db.commit()
        return {"status": "warning", "reason": "Account not found"}

    # 3. Create Logic
    try:
        await sms_agent._create_transaction_logic(db, result, account, None, msg.body, reply_target=None)
        msg.status = models.MessageStatus.PARSED
        msg.error_log = None
        db.commit()
        return {"status": "success", "message": "Parsed and logged successfully via AI"}
    except Exception as e:
        msg.status = models.MessageStatus.FAILED
        msg.error_log = f"Retry Error: {str(e)}"
        db.commit()
        return {"status": "failed", "reason": str(e)}

@app.post("/messages/bulk-delete")
def bulk_delete_messages(payload: schemas.BulkDeleteRequest, db: Session = Depends(get_db)):
    deleted_count = 0
    for msg_id in payload.ids:
        crud.delete_message(db, msg_id)
        deleted_count += 1
    return {"message": f"Deleted {deleted_count} messages"}

# --- Direct SMS Ingest (for iPhone Shortcuts) ---
@app.post("/api/sms/ingest")
async def ingest_sms(payload: schemas.SMSIngest, db: Session = Depends(get_db)):
    """
    Direct SMS ingest endpoint for iPhone Shortcuts.
    Accepts separate 'sender' and 'body' fields.
    
    Example request:
    {
        "sender": "AlRajhiBank",
        "body": "PoS | By:9365;mada-Apple Pay | Amount:SAR 96..."
    }
    """
    logger.info(f"[SMS-INGEST] Received from: {payload.sender}")
    
    # 1. Create Raw Message record
    raw_msg = models.RawMessage(
        sender=payload.sender,
        body=payload.body,
        status=models.MessageStatus.PENDING,
        timestamp=datetime.now()
    )
    db.add(raw_msg)
    db.commit()
    db.refresh(raw_msg)
    
    # 2. AI Parse
    try:
        result = await sms_agent.parse_with_ai(db, payload.body)
        logger.info(f"[SMS-INGEST] AI Response: {result}")
    except Exception as e:
        logger.error(f"[SMS-INGEST] AI Error: {str(e)}")
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"AI Error: {str(e)}"
        db.commit()
        return {"status": "failed", "reason": str(e)}
    
    # 3. Check for errors
    if result and result.get("error"):
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = result.get("error")
        db.commit()
        return {"status": "failed", "reason": result.get("error")}
    
    if not result or not result.get("is_financial_event"):
        reason = result.get("reason", "Not a financial event") if result else "No response"
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = reason
        db.commit()
        return {"status": "ignored", "reason": reason}
    
    # 4. Find account
    last_4 = result.get("destination_account_last4") or result.get("source_account_last4")
    if not last_4 and result.get("card_info"):
        card_match = re.search(r"(\d{4})", result["card_info"])
        if card_match:
            last_4 = card_match.group(1)
    
    account = None
    if last_4:
        account = crud.get_account_by_last_4(db, str(last_4))
        if not account:
            # Try credit card
            credit_card = crud.get_credit_card_by_last_4(db, str(last_4))
            if credit_card:
                account = credit_card
    
    if not account:
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"Account not found for: {last_4}"
        db.commit()
        return {"status": "warning", "reason": f"Account {last_4} not found", "parsed": result}
    
    # 5. Create transaction
    try:
        await sms_agent._create_transaction_logic(db, result, account, None, payload.body, reply_target=None)
        raw_msg.status = models.MessageStatus.PARSED
        raw_msg.error_log = None
        db.commit()
        return {"status": "success", "message": "Transaction logged", "parsed": result}
    except Exception as e:
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"Transaction Error: {str(e)}"
        db.commit()
        return {"status": "failed", "reason": str(e)}

# --- Savings Goal Endpoints ---
@app.post("/goals/", response_model=schemas.SavingsGoal)
def create_goal(goal: schemas.SavingsGoalCreate, db: Session = Depends(get_db)):
    return crud.create_goal(db=db, goal=goal)

@app.get("/goals/", response_model=List[schemas.SavingsGoal])
def read_goals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_goals(db, skip=skip, limit=limit)

@app.put("/goals/{goal_id}", response_model=schemas.SavingsGoal)
def update_goal(goal_id: str, goal_update: schemas.SavingsGoalUpdate, db: Session = Depends(get_db)):
    updated_goal = crud.update_goal(db, goal_id, goal_update)
    if not updated_goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return updated_goal

@app.delete("/goals/{goal_id}", response_model=schemas.SavingsGoal)
def delete_goal(goal_id: str, db: Session = Depends(get_db)):
    deleted_goal = crud.delete_goal(db, goal_id)
    if not deleted_goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return deleted_goal

# --- Allocation Rules ---

@app.post("/allocation/rules", response_model=schemas.AllocationRule)
def create_allocation_rule(rule: schemas.AllocationRuleCreate, db: Session = Depends(get_db)):
    return crud.create_allocation_rule(db, rule)

@app.get("/allocation/rules", response_model=List[schemas.AllocationRule])
def get_allocation_rules(db: Session = Depends(get_db)):
    return crud.get_allocation_rules(db)

@app.delete("/allocation/rules/{rule_id}")
def delete_allocation_rule(rule_id: str, db: Session = Depends(get_db)):
    success = crud.delete_allocation_rule(db, rule_id)
    return {"success": success}

# --- Obligations ---

@app.get("/obligations/", response_model=List[schemas.Obligation])
def get_obligations(db: Session = Depends(get_db)):
    return crud.get_obligations(db)

@app.post("/obligations/", response_model=schemas.Obligation)
def create_obligation(obligation: schemas.ObligationCreate, db: Session = Depends(get_db)):
    return crud.create_obligation(db, obligation)

@app.put("/obligations/{obligation_id}", response_model=schemas.Obligation)
def update_obligation(obligation_id: str, obligation: schemas.ObligationUpdate, db: Session = Depends(get_db)):
    return crud.update_obligation(db, obligation_id, obligation)

@app.delete("/obligations/{obligation_id}")
def delete_obligation(obligation_id: str, db: Session = Depends(get_db)):
    crud.delete_obligation(db, obligation_id)
    return {"message": "Deleted"}

@app.put("/obligations/reorder")
def reorder_obligations(payload: schemas.ReorderSchema, db: Session = Depends(get_db)):
    crud.reorder_obligations(db, payload.ordered_ids)
    return {"message": "Reordered"}

# --- Payments (Obligation History) ---

@app.get("/obligations/{obligation_id}/payments", response_model=List[schemas.Payment])
def get_payment_history(obligation_id: str, db: Session = Depends(get_db)):
    return crud.get_payment_history(db, obligation_id)

@app.post("/obligations/{obligation_id}/pay", response_model=schemas.Payment)
def create_payment(obligation_id: str, payment: schemas.PaymentCreate, db: Session = Depends(get_db)):
    return crud.create_payment(db, obligation_id, payment)

@app.put("/obligations/history/{payment_id}", response_model=schemas.Payment)
def update_payment(payment_id: int, payment: schemas.PaymentUpdate, db: Session = Depends(get_db)):
    return crud.update_payment(db, payment_id, payment)

@app.delete("/obligations/history/{payment_id}")
def delete_payment(payment_id: int, db: Session = Depends(get_db)):
    crud.delete_payment(db, payment_id)
    return {"message": "Deleted"}
    if not success:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"message": "Rule deleted"}

@app.post("/allocation/preview", response_model=schemas.AllocationPreviewResponse)
def preview_allocation(req: schemas.AllocationExecuteRequest, db: Session = Depends(get_db)):
    return crud.calculate_allocation_preview(db, req.source_account_id, req.month_offset)

@app.post("/allocation/execute")
def execute_allocation(req: schemas.AllocationExecuteRequest, db: Session = Depends(get_db)):
    preview = crud.calculate_allocation_preview(db, req.source_account_id, req.month_offset)
    
    source_acc = crud.get_account(db, req.source_account_id)
    if not source_acc:
        raise HTTPException(status_code=404, detail="Source account not found")

    # Calculate billing month for payroll transfer records
    from dateutil.relativedelta import relativedelta
    target_date = datetime.now() + relativedelta(months=req.month_offset)
    billing_month = target_date.strftime('%Y-%m')

    # Group allocations by target_account_id to avoid duplicate transfers
    # Only include pending items (not transferred/allocated)
    by_target = {}
    for item in preview.allocations:
        if item.amount <= 0 or item.status != 'pending':
            continue
            
        # Filter if specific target requested
        if req.target_account_id and item.target_account_id != req.target_account_id:
            continue
        
        if item.target_account_id not in by_target:
            by_target[item.target_account_id] = {
                'target_account_name': item.target_account_name,
                'items': [],
                'total_amount': 0
            }
        by_target[item.target_account_id]['items'].append(item.name)
        by_target[item.target_account_id]['total_amount'] += item.amount

    executed_transfers = []
    
    for target_account_id, data in by_target.items():
        # Use override amount if provided for this specific target
        requested_amount = data['total_amount']
        if req.override_amount is not None and req.target_account_id == target_account_id:
            requested_amount = req.override_amount

        transfer_amount = requested_amount
        shortage = 0.0
        
        if source_acc.current_balance < transfer_amount:
            # Partial Transfer Logic
            transfer_amount = max(0, source_acc.current_balance)
            shortage = requested_amount - transfer_amount
            
            if transfer_amount <= 0:
                # Skip if source is empty
                continue

        # Create ONE outgoing transaction
        t_out = schemas.TransactionCreate(
            account_id=source_acc.id,
            amount=-transfer_amount, 
            merchant=f"Transfer to {data['target_account_name']}",
            category="Internal Transfer",
            type="debit",
            timestamp=datetime.now()
        )
        crud.create_transaction(db, t_out)
        
        # Create ONE incoming transaction
        t_in = schemas.TransactionCreate(
            account_id=target_account_id,
            amount=transfer_amount,
            merchant=f"Transfer from {source_acc.name}",
            category="Internal Transfer",
            type="credit",
            timestamp=datetime.now()
        )
        tx_in = crud.create_transaction(db, t_in)
        
        # Create ONE PayrollTransfer record per target account
        items_summary = ", ".join(data['items'][:3])
        if len(data['items']) > 3:
            items_summary += f" +{len(data['items']) - 3} more"
            
        payroll_transfer = schemas.PayrollTransferCreate(
            source_account_id=source_acc.id,
            target_account_id=target_account_id,
            amount=transfer_amount,
            billing_month=billing_month,
            note=f"Payday Distributor: {items_summary}",
            transaction_id=tx_in.id
        )
        crud.create_payroll_transfer(db, payroll_transfer)
        
        # Update source balance for next iteration
        source_acc.current_balance -= transfer_amount
        
        # Track execution details
        executed_transfers.append({
            "target": data['target_account_name'],
            "requested": requested_amount,
            "transferred": transfer_amount,
            "shortage": shortage
        })
        
    return {
        "status": "success", 
        "transfers_count": len(executed_transfers),
        "details": executed_transfers
    }

# --- Category Endpoints ---

@app.post("/categories", response_model=schemas.Category)
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):
    return crud.create_category(db, category)

@app.get("/categories", response_model=List[schemas.Category])
def get_categories(db: Session = Depends(get_db)):
    return crud.get_categories(db)

@app.put("/categories/{category_id}", response_model=schemas.Category)
def update_category(category_id: str, payload: schemas.CategoryUpdate, db: Session = Depends(get_db)):
    updated = crud.update_category(db, category_id, payload)
    if not updated:
         raise HTTPException(status_code=404, detail="Category not found")
    return updated

@app.delete("/categories/{category_id}")
def delete_category(category_id: str, db: Session = Depends(get_db)):
    success = crud.delete_category(db, category_id)
    if not success:
         raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}


# --- Audit Endpoints ---

@app.post("/audit/check", response_model=schemas.AuditCheckResponse)
def check_audit(request: schemas.AuditCheckRequest, db: Session = Depends(get_db)):
    """Check system balance against actual balance and return discrepancy with transaction history."""
    result = crud.check_audit(db, request.account_id, request.actual_balance)
    if result is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return result

@app.post("/audit/confirm", response_model=schemas.Audit)
def confirm_audit(request: schemas.AuditConfirmRequest, db: Session = Depends(get_db)):
    """Confirm an audit (create audit record). For mismatches, requires force_confirm=True and notes."""
    # Validate: if mismatch and force_confirm, notes are required
    check_result = crud.check_audit(db, request.account_id, request.actual_balance)
    if check_result is None:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if not check_result["is_match"] and request.force_confirm and not request.notes:
        raise HTTPException(status_code=400, detail="Notes are required when force confirming a mismatch")
    
    if not check_result["is_match"] and not request.force_confirm:
        raise HTTPException(status_code=400, detail="Cannot confirm mismatch. Set force_confirm=True and provide notes to proceed.")
    
    result = crud.create_audit(
        db, 
        request.account_id, 
        request.actual_balance, 
        request.notes, 
        request.force_confirm
    )
    
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result

@app.get("/audit/history/{account_id}", response_model=List[schemas.Audit])
def get_audit_history(account_id: str, limit: int = 20, db: Session = Depends(get_db)):
    """Get audit history for an account."""
    return crud.get_audit_history(db, account_id, limit)


# --- Payroll Transfer Endpoints ---

@app.post("/payroll-transfers", response_model=schemas.PayrollTransfer)
def create_payroll_transfer(transfer: schemas.PayrollTransferCreate, db: Session = Depends(get_db)):
    """Create a payroll transfer record."""
    db_transfer = crud.create_payroll_transfer(db, transfer)
    
    # Enrich with account names
    source = crud.get_account(db, db_transfer.source_account_id)
    target = crud.get_account(db, db_transfer.target_account_id)
    
    return {
        **db_transfer.__dict__,
        "source_account_name": source.name if source else None,
        "target_account_name": target.name if target else None,
        "linked_transaction": None
    }

@app.get("/payroll-transfers", response_model=List[schemas.PayrollTransfer])
def get_payroll_transfers(
    billing_month: str = None,
    source_account_id: str = None,
    db: Session = Depends(get_db)
):
    """Get payroll transfers, optionally filtered by month or source account."""
    transfers = crud.get_payroll_transfers(db, billing_month, source_account_id)
    
    # Enrich with account names and linked transactions
    result = []
    for t in transfers:
        source = crud.get_account(db, t.source_account_id)
        target = crud.get_account(db, t.target_account_id)
        linked_tx = None
        if t.transaction_id:
            linked_tx = crud.get_transaction(db, t.transaction_id)
        
        result.append({
            **t.__dict__,
            "source_account_name": source.name if source else None,
            "target_account_name": target.name if target else None,
            "linked_transaction": linked_tx
        })
    
    return result

@app.get("/payroll-transfers/{transfer_id}", response_model=schemas.PayrollTransfer)
def get_payroll_transfer(transfer_id: str, db: Session = Depends(get_db)):
    """Get a single payroll transfer by ID."""
    t = crud.get_payroll_transfer(db, transfer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Payroll transfer not found")
    
    source = crud.get_account(db, t.source_account_id)
    target = crud.get_account(db, t.target_account_id)
    linked_tx = crud.get_transaction(db, t.transaction_id) if t.transaction_id else None
    
    return {
        **t.__dict__,
        "source_account_name": source.name if source else None,
        "target_account_name": target.name if target else None,
        "linked_transaction": linked_tx
    }

@app.get("/payroll-transfers/{transfer_id}/matches", response_model=List[schemas.Transaction])
def get_payroll_transfer_matches(transfer_id: str, db: Session = Depends(get_db)):
    """Find matching transactions for a payroll transfer."""
    matches = crud.get_payroll_transfer_matches(db, transfer_id)
    return matches

@app.post("/payroll-transfers/{transfer_id}/link")
def link_payroll_transfer(transfer_id: str, transaction_id: str, db: Session = Depends(get_db)):
    """Link a payroll transfer to a transaction."""
    result = crud.link_payroll_transfer_to_transaction(db, transfer_id, transaction_id)
    if not result:
        raise HTTPException(status_code=404, detail="Payroll transfer not found")
    return {"status": "linked", "transfer_id": transfer_id, "transaction_id": transaction_id}

@app.put("/payroll-transfers/{transfer_id}", response_model=schemas.PayrollTransfer)
def update_payroll_transfer(transfer_id: str, update: schemas.PayrollTransferUpdate, db: Session = Depends(get_db)):
    """Update a payroll transfer."""
    result = crud.update_payroll_transfer(db, transfer_id, update)
    if not result:
        raise HTTPException(status_code=404, detail="Payroll transfer not found")
    
    source = crud.get_account(db, result.source_account_id)
    target = crud.get_account(db, result.target_account_id)
    
    return {
        **result.__dict__,
        "source_account_name": source.name if source else None,
        "target_account_name": target.name if target else None,
        "linked_transaction": None
    }

@app.delete("/payroll-transfers/{transfer_id}")
def delete_payroll_transfer(transfer_id: str, db: Session = Depends(get_db)):
    """Delete a payroll transfer."""
    success = crud.delete_payroll_transfer(db, transfer_id)
    if not success:
        raise HTTPException(status_code=404, detail="Payroll transfer not found")
    return {"status": "deleted"}
