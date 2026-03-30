from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect, func
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
import queue_processor
from rate_limiter import RateLimitMiddleware
from webhook import router as webhook_router

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

# Rate limiting middleware (must be added after CORS)
app.add_middleware(RateLimitMiddleware)

# Include webhook router for Cloudflare Tunnel SMS integration
app.include_router(webhook_router)

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

def _recalculate_account_balance(db: Session, account_id: str):
    """
    Internal helper: recalculate account balance from first transaction baseline.
    Returns dict with old/new balance info, or None if account not found.
    """
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        return None
    
    old_balance = account.current_balance
    
    transactions = db.query(models.Transaction).filter(
        models.Transaction.account_id == account_id
    ).order_by(models.Transaction.timestamp.asc()).all()
    
    if not transactions:
        return {"old_balance": old_balance, "new_balance": old_balance, "transaction_count": 0}
    
    first_tx = transactions[0]
    baseline = first_tx.balance_after_transaction
    
    if baseline is not None:
        if first_tx.type == "credit":
            running = baseline - first_tx.amount
        else:
            running = baseline + first_tx.amount
        if first_tx.fees:
            running += first_tx.fees
        
        for tx in transactions:
            if tx.type == "credit":
                running += tx.amount
            else:
                running -= tx.amount
            if tx.fees:
                running -= tx.fees
            tx.balance_after_transaction = round(running, 2)
    else:
        running = 0
        for tx in transactions:
            if tx.type == "credit":
                running += tx.amount
            else:
                running -= tx.amount
            if tx.fees:
                running -= tx.fees
            tx.balance_after_transaction = round(running, 2)
    
    account.current_balance = round(running, 2)
    db.commit()
    
    return {
        "old_balance": round(old_balance, 2),
        "new_balance": account.current_balance,
        "baseline": baseline,
        "baseline_tx": first_tx.merchant or "Unknown",
        "baseline_date": first_tx.timestamp.isoformat(),
        "transaction_count": len(transactions)
    }


@app.post("/accounts/{account_id}/recalculate-balance")
def recalculate_account_balance(account_id: str, db: Session = Depends(get_db)):
    """Recalculate account balance using the first transaction as baseline, then replaying forward."""
    result = _recalculate_account_balance(db, account_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Account not found")
    result["message"] = "Balance recalculated from first transaction baseline"
    result["account_id"] = account_id
    return result

@app.post("/accounts/recalculate-all-balances")
def recalculate_all_account_balances(db: Session = Depends(get_db)):
    """Recalculate all account balances from transaction history"""
    accounts = db.query(models.Account).all()
    results = []
    
    for account in accounts:
        latest_tx = db.query(models.Transaction).filter(
            models.Transaction.account_id == account.id,
            models.Transaction.balance_after_transaction.isnot(None)
        ).order_by(models.Transaction.timestamp.desc()).first()
        
        old_balance = account.current_balance
        
        if latest_tx and latest_tx.balance_after_transaction is not None:
            account.current_balance = latest_tx.balance_after_transaction
        
        results.append({
            "account": account.name,
            "old_balance": old_balance,
            "new_balance": account.current_balance,
            "changed": old_balance != account.current_balance
        })
    
    db.commit()
    
    return {
        "message": "All balances recalculated",
        "results": results,
        "total_changed": sum(1 for r in results if r["changed"])
    }

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

@app.get("/obligations/monthly-status")
def get_obligations_monthly_status(month_offset: int = 0, db: Session = Depends(get_db)):
    """
    Get payment status for all obligations for a given month.
    Returns paid/unpaid/overdue counts and per-obligation status.
    """
    from datetime import datetime
    now = datetime.now()
    target_date = datetime(now.year, now.month + month_offset, 1) if now.month + month_offset > 0 else datetime(now.year - 1, 12 + now.month + month_offset, 1)
    # Properly handle month overflow
    year = now.year + ((now.month - 1 + month_offset) // 12)
    month = ((now.month - 1 + month_offset) % 12) + 1
    target_date = datetime(year, month, 1)

    month_str = f"{year}-{str(month).zfill(2)}"
    month_label = target_date.strftime("%B %Y")

    obligations = db.query(models.MonthlyObligation).order_by(models.MonthlyObligation.display_order).all()

    # Get all payments for this month in one query
    all_payments = db.query(models.Payment).filter(
        models.Payment.billing_month == month_str
    ).all()
    payments_by_obl = {}
    for p in all_payments:
        payments_by_obl[p.obligation_id] = p

    result_obligations = []
    paid_count = 0
    unpaid_count = 0
    overdue_count = 0
    total_expected = 0.0
    total_paid = 0.0

    for obl in obligations:
        expected = obl.amount or 0.0
        total_expected += expected

        payment = payments_by_obl.get(obl.id)

        if payment and payment.status in (models.PaymentStatus.PAID, "PAID"):
            status = "PAID"
            paid_count += 1
            total_paid += payment.amount or 0.0
        elif payment and payment.status in (models.PaymentStatus.BUDGET, "BUDGET"):
            status = "BUDGET"
            unpaid_count += 1
        else:
            # Check if overdue: due_day has passed in current/past month
            is_past_month = (year < now.year) or (year == now.year and month < now.month)
            is_overdue = is_past_month or (year == now.year and month == now.month and (obl.due_day or 1) < now.day)
            status = "OVERDUE" if is_overdue else "UNPAID"
            if is_overdue:
                overdue_count += 1
            unpaid_count += 1

        result_obligations.append({
            "id": obl.id,
            "name": obl.name,
            "category": obl.category,
            "provider": obl.provider,
            "expected_amount": expected,
            "due_day": obl.due_day,
            "status": status,
            "is_overdue": status == "OVERDUE",
            "payment": {
                "id": payment.id,
                "amount": payment.amount,
                "status": payment.status.value if hasattr(payment.status, 'value') else payment.status,
                "billing_month": payment.billing_month,
                "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
                "note": payment.note,
            } if payment else None,
        })

    return {
        "month": month_str,
        "month_label": month_label,
        "total_obligations": len(obligations),
        "paid_count": paid_count,
        "unpaid_count": unpaid_count,
        "overdue_count": overdue_count,
        "total_expected": round(total_expected, 2),
        "total_paid": round(total_paid, 2),
        "remaining": round(total_expected - total_paid, 2),
        "obligations": result_obligations,
    }


@app.get("/obligations/forecast")
def get_obligations_forecast(months_ahead: int = 1, db: Session = Depends(get_db)):
    """
    Forecast next month's expected expenses based on payment history.
    Uses up to 6 months of payment history per obligation for trend analysis.
    """
    from datetime import datetime
    now = datetime.now()

    # Target forecast month
    year = now.year + ((now.month - 1 + months_ahead) // 12)
    month = ((now.month - 1 + months_ahead) % 12) + 1
    forecast_month = f"{year}-{str(month).zfill(2)}"
    forecast_label = datetime(year, month, 1).strftime("%B %Y")

    obligations = db.query(models.MonthlyObligation).order_by(models.MonthlyObligation.display_order).all()

    # Get last 6 months of payments using LIKE to match both YYYY-MM and YYYY-MM-DD formats
    history_months = []
    for i in range(1, 7):  # 1 to 6 months back
        hy = now.year + ((now.month - 1 - i) // 12)
        hm = ((now.month - 1 - i) % 12) + 1
        history_months.append(f"{hy}-{str(hm).zfill(2)}")

    from sqlalchemy import or_
    month_filters = [models.Payment.billing_month.like(f"{m}%") for m in history_months]
    all_history = db.query(models.Payment).filter(
        or_(*month_filters),
        models.Payment.status.in_([models.PaymentStatus.PAID, "PAID"])
    ).all()

    # Group by obligation_id
    history_by_obl = {}
    for p in all_history:
        history_by_obl.setdefault(p.obligation_id, []).append(p)

    result_obligations = []
    total_forecast = 0.0
    by_category = {}

    for obl in obligations:
        payments = history_by_obl.get(obl.id, [])
        # Sort by billing_month descending to get most recent first
        sorted_payments = sorted(payments, key=lambda p: p.billing_month or "", reverse=True)
        amounts = [p.amount for p in sorted_payments if p.amount]

        if len(amounts) >= 1:
            last_paid = amounts[0]  # Most recent payment
            avg = sum(amounts) / len(amounts)

            # Forecast = last paid amount (user requirement)
            forecast_amount = round(last_paid, 2)

            if len(amounts) >= 3:
                # Trend: compare first half avg vs second half avg (chronological order)
                chrono_amounts = list(reversed(amounts))
                mid = len(chrono_amounts) // 2
                first_half = sum(chrono_amounts[:mid]) / max(mid, 1)
                second_half = sum(chrono_amounts[mid:]) / max(len(chrono_amounts) - mid, 1)
                pct_change = ((second_half - first_half) / first_half * 100) if first_half > 0 else 0

                if pct_change > 5:
                    trend = "increasing"
                elif pct_change < -5:
                    trend = "decreasing"
                else:
                    trend = "stable"

                # Confidence based on variance
                variance = sum((a - avg) ** 2 for a in amounts) / len(amounts)
                std_dev = variance ** 0.5
                cv = (std_dev / avg * 100) if avg > 0 else 100

                if cv <= 5:
                    confidence = "high"
                elif cv <= 20:
                    confidence = "medium"
                else:
                    confidence = "low"
            else:
                trend = "stable"
                confidence = "low"
        else:
            # No history — use obligation.amount as fallback
            forecast_amount = round(obl.amount or 0, 2)
            avg = forecast_amount
            last_paid = None
            trend = "stable"
            confidence = "low" if obl.amount else "none"

        total_forecast += forecast_amount

        cat = obl.category or "Uncategorized"
        if cat not in by_category:
            by_category[cat] = {"total": 0, "count": 0}
        by_category[cat]["total"] = round(by_category[cat]["total"] + forecast_amount, 2)
        by_category[cat]["count"] += 1

        result_obligations.append({
            "id": obl.id,
            "name": obl.name,
            "category": cat,
            "provider": obl.provider,
            "forecast_amount": forecast_amount,
            "confidence": confidence,
            "avg_recent": round(avg, 2),
            "last_paid": round(last_paid, 2) if last_paid else None,
            "trend": trend,
            "data_points": len(amounts),
        })

    return {
        "forecast_month": forecast_month,
        "forecast_label": forecast_label,
        "total_forecast": round(total_forecast, 2),
        "by_category": by_category,
        "obligations": result_obligations,
    }


@app.get("/obligations/all-matches")
def get_all_obligation_matches(db: Session = Depends(get_db)):
    """
    Find transaction matches for ALL unpaid obligations in the current month.
    Returns a dict keyed by obligation_id with match arrays.
    """
    from datetime import datetime
    now = datetime.now()
    month_str = f"{now.year}-{str(now.month).zfill(2)}"

    obligations = db.query(models.MonthlyObligation).all()

    # Get payments for current month to identify unpaid ones
    current_payments = db.query(models.Payment).filter(
        models.Payment.billing_month == month_str,
        models.Payment.status.in_([models.PaymentStatus.PAID, "PAID"])
    ).all()
    paid_obl_ids = {p.obligation_id for p in current_payments}

    # Get all linked transaction IDs to exclude
    linked_tx_ids = set(
        tid for (tid,) in db.query(models.Payment.transaction_id).filter(
            models.Payment.transaction_id.isnot(None)
        ).all()
    )
    # Also exclude junction-table linked txs
    linked_junction_ids = set(
        tid for (tid,) in db.query(models.PaymentTransaction.transaction_id).all()
    )
    all_excluded = linked_tx_ids | linked_junction_ids

    # Get candidate transactions (debit, this month)
    search_start = datetime(now.year, now.month, 1)
    candidates = db.query(models.Transaction).filter(
        models.Transaction.timestamp >= search_start,
        models.Transaction.type == 'debit'
    ).all()

    results = {}

    for obl in obligations:
        if obl.id in paid_obl_ids:
            continue  # Skip paid obligations

        keyword = obl.name.split(" ")[0].lower()
        provider_lower = (obl.provider or "").lower()
        note_keywords = [w.lower() for w in (obl.notes or "").split() if len(w) > 2]

        matches = []
        for tx in candidates:
            if tx.id in all_excluded:
                continue

            score = 0
            reasons = []
            merchant_lower = (tx.merchant or "").lower()
            notes_lower = (tx.notes or "").lower()

            # Name/keyword match
            if keyword in merchant_lower or keyword in notes_lower:
                score += 50
                reasons.append("name_match")

            # Provider match
            if provider_lower and len(provider_lower) > 2:
                if provider_lower in merchant_lower or provider_lower in notes_lower:
                    score += 40
                    reasons.append("provider_match")

            # Biller reference match
            if tx.biller_id:
                biller = tx.biller_ref
                if biller:
                    biller_name = (biller.display_name or biller.name or "").lower()
                    if keyword in biller_name or (provider_lower and provider_lower in biller_name):
                        score += 45
                        reasons.append("biller_match")

            # Notes/alias match
            for k in note_keywords:
                if k in merchant_lower or k in notes_lower:
                    score += 50
                    reasons.append("notes_match")
                    break

            # Amount match
            if obl.amount and tx.amount:
                diff = abs(tx.amount - obl.amount)
                if obl.amount > 0 and diff / obl.amount <= 0.1:
                    score += 40
                    reasons.append("amount_match")
                    if diff == 0:
                        score += 20
                        reasons.append("exact_amount")

            # Category match
            if obl.category and tx.category and obl.category.lower() == tx.category.lower():
                score += 20
                reasons.append("category_match")

            # Due date proximity
            if tx.timestamp and obl.due_day:
                days_diff = abs(tx.timestamp.day - obl.due_day)
                if days_diff <= 3:
                    score += 15
                    reasons.append("due_date_proximity")

            if score >= 40:
                matches.append({
                    "transaction_id": tx.id,
                    "merchant": tx.merchant,
                    "amount": tx.amount,
                    "date": tx.timestamp.isoformat() if tx.timestamp else None,
                    "score": score,
                    "reasons": reasons,
                })

        if matches:
            matches.sort(key=lambda x: x["score"], reverse=True)
            results[obl.id] = matches[:3]  # Top 3 per obligation

    return results


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
        merchant_lower = (tx.merchant or "").lower()
        notes_lower = (tx.notes or "").lower()
        
        # A. Name/Keyword Match
        if keyword in merchant_lower or keyword in notes_lower:
            match_score += 50
        
        # B. Provider Match (NEW)
        provider_lower = (obligation.provider or "").lower()
        if provider_lower and len(provider_lower) > 2:
            if provider_lower in merchant_lower or provider_lower in notes_lower:
                match_score += 40

        # C. Biller Reference Match (NEW)
        if tx.biller_id and tx.biller_ref:
            biller_name = (tx.biller_ref.display_name or tx.biller_ref.name or "").lower()
            if keyword in biller_name or (provider_lower and provider_lower in biller_name):
                match_score += 45

        # D. Notes/Alias Match
        if obligation.notes:
            note_keywords = [w.lower() for w in obligation.notes.split() if len(w) > 2]
            for k in note_keywords:
                if k in merchant_lower or k in notes_lower:
                    match_score += 50
                    break
            
        # E. Amount Match (if Obligation has amount)
        if obligation.amount and tx.amount:
            diff = abs(tx.amount - obligation.amount)
            if obligation.amount > 0 and diff / obligation.amount <= 0.1:
                match_score += 40
            if diff == 0:
                match_score += 20
        
        # F. Category Match
        if obligation.category and tx.category and obligation.category.lower() == tx.category.lower():
            match_score += 20

        # G. Due Date Proximity (NEW)
        if tx.timestamp and obligation.due_day:
            days_diff = abs(tx.timestamp.day - obligation.due_day)
            if days_diff <= 3:
                match_score += 15
            
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

@app.get("/obligations/{obligation_id}/payments")
def read_obligation_payments(obligation_id: str, db: Session = Depends(get_db)):
    payments = crud.get_payments(db, obligation_id)
    result = []
    for p in payments:
        # Get linked transactions from junction table
        linked_txs = []
        if p.linked_transactions:
            for link in p.linked_transactions:
                tx = link.transaction
                if tx:
                    linked_txs.append({
                        "id": tx.id,
                        "merchant": tx.merchant,
                        "amount": tx.amount,
                        "type": tx.type,
                        "category": tx.category,
                        "timestamp": tx.timestamp.isoformat() if tx.timestamp else None,
                        "account_id": tx.account_id,
                    })
        
        payment_dict = {
            "id": p.id,
            "obligation_id": p.obligation_id,
            "amount": p.amount,
            "payment_date": p.payment_date,
            "billing_month": p.billing_month,
            "note": p.note,
            "status": p.status,
            "transaction_id": p.transaction_id,
            "linked_transaction": None,
            "linked_transactions": linked_txs,
            "linked_transactions_count": len(linked_txs)
        }
        # Legacy single-link support
        if p.transaction_id:
            tx = crud.get_transaction(db, p.transaction_id)
            if tx:
                payment_dict["linked_transaction"] = {
                    "id": tx.id,
                    "merchant": tx.merchant,
                    "amount": tx.amount,
                    "type": tx.type,
                    "category": tx.category,
                    "timestamp": tx.timestamp.isoformat() if tx.timestamp else None,
                    "account_id": tx.account_id,
                    "account_name": crud.get_account(db, tx.account_id).name if tx.account_id else None,
                    "notes": tx.notes
                }
        result.append(payment_dict)
    return result

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
    
    # Parse billing month (YYYY-MM or YYYY-MM-DD format)
    from datetime import datetime, timedelta
    try:
        bm = payment.billing_month or ""
        # Handle both YYYY-MM and YYYY-MM-DD formats
        if len(bm) == 7:  # YYYY-MM
            billing_date = datetime.strptime(bm + "-01", "%Y-%m-%d")
        elif len(bm) >= 10:  # YYYY-MM-DD
            billing_date = datetime.strptime(bm[:10], "%Y-%m-%d")
        else:
            return []
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
    
    # Search window: ±15 days around due date
    start_date = target_date - timedelta(days=15)
    end_date = target_date + timedelta(days=15)
    
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
                "already_linked": tx.id == payment.transaction_id,
                "raw_sms_content": tx.raw_sms_content
            })
    
    # Sort by score descending
    suggestions.sort(key=lambda x: x["score"], reverse=True)
    
    return suggestions[:10]  # Return top 10 suggestions

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
@app.get("/transactions/")
def read_transactions(skip: int = 0, limit: int = 1000, db: Session = Depends(get_db)):
    txs = crud.get_transactions(db, skip=skip, limit=limit)
    result = []
    for tx in txs:
        tx_dict = {c.name: getattr(tx, c.name) for c in tx.__table__.columns}
        # Add counterparty display info
        if tx.merchant_ref:
            tx_dict["merchant_info"] = {"id": tx.merchant_ref.id, "name": tx.merchant_ref.display_name or tx.merchant_ref.name, "logo_url": tx.merchant_ref.logo_url, "type": "merchant"}
        if tx.beneficiary_ref:
            tx_dict["beneficiary_info"] = {"id": tx.beneficiary_ref.id, "name": tx.beneficiary_ref.display_name or tx.beneficiary_ref.name, "bank_name": tx.beneficiary_ref.bank_name, "type": "beneficiary"}
        if tx.biller_ref:
            tx_dict["biller_info"] = {"id": tx.biller_ref.id, "name": tx.biller_ref.display_name or tx.biller_ref.name, "type": "biller"}
        result.append(tx_dict)
    return result

# --- Counterparty Endpoints ---
@app.get("/merchants/")
def list_merchants(db: Session = Depends(get_db)):
    merchants = crud.get_merchants(db)
    from sqlalchemy import func as sqla_func
    counts = dict(
        db.query(models.Transaction.merchant_id, sqla_func.count(models.Transaction.id))
        .filter(models.Transaction.merchant_id.isnot(None))
        .group_by(models.Transaction.merchant_id)
        .all()
    )
    results = []
    for m in merchants:
        d = {
            "id": m.id,
            "name": m.name,
            "display_name": m.display_name,
            "category": m.category,
            "logo_url": m.logo_url,
            "brand_domain": m.brand_domain,
            "aliases": m.aliases or [],
            "notes": m.notes,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "transaction_count": counts.get(m.id, 0)
        }
        results.append(d)
    return results

@app.get("/merchants/{merchant_id}")
def get_merchant(merchant_id: str, db: Session = Depends(get_db)):
    m = db.query(models.Merchant).filter(models.Merchant.id == merchant_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return m

@app.put("/merchants/{merchant_id}")
def update_merchant(merchant_id: str, data: dict, db: Session = Depends(get_db)):
    m = db.query(models.Merchant).filter(models.Merchant.id == merchant_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Merchant not found")
    for field in ['name', 'display_name', 'logo_url', 'category', 'notes', 'aliases', 'brand_domain']:
        if field in data:
            setattr(m, field, data[field])
    db.commit()
    db.refresh(m)
    return m

@app.delete("/merchants/{merchant_id}")
def delete_merchant(merchant_id: str, db: Session = Depends(get_db)):
    m = db.query(models.Merchant).filter(models.Merchant.id == merchant_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Merchant not found")
    db.delete(m)
    db.commit()
    return {"status": "deleted"}

@app.post("/merchants/backfill")
def backfill_merchants(db: Session = Depends(get_db)):
    """Resolve missing brand data AND merge duplicate merchants (same display_name)."""
    merchants = db.query(models.Merchant).all()
    
    # --- Pass 1: Resolve missing brand data ---
    updated = []
    for m in merchants:
        if not m.display_name or not m.logo_url:
            brand, domain, logo, cat = crud._resolve_from_known_merchants(m.name)
            if brand:
                changed = False
                if not m.display_name:
                    m.display_name = brand
                    changed = True
                if not m.logo_url and logo:
                    m.logo_url = logo
                    changed = True
                if not m.category and cat:
                    m.category = cat
                    changed = True
                if changed:
                    updated.append({"name": m.name, "display_name": m.display_name})
    db.flush()
    
    # --- Pass 2: Merge duplicates with same display_name ---
    merchants = db.query(models.Merchant).all()  # Re-fetch after updates
    by_display = {}
    for m in merchants:
        key = (m.display_name or "").lower().strip()
        if key:
            by_display.setdefault(key, []).append(m)
    
    merged = []
    for key, group in by_display.items():
        if len(group) < 2:
            continue
        # Keep the oldest record as canonical
        group.sort(key=lambda m: m.created_at)
        canonical = group[0]
        
        # Ensure canonical has best data
        for dup in group[1:]:
            if dup.logo_url and not canonical.logo_url:
                canonical.logo_url = dup.logo_url
            if dup.category and not canonical.category:
                canonical.category = dup.category
        
        # Reassign all transactions from duplicates to canonical
        for dup in group[1:]:
            tx_count = db.query(models.Transaction).filter(
                models.Transaction.merchant_id == dup.id
            ).update({models.Transaction.merchant_id: canonical.id})
            merged.append({
                "removed": dup.name,
                "kept": canonical.name,
                "display_name": canonical.display_name,
                "transactions_moved": tx_count
            })
            db.delete(dup)
    
    db.commit()
    return {
        "resolved": len(updated),
        "merged": len(merged),
        "details": {"resolved": updated, "merged": merged}
    }

@app.get("/beneficiaries/")
def list_beneficiaries(db: Session = Depends(get_db)):
    return crud.get_beneficiaries(db)

@app.get("/billers/")
def list_billers(db: Session = Depends(get_db)):
    return crud.get_billers(db)

@app.put("/transactions/{transaction_id}", response_model=schemas.Transaction)
def update_transaction(transaction_id: str, transaction_update: schemas.TransactionUpdate, db: Session = Depends(get_db)):
    updated_tx = crud.update_transaction(db, transaction_id, transaction_update)
    if not updated_tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return updated_tx

@app.post("/transactions/", response_model=schemas.Transaction)
def create_transaction(transaction: schemas.TransactionCreate, db: Session = Depends(get_db)):
    # Verify account or credit card exists
    if transaction.account_id:
        account = db.query(models.Account).filter(models.Account.id == transaction.account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
    elif transaction.credit_card_id:
        cc = db.query(models.CreditCard).filter(models.CreditCard.id == transaction.credit_card_id).first()
        if not cc:
            raise HTTPException(status_code=404, detail="Credit card not found")
    else:
        raise HTTPException(status_code=400, detail="Either account_id or credit_card_id is required")
    return crud.create_transaction(db=db, transaction=transaction)

@app.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: str, db: Session = Depends(get_db)):
    deleted = crud.delete_transaction(db, transaction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted"}

@app.put("/transactions/{transaction_id}/resolve-discrepancy")
def resolve_discrepancy(transaction_id: str, body: dict, db: Session = Depends(get_db)):
    """Resolve a balance discrepancy on a CC transaction."""
    import json as _json
    from datetime import datetime as _dt
    
    tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if not tx.parsed_data:
        raise HTTPException(status_code=400, detail="No parsed data on transaction")
    
    parsed = _json.loads(tx.parsed_data) if isinstance(tx.parsed_data, str) else tx.parsed_data
    discrepancy = parsed.get('balance_discrepancy')
    if not discrepancy:
        raise HTTPException(status_code=400, detail="No discrepancy to resolve")
    
    reason = body.get('reason', '')
    
    # Move discrepancy → discrepancy_resolved
    parsed['discrepancy_resolved'] = {
        'amount': discrepancy.get('difference', 0),
        'reason': reason,
        'resolved_at': _dt.utcnow().isoformat(),
        'original_db_balance': discrepancy.get('db_balance'),
        'adopted_sms_balance': discrepancy.get('sms_balance'),
    }
    del parsed['balance_discrepancy']
    
    # Adopt SMS balance on the credit card and cascade
    if tx.credit_card_id:
        cc = db.query(models.CreditCard).filter(models.CreditCard.id == tx.credit_card_id).first()
        if cc:
            sms_balance = discrepancy.get('sms_balance')
            if sms_balance is not None:
                tx.balance_after_transaction = round(sms_balance, 2)
                db.add(cc)
    
    tx.parsed_data = _json.dumps(parsed)
    db.add(tx)
    db.commit()
    
    # Cascade: recalculate all subsequent CC transactions from this new anchor
    if tx.credit_card_id:
        # Get all CC transactions after this one and recalculate
        cc = db.query(models.CreditCard).filter(models.CreditCard.id == tx.credit_card_id).first()
        if cc:
            cc_txs = db.query(models.Transaction).filter(
                models.Transaction.credit_card_id == tx.credit_card_id,
                models.Transaction.status == "completed"
            ).order_by(models.Transaction.timestamp.asc()).all()
            
            tx_index = next((i for i, t in enumerate(cc_txs) if t.id == tx.id), None)
            if tx_index is not None:
                running_balance = tx.balance_after_transaction
                for subsequent_tx in cc_txs[tx_index + 1:]:
                    tx_type = str(subsequent_tx.type).lower() if subsequent_tx.type else 'debit'
                    if tx_type == 'credit':
                        running_balance += (subsequent_tx.amount or 0)
                    else:
                        running_balance -= (subsequent_tx.amount or 0)
                    if subsequent_tx.fees:
                        running_balance -= subsequent_tx.fees
                    subsequent_tx.balance_after_transaction = running_balance
                    db.add(subsequent_tx)
                
                cc.current_balance = running_balance
                db.add(cc)
                db.commit()
    
    return {"message": "Discrepancy resolved", "resolved": parsed['discrepancy_resolved']}

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
    
    # Handle "external" source - just complete the credit without creating debit
    if source_account_id == "external":
        pending_tx.status = "completed"
        pending_tx.merchant = pending_tx.merchant or "External Transfer"
        
        # Update TransactionQueue entry to processed
        queue_entry = db.query(models.TransactionQueue).filter(
            models.TransactionQueue.transaction_id == transaction_id
        ).first()
        if queue_entry:
            queue_entry.status = "processed"
            queue_entry.processed_at = func.now()
        
        db.commit()
        
        # Recalculate account balance chronologically
        _recalculate_account_balance(db, pending_tx.account_id)
        
        return {
            "status": "completed",
            "message": "Transfer marked as from external source",
            "credit_transaction_id": str(pending_tx.id),
            "debit_transaction_id": None
        }
    
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
    db.add(debit_tx)
    db.flush()  # Get the ID before adding to queue
    
    # 2. Update the credit transaction: mark as completed and update merchant name
    pending_tx.status = "completed"
    pending_tx.merchant = f"Transfer from {source_account.name}"
    
    # 3. Add queue entries to track these transactions
    debit_queue = models.TransactionQueue(
        transaction_id=debit_tx.id,
        account_id=source_account_id,
        status="processed",
        processed_at=datetime.utcnow()
    )
    db.add(debit_queue)
    
    # 4. Mark the credit transaction's queue entry as processed
    credit_queue = db.query(models.TransactionQueue).filter(
        models.TransactionQueue.transaction_id == pending_tx.id
    ).first()
    if credit_queue:
        credit_queue.status = "processed"
        credit_queue.blocked_reason = None
        credit_queue.processed_at = datetime.utcnow()
    
    db.commit()
    
    # 5. Recalculate both accounts chronologically so balance_after_transaction is correct
    _recalculate_account_balance(db, source_account_id)
    _recalculate_account_balance(db, pending_tx.account_id)
    
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

@app.get("/queue/status")
def get_queue_status(db: Session = Depends(get_db)):
    """Get current transaction queue status"""
    return queue_processor.get_queue_status(db)

@app.get("/queue/blocked")
def get_blocked_transactions(db: Session = Depends(get_db)):
    """Get all blocked transactions requiring resolution"""
    return queue_processor.get_blocked_transactions(db)

@app.post("/queue/process")
def process_queue(
    account_id: Optional[str] = None,
    credit_card_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Manually trigger queue processing"""
    processed = queue_processor.try_process(db, account_id=account_id, credit_card_id=credit_card_id)
    return {
        "processed_count": len(processed),
        "transactions": [{"id": tx.id, "amount": tx.amount, "merchant": tx.merchant} for tx in processed]
    }

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
        result = sms_agent.validate_parsed_digits(body, result)  # Validate account numbers
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
        await sms_agent._create_transaction_logic(db, result, account, None, body, reply_target=None, source="telegram")
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
        result = sms_agent.validate_parsed_digits(msg.body, result)  # Validate account numbers
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

    # 2. Find Account logic (Unified) - Match sms_agent logic
    # For debits: source comes first. For credits: check destination first.
    tx_type = (result.get("transaction_type") or "").lower()
    
    if tx_type == "credit":
        last_4 = result.get("destination_account_last4") or result.get("source_account_last4")
    else:
        # Default: source first (for debit/purchase/transfer FROM)
        last_4 = result.get("source_account_last4") or result.get("destination_account_last4")
    
    # Fallback to card info
    if not last_4 and result.get("card_info"):
        card_digits = "".join(filter(str.isdigit, str(result.get("card_info"))))
        if len(card_digits) >= 4:
            last_4 = card_digits[-4:]

    # Sanitize
    if last_4:
        last_4 = "".join(filter(str.isdigit, str(last_4)))[-4:]

    # Check credit cards first, then accounts (matching sms_agent behavior)
    credit_card = None
    account = None
    
    if last_4:
        credit_card = crud.get_credit_card_by_last4(db, last_4)
        if not credit_card:
            account = crud.get_account_by_last_4(db, last_4=last_4)

    if not account and not credit_card:
        msg.status = models.MessageStatus.FAILED
        msg.error_log = f"Retry: Account/Card {last_4} not found"
        db.commit()
        return {"status": "warning", "reason": "Account not found"}

    # 3. Create Logic
    try:
        await sms_agent._create_transaction_logic(db, result, account, credit_card, msg.body, reply_target=None, source="webui")
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

# --- Direct SMS Ingest (for iPhone Shortcuts and Web UI) ---
@app.post("/api/sms/ingest")
async def ingest_sms(payload: schemas.SMSIngest, db: Session = Depends(get_db)):
    """
    Direct SMS ingest endpoint for iPhone Shortcuts and Web UI.
    Accepts separate 'sender' and 'body' fields.
    
    Returns:
    - status: "success" | "pending_action" | "ignored" | "failed"
    - transaction: Created transaction details (if any)
    - accounts: List of accounts for selection (if pending_action)
    - parsed: AI parsing result
    """
    logger.info(f"[SMS-INGEST] Received from: {payload.sender}")
    
    # 0. Early filter: Skip OTP/verification messages entirely (don't even store them)
    body_lower = payload.body.lower()
    otp_keywords = [
        'otp', 'verification code', 'one-time', 'one time', 
        'رمز التحقق', 'كلمة السر', 'رمز سري', 'رمز مؤقت',  # Arabic OTP keywords
        'security code', 'pin code', 'temporary password',
        'verify your', 'confirm your identity', 'authentication code',
        'do not share', 'لا تشاركه', 'expires in'
    ]
    if any(kw in body_lower for kw in otp_keywords):
        logger.info(f"[SMS-INGEST] Skipping OTP/verification message")
        return {"status": "ignored", "reason": "OTP/verification message"}
    
    # 0b. Early filter: Skip Arabic SMS with masked account numbers (e.g. 053***611)
    # These are a different AlRajhi SMS format where account is starred out — can't match registered accounts
    import re as _re_early
    masked_account_match = _re_early.search(r'\d{3}\*{3}\d{3}', payload.body)
    if masked_account_match:
        logger.info(f"[SMS-INGEST] Skipping SMS with masked account number: {masked_account_match.group()}")
        raw_msg = models.RawMessage(
            sender=payload.sender or "Unknown",
            body=payload.body.strip(),
            source="webui",
            status=models.MessageStatus.IGNORED
        )
        raw_msg.error_log = f"Skipped: masked account ({masked_account_match.group()}) — not a registered account format"
        db.add(raw_msg)
        db.commit()
        return {"status": "ignored", "reason": f"Masked account number ({masked_account_match.group()}) — cannot match registered accounts"}
    
    # 0c. Early filter: Skip credit card statement/reminder notifications
    statement_keywords = [
        'statement', 'total amount due', 'minimum amount due',
        'sadad number', 'pay your card dues', 'due date',
        'كشف حساب', 'مبلغ الحد الأدنى', 'تاريخ الاستحقاق'
    ]
    if sum(1 for kw in statement_keywords if kw in body_lower) >= 2:
        logger.info(f"[SMS-INGEST] Skipping credit card statement notification")
        raw_msg = models.RawMessage(
            sender=payload.sender or "Unknown",
            body=payload.body.strip(),
            source="webui",
            status=models.MessageStatus.IGNORED
        )
        raw_msg.error_log = "Skipped: credit card statement/reminder notification"
        db.add(raw_msg)
        db.commit()
        return {"status": "ignored", "reason": "Credit card statement notification — not a transaction"}
    
    # 0b. QUEUE CHECK: Log pending transactions but don't block processing
    queue_status = queue_processor.get_queue_status(db)
    if queue_status["blocked"] > 0:
        logger.info(f"[SMS-INGEST] Note: {queue_status['blocked']} pending transactions exist, but continuing to process")
    
    # 0c. DUPLICATE CHECK: Skip if same SMS body already processed
    # Extract meaningful lines for matching (skip timestamp/sender headers)
    body_lines = payload.body.strip().split('\n')
    core_lines = []
    amount_line = None
    
    for line in body_lines:
        line_lower = line.lower().strip()
        line_stripped = line.strip()
        
        # Skip header lines like "2026-01-25 17:05:01 from AlRajhiBank"
        if ' from ' in line_lower and ('bank' in line_lower or 'alrajhi' in line_lower or 'stc' in line_lower):
            continue
        
        # Capture amount line specifically (contains "amount" or numeric value with currency)
        if 'amount' in line_lower and amount_line is None:
            amount_line = line_stripped
        
        if line_stripped:
            core_lines.append(line_stripped)
    
    # Use first line + amount line for duplicate check (unique combination)
    # DISABLED: Allow duplicate SMS to be processed
    # if len(core_lines) >= 1:
    #     search_line1 = core_lines[0][:50]  # First content line (e.g., "Credit Card:Payment")
    #     
    #     # Build query conditions
    #     query = db.query(models.Transaction).filter(
    #         models.Transaction.raw_sms_content.ilike(f"%{search_line1}%")
    #     )
    #     
    #     # Add amount line if found (makes the check more specific)
    #     if amount_line:
    #         query = query.filter(
    #             models.Transaction.raw_sms_content.ilike(f"%{amount_line[:40]}%")
    #         )
    #     
    #     existing_tx = query.first()
    #     if existing_tx:
    #         logger.info(f"[SMS-INGEST] Duplicate SMS detected, already processed as transaction {existing_tx.id}")
    #         return {
    #             "status": "duplicate",
    #             "reason": "This SMS has already been processed",
    #             "transaction_id": existing_tx.id,
    #             "transaction": {
    #                 "id": existing_tx.id,
    #                 "merchant": existing_tx.merchant,
    #                 "amount": existing_tx.amount,
    #                 "type": str(existing_tx.type),
    #                 "status": str(existing_tx.status)
    #             }
    #         }
    
    # 1. Create Raw Message record (will be deleted if not a transaction)
    raw_msg = models.RawMessage(
        sender=payload.sender,
        body=payload.body,
        status=models.MessageStatus.PENDING,
        timestamp=datetime.now()
    )
    db.add(raw_msg)
    db.commit()
    db.refresh(raw_msg)

    
    # 2. Extract sender from header if present (WebUI format: "2025-09-20 09:39:36 from STC Bank")
    effective_sender = payload.sender
    body_for_parsing = payload.body
    
    # Check first line for header pattern
    first_line = body_lines[0] if body_lines else ""
    import re
    header_match = re.search(r'^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+from\s+(.+)$', first_line.strip(), re.IGNORECASE)
    if header_match:
        extracted_sender = header_match.group(1).strip()
        logger.info(f"[SMS-INGEST] Extracted sender from header: {extracted_sender}")
        effective_sender = extracted_sender
        # Remove header line from body for cleaner parsing
        body_for_parsing = '\n'.join(body_lines[1:]).strip()
    
    # Update raw message with effective sender
    raw_msg.sender = effective_sender
    db.commit()

    # 2b. Use bank-specific parser based on sender
    try:
        from bank_parsers import get_parser
        parser = get_parser(effective_sender)
        result = await parser.parse(db, body_for_parsing)
        result = sms_agent.validate_parsed_digits(body_for_parsing, result)  # Validate account numbers
        logger.info(f"[SMS-INGEST] AI Response: {result}")
    except Exception as e:
        logger.error(f"[SMS-INGEST] AI Error: {str(e)}")
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"AI Error: {str(e)}"
        db.commit()
        return {"status": "failed", "reason": str(e)}
    
    # 3. Check for errors - ensure result is a dict
    if isinstance(result, list):
        result = result[0] if result else {}
    
    if result and isinstance(result, dict) and result.get("error"):
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = result.get("error")
        db.commit()
        return {"status": "failed", "reason": result.get("error")}
    
    if not result or not isinstance(result, dict) or not result.get("is_financial_event"):
        reason = result.get("reason", "Not a financial event") if isinstance(result, dict) and result else "No response"
        # Delete the raw message - don't store non-transactions in inbox (like Telegram behavior)
        db.delete(raw_msg)
        db.commit()
        return {"status": "ignored", "reason": reason}

    # 3b. Fallback: Extract source_bank from SMS header if not parsed by AI
    # Pattern: "YYYY-MM-DD HH:MM:SS from BankName"
    if not result.get("source_bank"):
        import re
        header_match = re.search(r'\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+from\s+(\S+)', payload.body, re.IGNORECASE)
        if header_match:
            result["source_bank"] = header_match.group(1)
            logger.info(f"[SMS-INGEST] Extracted source_bank from header: {result['source_bank']}")
    
    # Check for Declines
    if result.get("status") == "failed" or result.get("sub_type") == "decline":
        raw_msg.status = models.MessageStatus.PARSED
        raw_msg.error_log = "Transaction Declined (not added to ledger)"
        db.commit()
        return {
            "status": "declined",
            "reason": "Transaction was declined",
            "parsed": result
        }
    
    # 4a. Check if user has an account at this bank - ignore SMS from banks where user has no account
    # For CREDITS: check destination_bank (where money goes = user's bank)
    # For DEBITS: check source_bank (where money leaves = user's bank)
    tx_type_for_bank = (result.get("transaction_type") or "debit").lower()
    
    if tx_type_for_bank == "credit":
        # For credits, the user's bank is the destination (receiving bank)
        bank_to_check = result.get("destination_bank")
    else:
        # For debits, the user's bank is the source (sending bank)
        bank_to_check = result.get("source_bank") or result.get("destination_bank")
    
    if bank_to_check:
        bank_lower = bank_to_check.lower().strip()
        
        # Get all bank names from user's accounts and credit cards
        user_accounts = db.query(models.Account).all()
        user_credit_cards = db.query(models.CreditCard).all()
        
        user_bank_names = set()
        for acc in user_accounts:
            if acc.bank_name:
                user_bank_names.add(acc.bank_name.lower().strip())
        for card in user_credit_cards:
            if card.bank_name:
                user_bank_names.add(card.bank_name.lower().strip())
        
        # Check if any user bank matches the SMS bank
        has_account_at_bank = any(
            user_bank in bank_lower or bank_lower in user_bank 
            for user_bank in user_bank_names
        )
        
        if not has_account_at_bank and user_bank_names:  # Only filter if user has some accounts
            raw_msg.status = models.MessageStatus.FAILED
            raw_msg.error_log = f"No account at bank: {bank_to_check}"
            db.commit()
            return {
                "status": "ignored",
                "reason": f"No account registered at bank: {bank_to_check}",
                "parsed": result
            }

    
    # 4. Find account using clean resolve_account logic
    account, credit_card, any_last4 = sms_agent.resolve_account(db, result, payload.body)
    
    # 4b. Parse SMS timestamp for use in pending transactions
    import re as _re
    from dateutil import parser as _date_parser
    pending_timestamp = datetime.now()
    header_match = _re.match(r'^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+from\s+', payload.body, _re.IGNORECASE)
    if header_match:
        try:
            pending_timestamp = datetime.strptime(header_match.group(1), "%Y-%m-%d %H:%M:%S")
        except: pass
    elif result.get("timestamp"):
        try:
            pending_timestamp = _date_parser.parse(result["timestamp"])
        except: pass
    
    # 5. Handle unknown account - skip if card number is known but unregistered
    if not account and not credit_card:
        if any_last4:
            # Special case: "Transfer Between Your Accounts" means BOTH accounts are the user's own.
            # Even if the account isn't registered, prompt for selection instead of skipping.
            is_own_account_transfer = "transfer between your accounts" in payload.body.lower()
            
            if is_own_account_transfer:
                import json as json_lib
                logger.info(f"[SMS-INGEST] Own-account transfer with unregistered account x{any_last4} — prompting")
                
                pending_tx = models.Transaction(
                    account_id=None,
                    credit_card_id=None,
                    amount=result.get("amount", 0),
                    merchant=f"Transfer to x{any_last4}",
                    raw_sms_content=payload.body,
                    parsed_data=json_lib.dumps(result),
                    timestamp=pending_timestamp,
                    category="Transfer",
                    type="debit",
                    status="pending_action",
                )
                db.add(pending_tx)
                db.commit()
                db.refresh(pending_tx)
                
                raw_msg.status = models.MessageStatus.PENDING
                raw_msg.error_log = f"Own-account transfer to x{any_last4} — waiting for source account selection"
                db.commit()
                
                accounts_list = crud.get_accounts(db)
                account_options = [
                    {"id": acc.id, "name": acc.name, "type": "account", "last_4": acc.last_4_digits}
                    for acc in accounts_list
                ]
                cc_options = []
                
                return {
                    "status": "pending_action",
                    "reason": f"Transfer between your accounts (x{any_last4} not registered) — select source account",
                    "transaction_id": pending_tx.id,
                    "transaction": {
                        "id": pending_tx.id,
                        "amount": pending_tx.amount,
                        "merchant": pending_tx.merchant,
                        "type": pending_tx.type,
                        "category": pending_tx.category,
                        "status": pending_tx.status
                    },
                    "accounts": account_options,
                    "credit_cards": cc_options,
                    "parsed": result
                }
            
            logger.info(f"[SMS-INGEST] SKIP: Card/account {any_last4} not registered in system")
            raw_msg.status = models.MessageStatus.IGNORED
            raw_msg.error_log = f"Skipped: unregistered card/account {any_last4}"
            db.commit()
            return {
                "status": "ignored",
                "reason": f"Card/account {any_last4} is not registered in the system",
                "parsed": result
            }

        # Create pending_action transaction only when no card number was extracted at all
        import json as json_lib
        tx_type = result.get("transaction_type") or "debit"
        
        # Resolve counterparty (merchant) even for pending_action transactions
        pending_merchant_id = None
        merchant_display = result.get("merchant") or result.get("description") or "Unknown"
        brand_name = result.get("brand_name")
        brand_domain = result.get("brand_domain")
        sub_type = result.get("sub_type", "")
        pending_category = result.get("category", "Uncategorized")
        
        try:
            if sub_type in ['purchase', 'refund', 'atm', 'pos', 'online', 'cc_payment']:
                raw_merchant = result.get("merchant") or merchant_display
                if raw_merchant and raw_merchant not in ['Unknown', 'POS Purchase']:
                    logo_url = f"https://www.google.com/s2/favicons?domain={brand_domain}&sz=64" if brand_domain else None
                    m = crud.find_or_create_merchant(
                        db, raw_merchant, 
                        category=result.get("category"),
                        brand_name=brand_name,
                        logo_url=logo_url
                    )
                    pending_merchant_id = m.id
                    if brand_name:
                        merchant_display = brand_name
                    # Inherit merchant's category if AI didn't provide one
                    if m.category and (not pending_category or pending_category.lower() == 'uncategorized'):
                        pending_category = m.category
                        logger.info(f"[PENDING] Inherited category '{pending_category}' from merchant {m.display_name or m.name}")
                    logger.info(f"[PENDING] Linked to merchant: {m.display_name or m.name} ({m.id})")
        except Exception as e:
            logger.warning(f"[PENDING] Counterparty resolution failed (non-fatal): {e}")
        
        pending_tx = models.Transaction(
            account_id=None,
            credit_card_id=None,
            amount=result.get("amount", 0),
            merchant=merchant_display,
            raw_sms_content=payload.body,
            parsed_data=json_lib.dumps(result),
            timestamp=datetime.now(),
            category=pending_category,
            type=tx_type,
            status="pending_action",
            merchant_id=pending_merchant_id,
        )
        db.add(pending_tx)
        db.commit()
        db.refresh(pending_tx)
        
        raw_msg.status = models.MessageStatus.PENDING
        raw_msg.error_log = f"Waiting for account selection (last4: {last_4})"
        db.commit()
        
        # Get available accounts for selection
        accounts_list = crud.get_accounts(db)
        credit_cards_list = crud.get_credit_cards(db)
        
        account_options = [
            {"id": acc.id, "name": acc.name, "type": "account", "last_4": acc.last_4_digits}
            for acc in accounts_list
        ]
        cc_options = [
            {"id": cc.id, "name": cc.name, "type": "credit_card", "last_4": cc.last_4_digits}
            for cc in credit_cards_list
        ]
        
        return {
            "status": "pending_action",
            "reason": f"Unknown account: {last_4}" if last_4 else "No account identified",
            "transaction_id": pending_tx.id,
            "transaction": {
                "id": pending_tx.id,
                "amount": pending_tx.amount,
                "merchant": pending_tx.merchant,
                "type": pending_tx.type,
                "category": pending_tx.category,
                "status": pending_tx.status
            },
            "accounts": account_options,
            "credit_cards": cc_options,
            "parsed": result
        }
    
    # 6. Create transaction using existing sms_agent logic
    try:
        await sms_agent._create_transaction_logic(db, result, account, credit_card, payload.body, reply_target=None, source="webui")
        raw_msg.status = models.MessageStatus.PARSED
        raw_msg.error_log = None
        db.commit()
        
        # Fetch the created transaction
        created_tx = db.query(models.Transaction).filter(
            models.Transaction.raw_sms_content == payload.body
        ).order_by(models.Transaction.id.desc()).first()
        
        tx_response = None
        if created_tx:
            tx_response = {
                "id": created_tx.id,
                "amount": created_tx.amount,
                "merchant": created_tx.merchant,
                "type": created_tx.type,
                "category": created_tx.category,
                "status": created_tx.status,
                "account_name": account.name if account else (credit_card.name if credit_card else None),
                "timestamp": created_tx.timestamp.isoformat() if created_tx.timestamp else None
            }
        
        return {
            "status": "success",
            "message": "Transaction logged",
            "transaction": tx_response,
            "parsed": result
        }
    except Exception as e:
        raw_msg.status = models.MessageStatus.FAILED
        raw_msg.error_log = f"Transaction Error: {str(e)}"
        db.commit()
        return {"status": "failed", "reason": str(e)}


@app.post("/api/sms/assign-account")
def assign_account_to_pending_tx(
    transaction_id: str,
    account_id: str = None,
    credit_card_id: str = None,
    db: Session = Depends(get_db)
):
    """
    Assign an account or credit card to a pending_action transaction.
    This is called after user selects from the account options.
    """
    tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if tx.status != "pending_action":
        raise HTTPException(status_code=400, detail="Transaction is not pending action")
    
    # Assign account or credit card
    if account_id:
        account = crud.get_account(db, account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        
        tx.account_id = account_id
        tx.status = "completed"
        
        # Update account balance via queue processor
        queue_processor.apply_balance_update(db, tx)
        
    elif credit_card_id:
        cc = crud.get_credit_card(db, credit_card_id)
        if not cc:
            raise HTTPException(status_code=404, detail="Credit card not found")
        
        tx.credit_card_id = credit_card_id
        tx.status = "completed"
        
        # Update credit card balance via queue processor
        queue_processor.apply_balance_update(db, tx)
    else:
        raise HTTPException(status_code=400, detail="Either account_id or credit_card_id required")
    
    # Unblock any blocked queue items and auto-process
    queue_processor.unblock_transaction(db, tx.id)
    if account_id:
        queue_processor.try_process(db, account_id=account_id)
    elif credit_card_id:
        queue_processor.try_process(db, credit_card_id=credit_card_id)
    
    db.commit()
    db.refresh(tx)
    
    account_name = None
    if tx.account_id:
        acc = crud.get_account(db, tx.account_id)
        account_name = acc.name if acc else None
    elif tx.credit_card_id:
        cc = crud.get_credit_card(db, tx.credit_card_id)
        account_name = cc.name if cc else None
    
    return {
        "status": "success",
        "transaction": {
            "id": tx.id,
            "amount": tx.amount,
            "merchant": tx.merchant,
            "type": tx.type,
            "category": tx.category,
            "status": tx.status,
            "account_name": account_name,
            "balance_after": tx.balance_after_transaction
        }
    }


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
    obligations = crud.get_obligations(db)
    # Resolve target_account_name for each obligation
    accounts_cache = {}
    for obl in obligations:
        if obl.target_account_id:
            if obl.target_account_id not in accounts_cache:
                acc = crud.get_account(db, obl.target_account_id)
                accounts_cache[obl.target_account_id] = acc.name if acc else None
            obl.target_account_name = accounts_cache[obl.target_account_id]
    return obligations

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

    # Calculate billing month
    from dateutil.relativedelta import relativedelta
    target_date = datetime.now() + relativedelta(months=req.month_offset)
    billing_month = target_date.strftime('%Y-%m')

    # Group by target envelope
    envelope_groups = {}  # target_account_id -> {items, total, account_name}
    
    for item in preview.allocations:
        # Only process pending items with positive pending amounts
        if item.pending_amount <= 0 or item.status == 'transferred':
            continue
        
        # Filter by specific obligations if provided
        if req.obligation_ids and item.obligation_id not in req.obligation_ids:
            continue
        
        # Use override amount if provided for this obligation
        transfer_amount = item.pending_amount
        if req.override_amounts and item.obligation_id in req.override_amounts:
            transfer_amount = req.override_amounts[item.obligation_id]
        
        key = item.target_account_id
        if key not in envelope_groups:
            envelope_groups[key] = {
                "target_account_id": key,
                "target_account_name": item.target_account_name,
                "total": 0.0,
                "obligations": []
            }
        envelope_groups[key]["total"] += transfer_amount
        envelope_groups[key]["obligations"].append({
            "obligation_id": item.obligation_id,
            "obligation_name": item.obligation_name,
            "amount": transfer_amount
        })
    
    executed_transfers = []
    
    for key, group in envelope_groups.items():
        # Build note with all obligation names
        obl_names = [o["obligation_name"] for o in group["obligations"]]
        note = f"Payday: {', '.join(obl_names)}"
        
        # Create ONE distribution per target envelope
        distribution = schemas.DistributionCreate(
            source_account_id=source_acc.id,
            target_account_id=group["target_account_id"],
            amount=round(group["total"], 2),
            billing_month=billing_month,
            note=note
        )
        crud.create_distribution(db, distribution)
        
        executed_transfers.append({
            "target_account": group["target_account_name"],
            "amount": round(group["total"], 2),
            "obligations": group["obligations"]
        })
        
    return {
        "status": "success", 
        "transfers_count": len(executed_transfers),
        "details": executed_transfers,
        "note": "Distribution records created per envelope. Link to real bank transfers when they occur."
    }

@app.post("/allocation/reverse")
def reverse_allocation(req: schemas.AllocationReverseRequest, db: Session = Depends(get_db)):
    """Reverse/undo a payday distribution for specific obligations or envelopes."""
    from dateutil.relativedelta import relativedelta
    target_date = datetime.now() + relativedelta(months=req.month_offset)
    billing_month = target_date.strftime('%Y-%m')
    
    reversed_items = []
    
    # Collect target_account_ids from the obligations being reversed
    target_accounts_to_reverse = set()
    for obl_id in req.obligation_ids:
        # First try to find per-obligation distributions (legacy)
        dists = db.query(models.Distribution).filter(
            models.Distribution.source_account_id == req.source_account_id,
            models.Distribution.billing_month == billing_month,
            models.Distribution.obligation_id == obl_id
        ).all()
        
        for d in dists:
            reversed_items.append({
                "obligation_id": obl_id,
                "amount": d.amount,
                "distribution_id": d.id
            })
            db.delete(d)
        
        # Also track this obligation's target account for envelope-level distributions
        obl = db.query(models.MonthlyObligation).filter(
            models.MonthlyObligation.id == obl_id
        ).first()
        if obl and obl.target_account_id:
            target_accounts_to_reverse.add(obl.target_account_id)
    
    # Also delete envelope-level distributions (no obligation_id) for the same target accounts
    for target_acc_id in target_accounts_to_reverse:
        envelope_dists = db.query(models.Distribution).filter(
            models.Distribution.source_account_id == req.source_account_id,
            models.Distribution.billing_month == billing_month,
            models.Distribution.target_account_id == target_acc_id,
            models.Distribution.obligation_id == None
        ).all()
        
        for d in envelope_dists:
            reversed_items.append({
                "target_account_id": target_acc_id,
                "amount": d.amount,
                "distribution_id": d.id
            })
            db.delete(d)
    
    db.commit()
    
    return {
        "status": "reversed",
        "reversed_count": len(reversed_items),
        "details": reversed_items,
        "billing_month": billing_month
    }

# --- Category Endpoints ---

@app.post("/categories", response_model=schemas.Category)
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):
    return crud.create_category(db, category)

@app.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    categories = crud.get_categories(db)
    # Count transactions per category
    from sqlalchemy import func as sqla_func
    counts = dict(
        db.query(models.Transaction.category, sqla_func.count(models.Transaction.id))
        .group_by(models.Transaction.category)
        .all()
    )
    return [
        {
            "id": cat.id,
            "name": cat.name,
            "type": cat.type,
            "transaction_count": counts.get(cat.name, 0)
        }
        for cat in categories
    ]

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


# --- Distribution Endpoints ---

@app.post("/distributions", response_model=schemas.Distribution)
def create_distribution(distribution: schemas.DistributionCreate, db: Session = Depends(get_db)):
    """Create a distribution record."""
    db_distribution = crud.create_distribution(db, distribution)
    
    # Enrich with account names
    source = crud.get_account(db, db_distribution.source_account_id)
    target = crud.get_account(db, db_distribution.target_account_id)
    
    return {
        **db_distribution.__dict__,
        "source_account_name": source.name if source else None,
        "target_account_name": target.name if target else None,
        "linked_transaction": None
    }

@app.get("/distributions", response_model=List[schemas.Distribution])
def get_distributions(
    billing_month: str = None,
    source_account_id: str = None,
    db: Session = Depends(get_db)
):
    """Get distributions, optionally filtered by month or source account."""
    distributions = crud.get_distributions(db, billing_month, source_account_id)
    
    # Enrich with account names, obligation names, and linked transactions
    result = []
    obl_cache = {}
    for d in distributions:
        source = crud.get_account(db, d.source_account_id)
        target = crud.get_account(db, d.target_account_id)
        linked_tx = None
        if d.transaction_id:
            linked_tx = crud.get_transaction(db, d.transaction_id)
        
        # Resolve obligation name
        obl_name = None
        if d.obligation_id:
            if d.obligation_id not in obl_cache:
                obl = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == d.obligation_id).first()
                obl_cache[d.obligation_id] = obl.name if obl else None
            obl_name = obl_cache[d.obligation_id]
        
        # Get linked transactions from junction table
        linked_txs = []
        if d.linked_transactions:
            for link in d.linked_transactions:
                tx = link.transaction
                if tx:
                    linked_txs.append({
                        "id": tx.id,
                        "merchant": tx.merchant,
                        "amount": tx.amount,
                        "type": tx.type,
                        "category": tx.category,
                        "timestamp": tx.timestamp.isoformat() if tx.timestamp else None,
                        "account_id": tx.account_id,
                    })
        
        result.append({
            **d.__dict__,
            "source_account_name": source.name if source else None,
            "target_account_name": target.name if target else None,
            "obligation_name": obl_name,
            "linked_transaction": linked_tx,
            "linked_transactions": linked_txs,
            "linked_transactions_count": len(linked_txs)
        })
    
    return result

@app.get("/distributions/{distribution_id}", response_model=schemas.Distribution)
def get_distribution(distribution_id: str, db: Session = Depends(get_db)):
    """Get a single distribution by ID."""
    d = crud.get_distribution(db, distribution_id)
    if not d:
        raise HTTPException(status_code=404, detail="Distribution not found")
    
    source = crud.get_account(db, d.source_account_id)
    target = crud.get_account(db, d.target_account_id)
    linked_tx = crud.get_transaction(db, d.transaction_id) if d.transaction_id else None
    
    return {
        **d.__dict__,
        "source_account_name": source.name if source else None,
        "target_account_name": target.name if target else None,
        "linked_transaction": linked_tx
    }

@app.get("/distributions/{distribution_id}/matches", response_model=List[schemas.Transaction])
def get_distribution_matches(distribution_id: str, db: Session = Depends(get_db)):
    """Find matching transactions for a distribution."""
    matches = crud.get_distribution_matches(db, distribution_id)
    return matches

@app.post("/distributions/{distribution_id}/link")
def link_distribution(distribution_id: str, transaction_id: str, db: Session = Depends(get_db)):
    """Link a distribution to a transaction."""
    result = crud.link_distribution_to_transaction(db, distribution_id, transaction_id)
    if not result:
        raise HTTPException(status_code=404, detail="Distribution not found")
    return {"status": "linked", "distribution_id": distribution_id, "transaction_id": transaction_id}

@app.put("/distributions/{distribution_id}", response_model=schemas.Distribution)
def update_distribution(distribution_id: str, update: schemas.DistributionUpdate, db: Session = Depends(get_db)):
    """Update a distribution."""
    result = crud.update_distribution(db, distribution_id, update)
    if not result:
        raise HTTPException(status_code=404, detail="Distribution not found")
    
    source = crud.get_account(db, result.source_account_id)
    target = crud.get_account(db, result.target_account_id)
    
    return {
        **result.__dict__,
        "source_account_name": source.name if source else None,
        "target_account_name": target.name if target else None,
        "linked_transaction": None
    }

@app.delete("/distributions/{distribution_id}")
def delete_distribution(distribution_id: str, db: Session = Depends(get_db)):
    """Delete a distribution."""
    success = crud.delete_distribution(db, distribution_id)
    if not success:
        raise HTTPException(status_code=404, detail="Distribution not found")
    return {"status": "deleted"}


# --- Transaction Linking Endpoints ---

@app.get("/payments/{payment_id}/transactions")
def get_payment_linked_transactions(payment_id: int, db: Session = Depends(get_db)):
    """Get all transactions linked to a payment."""
    links = db.query(models.PaymentTransaction).filter(
        models.PaymentTransaction.payment_id == payment_id
    ).all()
    tx_ids = [link.transaction_id for link in links]
    
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if payment and payment.transaction_id and payment.transaction_id not in tx_ids:
        tx_ids.append(payment.transaction_id)
    
    transactions = db.query(models.Transaction).filter(
        models.Transaction.id.in_(tx_ids)
    ).all() if tx_ids else []
    
    return transactions


@app.post("/payments/{payment_id}/transactions")
def link_transactions_to_payment(
    payment_id: int,
    request: schemas.LinkTransactionsRequest,
    db: Session = Depends(get_db)
):
    """Link multiple transactions to a payment."""
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    linked = []
    for tx_id in request.transaction_ids:
        existing = db.query(models.PaymentTransaction).filter(
            models.PaymentTransaction.payment_id == payment_id,
            models.PaymentTransaction.transaction_id == tx_id
        ).first()
        
        if not existing:
            link = models.PaymentTransaction(payment_id=payment_id, transaction_id=tx_id)
            db.add(link)
            linked.append(tx_id)
    
    db.commit()
    return {"linked": linked, "count": len(linked)}


@app.delete("/payments/{payment_id}/transactions/{transaction_id}")
def unlink_transaction_from_payment(payment_id: int, transaction_id: str, db: Session = Depends(get_db)):
    """Unlink a transaction from a payment."""
    link = db.query(models.PaymentTransaction).filter(
        models.PaymentTransaction.payment_id == payment_id,
        models.PaymentTransaction.transaction_id == transaction_id
    ).first()
    
    if link:
        db.delete(link)
        db.commit()
        return {"status": "unlinked"}
    
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if payment and payment.transaction_id == transaction_id:
        payment.transaction_id = None
        db.commit()
        return {"status": "unlinked"}
    
    raise HTTPException(status_code=404, detail="Link not found")


@app.get("/distributions/{distribution_id}/transactions")
def get_distribution_linked_transactions(distribution_id: str, db: Session = Depends(get_db)):
    """Get all transactions linked to a distribution."""
    links = db.query(models.DistributionTransaction).filter(
        models.DistributionTransaction.distribution_id == distribution_id
    ).all()
    tx_ids = [link.transaction_id for link in links]
    
    dist = db.query(models.Distribution).filter(models.Distribution.id == distribution_id).first()
    if dist and dist.transaction_id and dist.transaction_id not in tx_ids:
        tx_ids.append(dist.transaction_id)
    
    transactions = db.query(models.Transaction).filter(
        models.Transaction.id.in_(tx_ids)
    ).all() if tx_ids else []
    
    return transactions


@app.post("/distributions/{distribution_id}/transactions")
def link_transactions_to_distribution(
    distribution_id: str,
    request: schemas.LinkTransactionsRequest,
    db: Session = Depends(get_db)
):
    """Link multiple transactions to a distribution."""
    dist = db.query(models.Distribution).filter(models.Distribution.id == distribution_id).first()
    if not dist:
        raise HTTPException(status_code=404, detail="Distribution not found")
    
    linked = []
    for tx_id in request.transaction_ids:
        existing = db.query(models.DistributionTransaction).filter(
            models.DistributionTransaction.distribution_id == distribution_id,
            models.DistributionTransaction.transaction_id == tx_id
        ).first()
        
        if not existing:
            link = models.DistributionTransaction(distribution_id=distribution_id, transaction_id=tx_id)
            db.add(link)
            linked.append(tx_id)
    
    db.commit()
    return {"linked": linked, "count": len(linked)}


@app.delete("/distributions/{distribution_id}/transactions/{transaction_id}")
def unlink_transaction_from_distribution(distribution_id: str, transaction_id: str, db: Session = Depends(get_db)):
    """Unlink a transaction from a distribution."""
    link = db.query(models.DistributionTransaction).filter(
        models.DistributionTransaction.distribution_id == distribution_id,
        models.DistributionTransaction.transaction_id == transaction_id
    ).first()
    
    if link:
        db.delete(link)
        db.commit()
        return {"status": "unlinked"}
    
    dist = db.query(models.Distribution).filter(models.Distribution.id == distribution_id).first()
    if dist and dist.transaction_id == transaction_id:
        dist.transaction_id = None
        db.commit()
        return {"status": "unlinked"}
    
    raise HTTPException(status_code=404, detail="Link not found")


@app.get("/transactions/search")
def search_transactions(
    query: Optional[str] = None,
    account_id: Optional[str] = None,
    category: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Search transactions with filters for the transaction selector modal."""
    q = db.query(models.Transaction)
    
    if query:
        q = q.filter(
            (models.Transaction.merchant.ilike(f"%{query}%")) |
            (models.Transaction.notes.ilike(f"%{query}%")) |
            (models.Transaction.raw_sms_content.ilike(f"%{query}%"))
        )

    
    if account_id:
        q = q.filter(models.Transaction.account_id == account_id)
    
    if category:
        q = q.filter(models.Transaction.category == category)
    
    if min_amount is not None:
        q = q.filter(models.Transaction.amount >= min_amount)
    
    if max_amount is not None:
        q = q.filter(models.Transaction.amount <= max_amount)
    
    if start_date:
        q = q.filter(models.Transaction.timestamp >= start_date)
    
    if end_date:
        q = q.filter(models.Transaction.timestamp <= end_date)
    
    if type:
        q = q.filter(models.Transaction.type == type)
    
    q = q.order_by(models.Transaction.timestamp.desc())
    transactions = q.limit(limit).all()
    
    result = []
    for tx in transactions:
        tx_dict = {
            "id": tx.id,
            "account_id": tx.account_id,
            "amount": tx.amount,
            "merchant": tx.merchant,
            "category": tx.category,
            "type": str(tx.type.value) if hasattr(tx.type, 'value') else str(tx.type),
            "timestamp": tx.timestamp,
            "linked_to_payment_id": None,
            "linked_to_distribution_id": None,
            "raw_sms_content": tx.raw_sms_content
        }
        
        payment_link = db.query(models.PaymentTransaction).filter(
            models.PaymentTransaction.transaction_id == tx.id
        ).first()
        if payment_link:
            tx_dict["linked_to_payment_id"] = payment_link.payment_id
        
        dist_link = db.query(models.DistributionTransaction).filter(
            models.DistributionTransaction.transaction_id == tx.id
        ).first()
        if dist_link:
            tx_dict["linked_to_distribution_id"] = dist_link.distribution_id
        
        result.append(tx_dict)
    
    return result


# ============================================================
# SETTINGS ENDPOINTS
# ============================================================

@app.get("/settings")
def get_all_settings(db: Session = Depends(get_db)):
    """Return all settings as a dict of key -> {value, label}"""
    rows = db.query(models.UserSettings).all()
    return {r.key: {"value": r.value, "label": r.label} for r in rows}


@app.put("/settings/{key}")
def upsert_setting(key: str, body: dict = Body(...), db: Session = Depends(get_db)):
    """Create or update a setting"""
    value = str(body.get("value", ""))
    label = body.get("label", None)

    existing = db.query(models.UserSettings).filter(models.UserSettings.key == key).first()
    if existing:
        existing.value = value
        if label is not None:
            existing.label = label
        existing.updated_at = datetime.utcnow()
    else:
        existing = models.UserSettings(key=key, value=value, label=label)
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return {"key": existing.key, "value": existing.value, "label": existing.label}


@app.on_event("startup")
def seed_default_settings():
    """Seed default settings if they don't exist"""
    from database import SessionLocal
    db = SessionLocal()
    try:
        existing = db.query(models.UserSettings).filter(models.UserSettings.key == "period_start_day").first()
        if not existing:
            db.add(models.UserSettings(key="period_start_day", value="1", label=""))
            db.commit()
            logger.info("Seeded default setting: period_start_day=1")
    except Exception as e:
        logger.error(f"Error seeding settings: {e}")
        db.rollback()
    finally:
        db.close()
