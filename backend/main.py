from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from typing import List
from datetime import datetime

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
        
        if 'notes' not in columns:
            print("Migrating: Adding notes to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN notes TEXT"))
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

    # 2. Parse (Regex)
    parsed_data = parser.parse(body)
    
    if not parsed_data:
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = "No pattern matched"
        db.commit()
        return {"status": "ignored", "reason": "No pattern matched"}
    
    last_4 = parsed_data["last_4"]
    amount = parsed_data["amount"]
    merchant = parsed_data["merchant"]

    # 3. Find Account
    account = crud.get_account_by_last_4(db, last_4=last_4)
    if not account:
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"Account with last 4 digits {last_4} not found"
        db.commit()
        return {
            "status": "warning", 
            "reason": f"Account with last 4 digits {last_4} not found",
            "parsed": parsed_data
        }

    # 4. Create Transaction
    transaction_data = schemas.TransactionCreate(
        account_id=account.id,
        amount=amount,
        merchant=merchant,
        raw_sms_content=body
    )
    # Use parsed timestamp if available
    if parsed_data.get("timestamp"):
        transaction_data.timestamp = parsed_data["timestamp"]
    else:
        transaction_data.timestamp = datetime.now()

    crud.create_transaction(db, transaction_data)

    # 5. Update Status
    raw_msg.status = models.MessageStatus.PARSED
    db.commit()

    return {
        "status": "success",
        "message": f"Logged {amount} at {merchant} for account {account.name}"
    }

    return {
        "status": "success",
        "message": f"Logged {amount} at {merchant} for account {account.name}"
    }

# --- SMS Inbox Endpoints ---
@app.get("/messages/", response_model=List[schemas.RawMessage])
def read_messages(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.RawMessage).order_by(models.RawMessage.timestamp.desc()).offset(skip).limit(limit).all()

@app.post("/messages/{message_id}/retry")
def retry_message(message_id: str, db: Session = Depends(get_db)):
    # Fetch Message
    msg = db.query(models.RawMessage).filter(models.RawMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Re-run logic (Duplicate of receive_sms almost, should refactor)
    # Refactor: Encapsulate parse-and-log logic?
    # For now, inline for speed.
    
    parsed_data = parser.parse(msg.body)
    if not parsed_data:
        msg.status = models.MessageStatus.FAILED
        msg.error_log = "Retry: No pattern matched"
        db.commit()
        return {"status": "failed", "reason": "No pattern matched"}

    last_4 = parsed_data["last_4"]
    account = crud.get_account_by_last_4(db, last_4=last_4)
    if not account:
        msg.status = models.MessageStatus.FAILED
        msg.error_log = f"Retry: Account {last_4} not found"
        db.commit()
        return {"status": "warning", "reason": "Account not found"}

    # Success
    transaction_data = schemas.TransactionCreate(
        account_id=account.id,
        amount=parsed_data["amount"],
        merchant=parsed_data["merchant"],
        raw_sms_content=msg.body
    )
    # Use parsed timestamp if available
    if parsed_data.get("timestamp"):
        transaction_data.timestamp = parsed_data["timestamp"]

    crud.create_transaction(db, transaction_data)
    
    msg.status = models.MessageStatus.PARSED
    msg.error_log = None
    db.commit()
    
    return {"status": "success", "message": "Message parsed and logged successfully"}

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

    executed_transfers = []
    
    for item in preview.allocations:
        if item.amount <= 0:
            continue
            
        # Filter if specific target requested
        if req.target_account_id and item.target_account_id != req.target_account_id:
            continue

        # Check for sufficient funds
        # Use override amount if provided for this specific target
        requested_amount = item.amount
        if req.override_amount is not None and req.target_account_id:
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

        t_out = schemas.TransactionCreate(
            account_id=source_acc.id,
            amount=-transfer_amount, 
            merchant=f"Transfer to {item.target_account_name}",
            category="Transfer",
            timestamp=datetime.now()
        )
        crud.create_transaction(db, t_out)
        
        t_in = schemas.TransactionCreate(
            account_id=item.target_account_id,
            amount=transfer_amount,
            merchant=f"Transfer from {source_acc.name}",
            category="Transfer",
            timestamp=datetime.now()
        )
        crud.create_transaction(db, t_in)
        
        # Track execution details
        executed_transfers.append({
            "target": item.target_account_name,
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
    updated = crud.update_category_name(db, category_id, payload.name)
    if not updated:
         raise HTTPException(status_code=404, detail="Category not found")
    return updated

@app.delete("/categories/{category_id}")
def delete_category(category_id: str, db: Session = Depends(get_db)):
    success = crud.delete_category(db, category_id)
    if not success:
         raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}
