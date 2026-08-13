from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request, Body, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect, func, or_, cast, String
from typing import List, Optional
from datetime import datetime
import os
import re
import uuid
import logging

# Setup logger for API
logger = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

import models
import schemas
import crud
import bank_models
from database import engine, get_db
from sms_parser import parser
import sms_agent
import analysis
import analysis_schema
import sms_enrichment
import transfer_linking
import queue_processor
from rate_limiter import RateLimitMiddleware
from webhook import router as webhook_router
from settlement_service import router as settlement_router
from auth_router import router as auth_router
from alrajhi_router import router as alrajhi_router
from statement_router import router as statement_router
from auth_middleware import AuthMiddleware
from auth import get_current_user

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

        # SMS name-enrichment: preserve the statement's original label (for undo)
        # and stamp each row with the batch that renamed it.
        if 'merchant_original' not in columns:
            print("Migrating: Adding merchant_original to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN merchant_original VARCHAR"))
                conn.commit()

        if 'enrichment_batch_id' not in columns:
            print("Migrating: Adding enrichment_batch_id to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN enrichment_batch_id VARCHAR"))
                conn.commit()

        # Enrichment also writes the SMS's reference fields into notes; keep the
        # original note so undo restores it exactly.
        if 'notes_original' not in columns:
            print("Migrating: Adding notes_original to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN notes_original VARCHAR"))
                conn.commit()

        # Obligation match-hints (account / text / day window) for finding the
        # transaction that pays an obligation.
        obl_cols = [c["name"] for c in inspector.get_columns("obligations")]
        for col, ddl in [
            ("match_account_id", "VARCHAR"), ("match_text", "VARCHAR"),
            ("match_day_from", "INTEGER"), ("match_day_to", "INTEGER"),
        ]:
            if col not in obl_cols:
                print(f"Migrating: Adding {col} to obligations")
                with engine.connect() as conn:
                    conn.execute(text(f"ALTER TABLE obligations ADD COLUMN {col} {ddl}"))
                    conn.commit()

        # The bank's own operation type (PURCHASE, INTERNAL_TRANSFER, FEE ...),
        # kept separate from the spending category. Backfilled from each row's
        # statement line by _backfill_transaction_types() below.
        if 'transaction_type' not in columns:
            print("Migrating: Adding transaction_type to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN transaction_type VARCHAR"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_transaction_type "
                                  "ON transactions (transaction_type)"))
                conn.commit()

        # Which bank issued each statement — scopes the transaction-type wording.
        stmt_cols = [c["name"] for c in inspector.get_columns("statements")] if inspector.has_table("statements") else []
        if stmt_cols and 'bank_key' not in stmt_cols:
            print("Migrating: Adding bank_key to statements")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE statements ADD COLUMN bank_key VARCHAR"))
                conn.commit()

        # A statement can target a credit card instead of a bank account.
        if stmt_cols and 'credit_card_id' not in stmt_cols:
            print("Migrating: Adding credit_card_id to statements")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE statements ADD COLUMN credit_card_id VARCHAR"))
                conn.commit()

        # Links the two legs of one internal transfer without merging them.
        if 'transfer_group_id' not in columns:
            print("Migrating: Adding transfer_group_id to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN transfer_group_id VARCHAR"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_transfer_group_id "
                                  "ON transactions (transfer_group_id)"))
                conn.commit()

        if 'transfer_counterpart_account_id' not in columns:
            print("Migrating: Adding transfer_counterpart_account_id to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions "
                                  "ADD COLUMN transfer_counterpart_account_id VARCHAR"))
                conn.commit()

        # When the batch was applied — without it past batches cannot be listed
        # or ordered, so a batch was only reversible on the screen that created it.
        if 'enriched_at' not in columns:
            print("Migrating: Adding enriched_at to transactions")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN enriched_at TIMESTAMP"))
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

        # --- Statement PDF Import Migrations ---
        # Add account_number to accounts (full IBAN for statement matching)
        if 'accounts' in inspector.get_table_names():
            a_columns = [col['name'] for col in inspector.get_columns('accounts')]
            if 'account_number' not in a_columns:
                print("Migrating: Adding account_number to accounts")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE accounts ADD COLUMN account_number VARCHAR"))
                    conn.commit()

        # Add statement_id FK to transactions
        if 'transactions' in inspector.get_table_names():
            t_columns = [col['name'] for col in inspector.get_columns('transactions')]
            if 'statement_id' not in t_columns:
                print("Migrating: Adding statement_id to transactions")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN statement_id VARCHAR"))
                    conn.commit()

        # --- Batch 4: money precision + indexes + billing_month guard (all idempotent) ---
        _b4_money = [
            ("accounts","current_balance"),("accounts","credit_limit"),("accounts","minimum_payment"),
            ("credit_cards","current_balance"),("credit_cards","credit_limit"),
            ("account_audits","system_balance"),("account_audits","actual_balance"),("account_audits","difference"),
            ("currency_wallets","balance"),
            ("transactions","amount"),("transactions","balance_after_transaction"),("transactions","original_amount"),("transactions","fees"),
            ("loans","principal_amount"),("loans","remaining_balance"),("loans","monthly_payment"),
            ("obligations","amount"),("payments","amount"),("payments","planned_amount"),
            ("savings_goals","target_amount"),("savings_goals","current_amount"),
            ("distributions","amount"),("statements","opening_balance"),("statements","closing_balance"),
            ("statement_lines","debit"),("statement_lines","credit"),("statement_lines","balance"),("statement_lines","amount"),
        ]
        _b4_indexes = [
            "CREATE INDEX IF NOT EXISTS ix_tx_user ON transactions(user_id)",
            "CREATE INDEX IF NOT EXISTS ix_tx_account ON transactions(account_id)",
            "CREATE INDEX IF NOT EXISTS ix_tx_cc ON transactions(credit_card_id)",
            "CREATE INDEX IF NOT EXISTS ix_tx_ts ON transactions(timestamp)",
            "CREATE INDEX IF NOT EXISTS ix_tx_status ON transactions(status)",
            "CREATE INDEX IF NOT EXISTS ix_tx_statement ON transactions(statement_id)",
            "CREATE INDEX IF NOT EXISTS ix_payments_obl ON payments(obligation_id)",
            "CREATE INDEX IF NOT EXISTS ix_payments_bm ON payments(billing_month)",
            "CREATE INDEX IF NOT EXISTS ix_dist_source ON distributions(source_account_id)",
            "CREATE INDEX IF NOT EXISTS ix_dist_bm ON distributions(billing_month)",
            "CREATE INDEX IF NOT EXISTS ix_dist_obl ON distributions(obligation_id)",
            "CREATE INDEX IF NOT EXISTS ix_queue_status ON transaction_queue(status)",
            "CREATE INDEX IF NOT EXISTS ix_pt_tx ON payment_transactions(transaction_id)",
            "CREATE INDEX IF NOT EXISTS ix_dt_tx ON distribution_transactions(transaction_id)",
            "CREATE INDEX IF NOT EXISTS ix_stmtlines_stmt ON statement_lines(statement_id)",
        ]
        _b4_tables = set(inspector.get_table_names())
        with engine.connect() as conn:
            for _t, _c in _b4_money:
                if _t not in _b4_tables:
                    continue
                try:
                    _ct = next((col['type'] for col in inspector.get_columns(_t) if col['name'] == _c), None)
                    if _ct is not None and 'NUMERIC' not in str(_ct).upper():
                        conn.execute(text(f"ALTER TABLE {_t} ALTER COLUMN {_c} TYPE numeric(14,2) USING round({_c}::numeric, 2)"))
                except Exception:
                    pass
            for _stmt in _b4_indexes:
                try:
                    conn.execute(text(_stmt))
                except Exception:
                    pass
            try:
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_obl_month "
                                  "ON payments (obligation_id, left(billing_month,7)) WHERE obligation_id IS NOT NULL"))
            except Exception:
                pass
            # Retire the legacy statement statuses. The lifecycle is now
            # draft -> posted (+ rejected); 'approved'/'reviewed' came from the old
            # two-phase flow. Resolve each to the TRUTH: posted if the statement
            # actually has transactions in the ledger, otherwise draft. Idempotent.
            try:
                if 'statements' in _b4_tables:
                    conn.execute(text(
                        "UPDATE statements SET status='posted' WHERE status IN ('approved','reviewed') "
                        "AND EXISTS (SELECT 1 FROM transactions t WHERE t.statement_id = statements.id)"))
                    conn.execute(text(
                        "UPDATE statements SET status='draft' WHERE status IN ('approved','reviewed')"))
            except Exception:
                pass
            conn.commit()

    except Exception as e:
        print(f"Migration failed: {e}")

# Run migrations
run_migrations(engine)

# Create tables (if they don't exist)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Personal Finance Manager")

# Allowed origins for CORS. Comma-separated list in CORS_ORIGINS, or the
# single FRONTEND_URL, falling back to local dev hosts. A wildcard "*" is
# incompatible with allow_credentials=True and would be silently unsafe.
_cors_env = os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_URL", "")
CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()] or [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting middleware (must be added after CORS)
app.add_middleware(RateLimitMiddleware)

# Auth middleware - enforces JWT on all non-public routes
app.add_middleware(AuthMiddleware)

# Include auth router (register, login, profile)
app.include_router(auth_router)

# Include webhook router for Cloudflare Tunnel SMS integration
app.include_router(webhook_router)

# Include settlement router for bank statement reconciliation
app.include_router(settlement_router)

# Include Al Rajhi bank integration router
app.include_router(alrajhi_router)

# Include statement PDF import router
app.include_router(statement_router)

@app.get("/")
def read_root():
    return {"message": "Finance API is running"}


def _require_owned(db: Session, model, obj_id: str, current_user: models.User):
    """
    Fetch a record by id and verify it belongs to current_user.

    Returns the object, or raises 404 if it does not exist OR is owned by
    another user (404 rather than 403 so we don't disclose existence).
    This is the object-level authorization gate for by-id endpoints.
    """
    obj = db.query(model).filter(model.id == obj_id).first()
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    # Records with no owner (legacy/unstamped rows) are treated as claimable by
    # the caller; only a record owned by a DIFFERENT user is hidden. This avoids
    # 404-ing the true owner on rows whose user_id was never set.
    owner = getattr(obj, "user_id", None)
    if owner is not None and owner != current_user.id:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return obj


def _require_owned_payment(db, payment_id, current_user):
    """
    Object-level ownership gate for a Payment.

    Payments carry no reliable user_id of their own, so ownership is derived
    from the parent obligation (which is reliably owned). Raises 404 if the
    payment does not exist or its obligation belongs to another user.
    """
    p = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if p is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.obligation_id:
        _require_owned(db, models.MonthlyObligation, p.obligation_id, current_user)
    return p


def _require_owned_distribution(db, distribution_id, current_user):
    """
    Object-level ownership gate for a Distribution.

    Distributions carry no reliable user_id of their own, so ownership is
    derived from the source Account (which is reliably owned). Raises 404 if
    the distribution does not exist or its source account belongs to another
    user.
    """
    d = crud.get_distribution(db, distribution_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Distribution not found")
    _require_owned(db, models.Account, d.source_account_id, current_user)
    return d


# --- Account Endpoints ---
@app.post("/accounts/", response_model=schemas.Account)
def create_account(account: schemas.AccountCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.create_account(db=db, account=account, user_id=current_user.id)

@app.get("/accounts/", response_model=List[schemas.Account])
def read_accounts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    accounts = db.query(models.Account).filter(models.Account.user_id == current_user.id).offset(skip).limit(limit).all()
    return accounts

@app.put("/accounts/{account_id}", response_model=schemas.Account)
def update_account(account_id: str, account_update: schemas.AccountUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.Account, account_id, current_user)
    updated_account = crud.update_account(db, account_id, account_update)
    if not updated_account:
        raise HTTPException(status_code=404, detail="Account not found")
    return updated_account

@app.delete("/accounts/{account_id}")
def delete_account(account_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.Account, account_id, current_user)
    deleted_account = crud.delete_account(db, account_id)
    if not deleted_account:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"message": "Account deleted successfully"}

def _backfill_transaction_types(engine):
    """Classify existing statement transactions that predate transaction_type.

    Each row is matched back to its statement line by (statement_id, row_index)
    so the bank's own type_line is used rather than guessing from the merchant
    name. Idempotent: only rows where transaction_type IS NULL are touched, so a
    value set by hand or by a later import is never overwritten.
    """
    import transaction_types as _tt
    from sqlalchemy import text as _text
    try:
        with engine.connect() as conn:
            pending = conn.execute(_text(
                "SELECT COUNT(*) FROM transactions WHERE transaction_type IS NULL"
            )).scalar()
            if not pending:
                return
            # Pull the statement's bank_key too, so bank-specific wording is
            # applied to the right rows (an Aljazira loan leg vs an Al Rajhi one).
            rows = conn.execute(_text(
                "SELECT t.id, sl.type_line, t.type, s.bank_key "
                "FROM transactions t "
                "LEFT JOIN statement_lines sl "
                "  ON sl.statement_id = t.statement_id "
                " AND sl.row_index = t.statement_row_index "
                "LEFT JOIN statements s ON s.id = t.statement_id "
                "WHERE t.transaction_type IS NULL"
            )).fetchall()
            updates = {}
            for tx_id, type_line, direction, bank_key in rows:
                updates.setdefault(
                    _tt.classify_type_line(type_line, direction, bank_key=bank_key), []
                ).append(tx_id)
            for ttype, ids in updates.items():
                for i in range(0, len(ids), 500):        # chunk to keep the IN() sane
                    chunk = ids[i:i + 500]
                    conn.execute(
                        _text("UPDATE transactions SET transaction_type = :t WHERE id IN :ids"),
                        {"t": ttype, "ids": tuple(chunk)},
                    )
            conn.commit()
            print(f"Backfilled transaction_type for {len(rows)} transactions: "
                  + ", ".join(f"{k}={len(v)}" for k, v in sorted(updates.items())))
    except Exception as exc:  # never block startup on a backfill
        logger.warning(f"transaction_type backfill skipped: {exc}")


def _backfill_statement_banks(engine):
    """Detect and store bank_key for statements imported before detection existed.

    Reads each statement's first page. Best-effort and idempotent: only fills
    rows where bank_key IS NULL, and a statement whose PDF is gone is skipped.
    Runs before the transaction-type backfill so that can be bank-aware.
    """
    import statement_parser as _sp
    from sqlalchemy import text as _text
    try:
        import pdfplumber
    except ImportError:
        return
    try:
        with engine.connect() as conn:
            rows = conn.execute(_text(
                "SELECT id, file_path FROM statements WHERE bank_key IS NULL"
            )).fetchall()
            done = 0
            for sid, path in rows:
                if not path or not os.path.exists(path):
                    continue
                try:
                    with pdfplumber.open(path) as pdf:
                        text_ = _sp.normalize_arabic(pdf.pages[0].extract_text() or "") if pdf.pages else ""
                    # parse_header does the IBAN-code detection internally.
                    hdr = _sp.parse_header(text_)
                    key, name = hdr.bank_key, hdr.bank_name
                except Exception:
                    continue
                if key:
                    # bank_name is set from detection too — an earlier bad guess
                    # or an upload default may have left a wrong name behind.
                    conn.execute(
                        _text("UPDATE statements SET bank_key = :k, bank_name = :n WHERE id = :id"),
                        {"k": key, "n": name, "id": sid},
                    )
                    done += 1
            if done:
                conn.commit()
                print(f"Backfilled bank_key for {done} statements")
    except Exception as exc:
        logger.warning(f"bank_key backfill skipped: {exc}")


# Run here rather than beside run_migrations() because the module executes top to
# bottom and these functions are defined above this point. Banks first, so the
# transaction-type backfill below can scope wording by bank.
_backfill_statement_banks(engine)
_backfill_transaction_types(engine)


def _recalculate_account_balance(db: Session, account_id: str):
    """
    Internal helper: recalculate account balance from all transactions.
    
    Processes transactions in order:
    1. Statement transactions sorted by (statement_id, statement_row_index) — bank processing order
    2. Non-statement transactions sorted by timestamp
    
    The system computes its own balance chain independently from the bank.
    Uses integer-cent arithmetic to avoid floating-point drift.
    """
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        return None
    
    old_balance = account.current_balance
    
    # Get all transactions on this account
    all_txs = db.query(models.Transaction).filter(
        models.Transaction.account_id == account_id
    ).all()
    
    if not all_txs:
        return {"old_balance": old_balance, "new_balance": old_balance, "transaction_count": 0, "corrections": 0}
    
    # Separate statement vs non-statement transactions
    stmt_txs = [tx for tx in all_txs if tx.source == "statement" and tx.statement_row_index is not None]
    non_stmt_txs = [tx for tx in all_txs if tx not in stmt_txs]
    
    # Order the statements CHRONOLOGICALLY, then by row_index within each.
    #
    # This used to sort by statement_id, which is a UUID — so with more than one
    # statement on an account the statements replayed in random order. On the
    # Expense account the newer statement (Jun 25 - Jul 16) sorted before the
    # older one (Jan 25 - Jun 24), so the baseline was reverse-engineered from
    # the newer statement's opening row and the older statement's transactions
    # were applied on top of it, inverting the chain and leaving the balance
    # 164.34 short of the statement's closing figure.
    #
    # row_index within a statement is kept — that is the bank's own processing
    # order, which can differ from the timestamp order.
    stmt_ids = {tx.statement_id for tx in stmt_txs if tx.statement_id}
    stmt_by_id = {}
    stmt_order = {}
    if stmt_ids:
        for s in db.query(models.Statement).filter(models.Statement.id.in_(stmt_ids)).all():
            stmt_by_id[s.id] = s
            if s.statement_period_start:
                stmt_order[s.id] = str(s.statement_period_start)
    for sid in stmt_ids:
        # No period on the statement — fall back to its earliest transaction.
        if sid not in stmt_order:
            dates = [tx.timestamp for tx in stmt_txs if tx.statement_id == sid and tx.timestamp]
            stmt_order[sid] = min(dates).isoformat() if dates else ""

    stmt_txs.sort(key=lambda tx: (stmt_order.get(tx.statement_id, ""), tx.statement_row_index or 0))
    
    # Sort non-statement transactions by timestamp
    non_stmt_txs.sort(key=lambda tx: (tx.timestamp or datetime(2000, 1, 1)))
    
    # Build ordered transaction list: statement transactions first, then non-statement
    ordered_txs = stmt_txs + non_stmt_txs
    
    first_tx = ordered_txs[0]
    baseline = first_tx.balance_after_transaction
    corrections = 0

    # Prefer the earliest statement's OWN opening balance as the baseline.
    #
    # Reverse-engineering it from the first row's balance_after assumes that row
    # is chronologically first, but row_index is the bank's print order — on the
    # Expense account row 0 carried a balance_after of 419.82 while the statement
    # header declared an opening of 283.98, so the whole chain started 143.84 out
    # and the posted balance missed the statement's closing figure. The header is
    # what the bank asserts, and each statement's rows verify against it
    # (opening + credits - debits - fees == closing), so it is the trustworthy
    # anchor. Reverse-engineering stays as the fallback for statements that never
    # recorded an opening balance.
    opening_stmt = stmt_by_id.get(first_tx.statement_id) if stmt_txs else None
    if opening_stmt is not None and opening_stmt.opening_balance is not None:
        running_cents = round(float(opening_stmt.opening_balance) * 100)
        baseline = float(opening_stmt.opening_balance)
    elif baseline is not None:
        # Reverse-engineer the starting balance from the first tx
        if first_tx.type == "credit":
            running_cents = round((baseline - first_tx.amount) * 100)
        else:
            running_cents = round((baseline + first_tx.amount) * 100)
        if first_tx.fees:
            running_cents += round(first_tx.fees * 100)
    else:
        running_cents = 0
    
    # Replay all transactions in order
    for tx in ordered_txs:
        amount_cents = round(tx.amount * 100)
        fee_cents = round((tx.fees or 0) * 100)
        if tx.type == "credit":
            running_cents += amount_cents
        else:
            running_cents -= amount_cents
        running_cents -= fee_cents
        expected = running_cents / 100
        if tx.balance_after_transaction != expected:
            corrections += 1
        tx.balance_after_transaction = expected
    
    account.current_balance = running_cents / 100
    db.commit()
    
    total_txs = len(all_txs)
    
    return {
        "old_balance": round(old_balance, 2),
        "new_balance": account.current_balance,
        "baseline": baseline,
        "baseline_tx": first_tx.merchant or "Unknown" if first_tx else "N/A",
        "baseline_date": first_tx.timestamp.isoformat() if first_tx and first_tx.timestamp else "N/A",
        "transaction_count": total_txs,
        "corrections": corrections
    }


@app.post("/accounts/{account_id}/recalculate-balance")
def recalculate_account_balance(account_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Recalculate account balance using the first transaction as baseline, then replaying forward."""
    result = _recalculate_account_balance(db, account_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Account not found")
    result["message"] = "Balance recalculated from first transaction baseline"
    result["account_id"] = account_id
    return result

@app.post("/accounts/recalculate-all-balances")
def recalculate_all_account_balances(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
def create_credit_card(card: schemas.CreditCardCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.create_credit_card(db=db, card=card, user_id=current_user.id)

@app.get("/credit-cards/", response_model=List[schemas.CreditCard])
def read_credit_cards(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.CreditCard).filter(models.CreditCard.user_id == current_user.id).offset(skip).limit(limit).all()

@app.get("/credit-cards/{card_id}", response_model=schemas.CreditCard)
def read_credit_card(card_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return _require_owned(db, models.CreditCard, card_id, current_user)

@app.put("/credit-cards/{card_id}", response_model=schemas.CreditCard)
def update_credit_card(card_id: str, card_update: schemas.CreditCardUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.CreditCard, card_id, current_user)
    updated_card = crud.update_credit_card(db, card_id, card_update)
    if not updated_card:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return updated_card

@app.delete("/credit-cards/{card_id}")
def delete_credit_card(card_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.CreditCard, card_id, current_user)
    deleted = crud.delete_credit_card(db, card_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Credit card not found")
    return {"message": "Credit card deleted successfully"}

@app.get("/credit-cards/{card_id}/transactions", response_model=List[schemas.Transaction])
def get_credit_card_transactions(card_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Get all transactions for a specific credit card"""
    _require_owned(db, models.CreditCard, card_id, current_user)
    transactions = db.query(models.Transaction).filter(
        models.Transaction.credit_card_id == card_id
    ).order_by(models.Transaction.timestamp.desc()).all()
    return transactions

@app.post("/credit-cards/{card_id}/payment")
def record_credit_card_payment(card_id: str, amount: float, from_account_id: Optional[str] = None, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Record a payment to a credit card (reduces balance)"""
    card = _require_owned(db, models.CreditCard, card_id, current_user)

    # Create the credit transaction on the card (payment = credit)
    from datetime import datetime
    tx_data = schemas.TransactionCreate(
        credit_card_id=card_id,
        amount=amount,
        merchant=f"Payment to {card.name}",
        category="Payment",
        type="credit",
        status="completed",
        timestamp=datetime.now(),
        user_id=current_user.id,
    )
    tx = crud.create_transaction(db, tx_data)
    
    # If paying from an account, create a corresponding debit there
    if from_account_id:
        account = db.query(models.Account).filter(
            models.Account.id == from_account_id,
            models.Account.user_id == current_user.id,
        ).first()
        if account:
            debit_tx = schemas.TransactionCreate(
                account_id=from_account_id,
                amount=amount,
                merchant=f"Credit Card Payment - {card.name}",
                category="Credit Card Payment",
                type="debit",
                status="completed",
                timestamp=datetime.now(),
                user_id=current_user.id,
            )
            crud.create_transaction(db, debit_tx)
    
    return {"message": f"Payment of {amount} SAR recorded", "new_balance": card.current_balance}

@app.post("/accounts/{account_id}/aliases", response_model=schemas.AccountAlias)
def create_alias(account_id: str, alias: schemas.AccountAliasCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Verify account exists and is owned by the caller
    _require_owned(db, models.Account, account_id, current_user)
    return crud.create_account_alias(db, account_id, alias)

@app.delete("/aliases/{alias_id}")
def delete_alias(alias_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Verify the alias's parent account belongs to the caller before deleting.
    alias = db.query(models.AccountAlias).filter(models.AccountAlias.id == alias_id).first()
    if alias is not None:
        _require_owned(db, models.Account, alias.account_id, current_user)
    deleted = crud.delete_account_alias(db, alias_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alias not found")
    return {"message": "Alias deleted"}

# --- Loan Endpoints ---
@app.post("/loans/", response_model=schemas.Loan)
def create_loan(loan: schemas.LoanCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.create_loan(db=db, loan=loan, user_id=current_user.id)

@app.get("/loans/", response_model=List[schemas.Loan])
def read_loans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    loans = db.query(models.Loan).filter(models.Loan.user_id == current_user.id).order_by(models.Loan.display_order.asc(), models.Loan.name.asc()).offset(skip).limit(limit).all()
    return loans

@app.put("/loans/reorder")
def reorder_loans(payload: schemas.ReorderSchema, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    crud.reorder_loans(db, payload.ordered_ids)
    return {"status": "success"}

@app.put("/loans/{loan_id}", response_model=schemas.Loan)
def update_loan(loan_id: str, loan_update: schemas.LoanUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.Loan, loan_id, current_user)
    updated_loan = crud.update_loan(db, loan_id, loan_update)
    if not updated_loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if not updated_loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    return updated_loan

@app.delete("/loans/{loan_id}", response_model=schemas.Loan)
def delete_loan(loan_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.Loan, loan_id, current_user)
    deleted = crud.delete_loan(db, loan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Loan not found")
    return deleted

# --- Obligation Endpoints ---
@app.post("/obligations/", response_model=schemas.Obligation)
def create_obligation(obligation: schemas.ObligationCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.create_obligation(db=db, obligation=obligation, user_id=current_user.id)

@app.get("/obligations/", response_model=List[schemas.Obligation])
def read_obligations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.MonthlyObligation).filter(models.MonthlyObligation.user_id == current_user.id).order_by(models.MonthlyObligation.display_order.asc(), models.MonthlyObligation.due_day.asc()).offset(skip).limit(limit).all()

@app.put("/obligations/reorder")
def reorder_obligations(payload: schemas.ReorderSchema, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    crud.reorder_obligations(db, payload.ordered_ids)
    return {"status": "success"}

@app.put("/obligations/{obligation_id}", response_model=schemas.Obligation)
def update_obligation(obligation_id: str, obligation_update: schemas.ObligationUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.MonthlyObligation, obligation_id, current_user)
    updated_obj = crud.update_obligation(db, obligation_id, obligation_update)
    if not updated_obj:
        raise HTTPException(status_code=404, detail="Obligation not found")
    return updated_obj

_HINT_STOPWORDS = {"payment", "transfer", "the", "and", "for", "pos", "purchase",
                   "apple", "pay", "bank", "local", "internal", "sar", "from",
                   "bill", "credit", "card", "account", "debit", "com", "riy"}


def _derive_match_hints(db, obligation, user_id):
    """Infer match hints from the transactions already linked to this obligation's
    payments — the account they share, the days they land on, and the words common
    to their descriptions. A hint is only returned when the history clearly
    supports it (strong account majority, a tight day range, repeated words), so a
    noisy obligation doesn't get bad hints."""
    from collections import Counter
    ids = set()
    for p in db.query(models.Payment).filter(models.Payment.obligation_id == obligation.id).all():
        if p.transaction_id:
            ids.add(p.transaction_id)
        for j in db.query(models.PaymentTransaction).filter(models.PaymentTransaction.payment_id == p.id).all():
            ids.add(j.transaction_id)
    if not ids:
        return {"match_account_id": None, "match_text": None, "match_day_from": None,
                "match_day_to": None, "sample_count": 0}
    txs = db.query(models.Transaction).filter(
        models.Transaction.id.in_(ids), models.Transaction.user_id == user_id).all()
    n = len(txs)

    accts = Counter(t.account_id for t in txs if t.account_id)
    match_account_id = None
    if accts:
        top, cnt = accts.most_common(1)[0]
        if cnt >= max(2, 0.6 * n):          # clear majority in one account
            match_account_id = top

    days = [t.timestamp.day for t in txs if t.timestamp]
    match_day_from = match_day_to = None
    if days and (max(days) - min(days)) <= 12:   # a tight window is useful; a wide one isn't
        match_day_from = max(1, min(days) - 2)
        match_day_to = min(31, max(days) + 2)

    toks = Counter()
    for t in txs:
        words = {w.lower() for w in re.split(r"[^A-Za-z0-9]+", (t.merchant or ""))
                 if len(w) > 2 and not w.isdigit() and w.lower() not in _HINT_STOPWORDS}
        toks.update(words)
    common = [w for w, c in toks.most_common(4) if c >= max(2, n / 2)]
    match_text = " ".join(common[:2]) or None

    return {"match_account_id": match_account_id, "match_text": match_text,
            "match_day_from": match_day_from, "match_day_to": match_day_to, "sample_count": n}


@app.get("/obligations/{obligation_id}/suggest-hints")
def suggest_obligation_hints(obligation_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Match hints inferred from this obligation's already-linked transactions."""
    _require_owned(db, models.MonthlyObligation, obligation_id, current_user)
    obl = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
    return _derive_match_hints(db, obl, current_user.id)


@app.delete("/obligations/{obligation_id}", response_model=schemas.Obligation)
def delete_obligation(obligation_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.MonthlyObligation, obligation_id, current_user)
    deleted_obj = crud.delete_obligation(db, obligation_id)
    if not deleted_obj:
        raise HTTPException(status_code=404, detail="Obligation not found")
    return deleted_obj

@app.get("/obligations/monthly-status")
def get_obligations_monthly_status(month_offset: int = 0, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Get payment status for all obligations for a given month.
    Returns paid/unpaid/overdue counts and per-obligation status.
    """
    from datetime import datetime
    now = datetime.now()
    # Month overflow handled with modular arithmetic (avoids datetime(year, 13, 1) crashes)
    year = now.year + ((now.month - 1 + month_offset) // 12)
    month = ((now.month - 1 + month_offset) % 12) + 1
    target_date = datetime(year, month, 1)

    month_str = f"{year}-{str(month).zfill(2)}"
    month_label = target_date.strftime("%B %Y")

    obligations = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.user_id == current_user.id).order_by(models.MonthlyObligation.display_order).all()

    # Get this month's payments for THIS user's obligations. billing_month is stored
    # in mixed widths ("YYYY-MM", "YYYY-MM-01", "YYYY-MM-DD"), so match by prefix.
    obl_ids = [o.id for o in obligations]
    all_payments = db.query(models.Payment).filter(
        models.Payment.obligation_id.in_(obl_ids),
        models.Payment.billing_month.like(f"{month_str}%")
    ).all() if obl_ids else []
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


# An obligation whose most recent payment is older than this many months is
# treated as inactive: it is not carried into the forecast (so a subscription you
# stopped paying, or a one-off, does not inflate next month's projected total).
STALE_AFTER_MONTHS = 3


def _months_since(billing_month, now):
    """Whole months between a payment's billing_month ('YYYY-MM' or 'YYYY-MM-DD')
    and now. Large/garbage values return a big number so they read as stale."""
    try:
        y, m = int(str(billing_month)[:4]), int(str(billing_month)[5:7])
        return (now.year - y) * 12 + (now.month - m)
    except (ValueError, TypeError):
        return 999


@app.get("/obligations/forecast")
def get_obligations_forecast(months_ahead: int = 1, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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

    obligations = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.user_id == current_user.id).order_by(models.MonthlyObligation.display_order).all()

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

            # Recency guard: if the last payment is older than STALE_AFTER_MONTHS,
            # treat the obligation as inactive and do NOT carry it forward — a
            # subscription you stopped, or a one-off, should not pad next month.
            months_since = _months_since(sorted_payments[0].billing_month or "", now)
            stale = months_since > STALE_AFTER_MONTHS

            # Forecast = last paid amount (user requirement), unless stale -> 0.
            forecast_amount = 0.0 if stale else round(last_paid, 2)

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
            stale = False
            months_since = None

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
            "stale": stale,
            "months_since_last": months_since,
        })

    return {
        "forecast_month": forecast_month,
        "forecast_label": forecast_label,
        "total_forecast": round(total_forecast, 2),
        "by_category": by_category,
        "obligations": result_obligations,
    }


def _has_match_hints(obl):
    return bool(obl.match_account_id or obl.match_text or obl.match_day_from or obl.match_day_to)


def _passes_match_hints(obl, tx):
    """A transaction must satisfy every SET match hint to be a candidate for an
    obligation that has them: same account, containing the match text (matched
    against merchant / notes / SMS; any one term suffices), and within the
    day-of-month window. Passing the hints is itself the qualifying evidence."""
    if obl.match_account_id and tx.account_id != obl.match_account_id:
        return False
    if obl.match_text:
        terms = [t.strip().lower() for t in re.split(r"[,\s]+", obl.match_text) if t.strip()]
        hay = " ".join(x for x in (tx.merchant, tx.notes, tx.raw_sms_content) if x).lower()
        if terms and not any(t in hay for t in terms):
            return False
    d = tx.timestamp.day if tx.timestamp else None
    lo, hi = obl.match_day_from, obl.match_day_to
    if d is not None:
        if lo and hi:
            in_window = (lo <= d <= hi) if lo <= hi else (d >= lo or d <= hi)
            if not in_window:
                return False
        elif lo and d < lo:
            return False
        elif hi and d > hi:
            return False
    return True


@app.get("/obligations/all-matches")
def get_all_obligation_matches(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Find transaction matches for ALL unpaid obligations in the current month.
    Returns a dict keyed by obligation_id with match arrays.
    """
    from datetime import datetime
    now = datetime.now()
    month_str = f"{now.year}-{str(now.month).zfill(2)}"

    obligations = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.user_id == current_user.id).all()

    # Get payments for current month to identify unpaid ones.
    # billing_month is stored in mixed widths, so match by prefix, not equality.
    current_payments = db.query(models.Payment).filter(
        models.Payment.billing_month.like(f"{month_str}%"),
        models.Payment.status.in_([models.PaymentStatus.PAID, "PAID"])
    ).all()
    paid_obl_ids = {p.obligation_id for p in current_payments}

    # Get all linked transaction IDs to exclude (scoped to this user's transactions)
    linked_tx_ids = set(
        tid for (tid,) in db.query(models.Payment.transaction_id).join(
            models.Transaction, models.Payment.transaction_id == models.Transaction.id
        ).filter(
            models.Payment.transaction_id.isnot(None),
            models.Transaction.user_id == current_user.id
        ).all()
    )
    # Also exclude junction-table linked txs
    linked_junction_ids = set(
        tid for (tid,) in db.query(models.PaymentTransaction.transaction_id).join(
            models.Transaction, models.PaymentTransaction.transaction_id == models.Transaction.id
        ).filter(
            models.Transaction.user_id == current_user.id
        ).all()
    )
    all_excluded = linked_tx_ids | linked_junction_ids

    # Get candidate transactions (debit, this month)
    search_start = datetime(now.year, now.month, 1)
    candidates = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
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
        has_hints = _has_match_hints(obl)

        matches = []
        for tx in candidates:
            if tx.id in all_excluded:
                continue

            score = 0
            reasons = []
            merchant_lower = (tx.merchant or "").lower()
            notes_lower = (tx.notes or "").lower()

            if has_hints:
                # Explicit match rule: the transaction must satisfy the obligation's
                # account/text/day hints. Passing them IS the qualifying evidence.
                if not _passes_match_hints(obl, tx):
                    continue
                score = 60
                reasons.append("match_rule")
            else:
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

                # ---- DESCRIPTION IS REQUIRED ----
                # Everything above is description evidence. Amount is NOT a reliable
                # signal here: a BUDGET figure is only an estimate of the last paid
                # amount, so the real transaction routinely differs. Without any
                # description evidence, an amount/date coincidence must never surface
                # an unrelated transaction as a match. Amount only ranks from here.
                if score == 0:
                    continue

            # Amount match (ranking booster only — cannot qualify a match on its own)
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
def get_obligation_matches(obligation_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. Get Obligation (ownership-scoped)
    obligation = _require_owned(db, models.MonthlyObligation, obligation_id, current_user)

    # 2. Get Search Date Range (Current Month)
    today = datetime.now()
    # Look back 5 days before start of month for early payments
    search_start = datetime(today.year, today.month, 1)

    # 3. Keyword Extraction (Simple: First word of name or strict name)
    keyword = obligation.name.split(" ")[0].lower() # e.g. "Stc" from "STC Internet"
    
    # 4. Search Candidates
    # Criteria: Debit type, timestamp >= search_start, owned by caller
    query = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.timestamp >= search_start,
        models.Transaction.type == 'debit'
    )

    candidates = query.all()

    # 5. Filter Candidates (Python side for flexibility)
    matches = []

    # Get all linked Transaction IDs to exclude (scoped to this user's transactions)
    linked_tx_ids = [
        tid for (tid,) in db.query(models.Payment.transaction_id).join(
            models.Transaction, models.Payment.transaction_id == models.Transaction.id
        ).filter(
            models.Payment.transaction_id != None,
            models.Transaction.user_id == current_user.id
        ).all()
    ]
    
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

        # ---- DESCRIPTION IS REQUIRED (A-D above are description evidence) ----
        # A BUDGET amount is only an estimate of the last paid amount, so the real
        # transaction routinely differs — amount must never qualify a match by
        # itself, only rank one that already matched on description.
        if match_score == 0:
            continue

        # E. Amount Match (ranking booster only — cannot qualify on its own)
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
def pay_obligation(obligation_id: str, payment: schemas.PaymentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Verify obligation exists and is owned by the caller
    _require_owned(db, models.MonthlyObligation, obligation_id, current_user)

    try:
        return crud.create_payment(db=db, obligation_id=obligation_id, payment=payment)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/obligations/{obligation_id}/payments")
def read_obligation_payments(obligation_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.MonthlyObligation, obligation_id, current_user)
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
                        "raw_sms_content": tx.raw_sms_content,
                        "notes": tx.notes,
                        "link_source": getattr(link, 'link_source', None),
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
            "source": getattr(p, 'source', None),
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
def read_obligation_history_legacy(obligation_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.MonthlyObligation, obligation_id, current_user)
    return crud.get_payments(db, obligation_id)

@app.delete("/obligations/history/{payment_id}") # Backward compat URL for frontend
def delete_payment(payment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned_payment(db, payment_id, current_user)
    killed = crud.delete_payment(db, payment_id)
    if not killed:
        raise HTTPException(status_code=404, detail="Payment entry not found")
    return {"message": "Payment deleted"}

@app.put("/obligations/history/{payment_id}", response_model=schemas.Payment) # Backward compat URL
def update_payment(payment_id: int, payment_update: schemas.PaymentUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned_payment(db, payment_id, current_user)
    updated = crud.update_payment(db, payment_id, payment_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Payment entry not found")
    return updated

# --- Auto-Match Obligations to Transactions ---
@app.post("/obligations/auto-match")
def auto_match_obligations(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Batch process: Scan unpaid obligations for the current and previous month.

    For each, find a debit transaction within ±5 days of due_day that matches the
    obligation BY DESCRIPTION (name/provider/notes). Amount is not a filter — a
    BUDGET is only an estimate of the last paid amount, so the actual transaction
    routinely differs; amount/date only rank the description-matched candidates.
    Creates a PAID payment (recording the transaction's real amount, with the
    estimate kept as planned_amount) with source='auto' and links the transaction.
    Idempotent — safe to run repeatedly.
    """
    from datetime import datetime, timedelta
    import calendar
    import logging

    logger = logging.getLogger("auto_match")
    now = datetime.now()

    # Target current month and previous month
    target_months = []
    for offset in [0, -1]:  # Current month and previous month
        y = now.year + ((now.month - 1 + offset) // 12)
        m = ((now.month - 1 + offset) % 12) + 1
        target_months.append((y, m, f"{y}-{str(m).zfill(2)}"))

    obligations = db.query(models.MonthlyObligation).filter(
        models.MonthlyObligation.user_id == current_user.id
    ).all()

    # Get ALL existing paid payments for the target months to check what's already done
    from sqlalchemy import or_
    month_filters = [models.Payment.billing_month.like(f"{bm}%") for _, _, bm in target_months]
    existing_payments = db.query(models.Payment).filter(
        or_(*month_filters),
        models.Payment.status == models.PaymentStatus.PAID
    ).all()
    paid_set = {(p.obligation_id, p.billing_month[:7]) for p in existing_payments}

    # Get ALL transactions already linked to any payment (via junction table or transaction_id)
    linked_tx_ids = set()
    # Junction table links
    junction_links = db.query(models.PaymentTransaction.transaction_id).all()
    linked_tx_ids.update(j[0] for j in junction_links)
    # Legacy direct links
    legacy_links = db.query(models.Payment.transaction_id).filter(
        models.Payment.transaction_id.isnot(None)
    ).all()
    linked_tx_ids.update(l[0] for l in legacy_links)

    # Get expected amounts per obligation (from BUDGET entries or most recent PAID)
    def get_expected_amount(obl, billing_month_prefix):
        # 1. Check for BUDGET entry
        budget = db.query(models.Payment).filter(
            models.Payment.obligation_id == obl.id,
            models.Payment.billing_month.like(f"{billing_month_prefix}%"),
            models.Payment.status == models.PaymentStatus.BUDGET
        ).first()
        if budget and budget.amount:
            return budget.amount

        # 2. Most recent PAID amount
        recent_paid = db.query(models.Payment).filter(
            models.Payment.obligation_id == obl.id,
            models.Payment.status == models.PaymentStatus.PAID
        ).order_by(models.Payment.billing_month.desc()).first()
        if recent_paid and recent_paid.amount:
            return recent_paid.amount

        # 3. Base obligation amount
        return obl.amount

    matched = []
    skipped = []

    for year, month, bm_prefix in target_months:
        for obl in obligations:
            # Skip if already paid for this month
            if (obl.id, bm_prefix) in paid_set:
                continue

            expected_amount = get_expected_amount(obl, bm_prefix)
            if not expected_amount or expected_amount <= 0:
                skipped.append({"name": obl.name, "month": bm_prefix, "reason": "no_expected_amount"})
                continue

            # Calculate due date and search window (±5 days)
            due_day = obl.due_day or 1
            last_day = calendar.monthrange(year, month)[1]
            actual_due_day = min(due_day, last_day)
            try:
                due_date = datetime(year, month, actual_due_day)
            except ValueError:
                skipped.append({"name": obl.name, "month": bm_prefix, "reason": "invalid_date"})
                continue

            start_date = due_date - timedelta(days=5)
            end_date = due_date + timedelta(days=5)

            # Candidate debits in the ±5 day window. Amount is deliberately NOT a
            # filter: a BUDGET is only an estimate of the last paid amount, so the
            # real transaction routinely differs (and exact float equality would
            # rarely match anyway).
            candidates = db.query(models.Transaction).filter(
                models.Transaction.user_id == current_user.id,
                models.Transaction.timestamp >= start_date,
                models.Transaction.timestamp <= end_date,
                models.Transaction.type == "debit",
            ).order_by(models.Transaction.timestamp).all()

            # DESCRIPTION-FIRST: a transaction must match the obligation by
            # description to be considered at all; amount/date only rank the
            # survivors. This endpoint CREATES a PAID payment, so an amount
            # coincidence must never be enough on its own.
            keyword = (obl.name or "").lower()
            provider_lower = (obl.provider or "").lower()
            note_keywords = [w.lower() for w in (obl.notes or "").split() if len(w) > 2]

            matched_tx = None
            best_score = 0
            for tx in candidates:
                if tx.id in linked_tx_ids:
                    continue
                merchant_lower = (tx.merchant or "").lower()
                notes_lower = (tx.notes or "").lower()

                score = 0
                if keyword and (keyword in merchant_lower or keyword in notes_lower):
                    score += 50
                if provider_lower and len(provider_lower) > 2 and (
                        provider_lower in merchant_lower or provider_lower in notes_lower):
                    score += 40
                for k in note_keywords:
                    if k in merchant_lower or k in notes_lower:
                        score += 30
                        break
                if score == 0:
                    continue  # no description evidence -> never auto-create a payment

                # Rank only: amount closeness, then proximity to the due date
                if expected_amount and tx.amount:
                    diff = abs(tx.amount - expected_amount)
                    if diff == 0:
                        score += 20
                    elif diff / expected_amount <= 0.1:
                        score += 10
                if tx.timestamp:
                    score += max(0, 5 - abs((tx.timestamp - due_date).days))

                if score > best_score:
                    best_score = score
                    matched_tx = tx

            if not matched_tx:
                skipped.append({"name": obl.name, "month": bm_prefix, "reason": "no_matching_transaction"})
                continue

            # Create payment record
            billing_month_str = f"{bm_prefix}-01"
            new_payment = models.Payment(
                obligation_id=obl.id,
                user_id=current_user.id,
                # Record what was ACTUALLY paid (the transaction), keeping the
                # estimate as planned_amount — the two legitimately differ.
                amount=matched_tx.amount if matched_tx.amount is not None else expected_amount,
                planned_amount=expected_amount,
                payment_date=matched_tx.timestamp.date() if matched_tx.timestamp else now.date(),
                billing_month=billing_month_str,
                status=models.PaymentStatus.PAID,
                source="auto",
                note=f"Auto-matched to {matched_tx.merchant or matched_tx.id[:8]}"
            )
            db.add(new_payment)
            db.flush()  # Get the payment ID

            # Link via junction table
            link = models.PaymentTransaction(
                payment_id=new_payment.id,
                transaction_id=matched_tx.id,
                link_source='auto'
            )
            db.add(link)

            # Mark this transaction as linked so we don't double-link
            linked_tx_ids.add(matched_tx.id)
            # Mark this obligation+month as paid so we don't duplicate
            paid_set.add((obl.id, bm_prefix))

            matched.append({
                "obligation": obl.name,
                "month": bm_prefix,
                "amount": expected_amount,
                "transaction_merchant": matched_tx.merchant,
                "transaction_date": matched_tx.timestamp.isoformat() if matched_tx.timestamp else None,
                "payment_id": new_payment.id
            })

            logger.info(f"Auto-matched: {obl.name} ({bm_prefix}) -> {matched_tx.merchant} ({expected_amount})")

    db.commit()

    return {
        "total_matched": len(matched),
        "total_skipped": len(skipped),
        "matched": matched,
        "skipped": skipped
    }

# --- Payment-Transaction Linking Endpoints ---
@app.get("/payments/{payment_id}/suggested-transactions")
def get_suggested_transactions(payment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Suggest transactions that might match this payment.
    Matching criteria:
    - Date within ±5 days of billing month's due date
    - Amount within 10% tolerance
    - Merchant name contains obligation/provider name
    """
    # Get the payment (ownership-scoped via its obligation)
    payment = _require_owned_payment(db, payment_id, current_user)

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
    
    # Query transactions in date range (scoped to caller's transactions)
    transactions = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
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
    has_hints = _has_match_hints(obligation)

    for tx in transactions:
        score = 0
        reasons = []
        merchant_lower = (tx.merchant or "").lower()
        notes_lower = (tx.notes or "").lower()

        if has_hints:
            # Explicit match rule (account / text / day window). Passing it is the
            # qualifying evidence; a transaction that fails any set hint is excluded.
            if not _passes_match_hints(obligation, tx):
                continue
            score = 60
            reasons.append("match_rule")
            qualified = True
        else:
            # Description matching FIRST — the primary signal. Also look in the
            # transaction notes, which carry the statement's own description text.
            for term in search_terms:
                if term and (term in merchant_lower or term in notes_lower):
                    score += 40
                    reasons.append("name_match")
                    break

            # ---- DESCRIPTION IS REQUIRED TO *QUALIFY* ----
            # The payment amount is only an estimate (a BUDGET is derived from the
            # last paid amount), so the real transaction routinely differs. A
            # transaction whose amount merely looks close must never be treated as a
            # real match — that is how the wrong transaction gets auto-linked.
            #
            # But for many obligations the statement text is generic ("Loan
            # Instalment", a bare first name), so nothing matches by description and
            # the user is left with an empty list. Those still surface as UNQUALIFIED
            # candidates: ranked below every real match, flagged for the UI, and —
            # critically — never eligible for auto-linking (see `qualified` below).
            qualified = score > 0

        # Amount matching (ranking booster only — cannot qualify on its own)
        if payment_amount > 0 and tx.amount:
            diff_pct = abs(tx.amount - payment_amount) / payment_amount * 100
            if diff_pct < 1:
                score += 50
                reasons.append("exact_amount")
            elif diff_pct < 10:
                score += 30
                reasons.append("similar_amount")

        # Date proximity bonus
        if tx.timestamp:
            days_diff = abs((tx.timestamp.date() - target_date.date()).days)
            if days_diff == 0:
                score += 20
                reasons.append("exact_date")
            elif days_diff <= 2:
                score += 10
                reasons.append("close_date")
        
        # Unqualified candidates need *some* signal of their own to be worth
        # showing at all — a close amount, or a transaction on the due date.
        if not qualified and not any(
            r in reasons for r in ("exact_amount", "similar_amount", "exact_date")
        ):
            continue

        suggestions.append({
            "transaction_id": tx.id,
            "merchant": tx.merchant,
            "amount": tx.amount,
            "date": tx.timestamp.isoformat() if tx.timestamp else None,
            "score": score,
            "reasons": reasons,
            # Only a description match qualifies. The auto-linker must check this
            # flag, not the score — an unqualified row can still score highly on
            # amount+date alone, and auto-linking it is the exact failure mode
            # this gate exists to prevent.
            "qualified": qualified,
            "already_linked": tx.id == payment.transaction_id,
            "raw_sms_content": tx.raw_sms_content
        })

    # Every qualified match ranks above every guess, then by score.
    suggestions.sort(key=lambda x: (x["qualified"], x["score"]), reverse=True)

    return suggestions[:25]

@app.post("/payments/{payment_id}/link-transaction")
def link_payment_to_transaction(payment_id: int, transaction_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Link a payment to a transaction and mark it as paid."""
    # Get the payment (ownership-scoped via its obligation)
    payment = _require_owned_payment(db, payment_id, current_user)

    # Verify transaction exists and belongs to the caller
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.user_id == current_user.id
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Update payment
    payment.transaction_id = transaction_id
    # A BUDGET row is a PLAN, not an actual payment — attaching a transaction to it
    # must not silently convert it to PAID. Any other status still promotes to PAID.
    # (status is stored as VARCHAR against an Enum column, so compare both forms.)
    if payment.status not in (models.PaymentStatus.BUDGET, "BUDGET"):
        payment.status = models.PaymentStatus.PAID

    db.commit()
    # The linked transaction is the actual money that moved, so make the payment
    # amount reflect it (BUDGET plans keep their planned figure — see the helper).
    _sync_payment_amount_from_links(db, payment_id)
    db.commit()
    db.refresh(payment)

    return {
        "message": "Payment linked successfully",
        "payment_id": payment.id,
        "transaction_id": transaction_id,
        "status": payment.status.value
    }

@app.delete("/payments/{payment_id}/unlink-transaction")
def unlink_payment_transaction(payment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Remove the link between a payment and its transaction."""
    payment = _require_owned_payment(db, payment_id, current_user)

    payment.transaction_id = None
    db.commit()

    return {"message": "Transaction unlinked"}

# --- Transaction Endpoints ---
@app.get("/transactions/")
def read_transactions(skip: int = 0, limit: int = 1000, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    txs = db.query(models.Transaction).filter(models.Transaction.user_id == current_user.id).order_by(models.Transaction.timestamp.desc()).offset(skip).limit(limit).all()
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
def update_transaction(transaction_id: str, transaction_update: schemas.TransactionUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.Transaction, transaction_id, current_user)
    updated_tx = crud.update_transaction(db, transaction_id, transaction_update)
    if not updated_tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return updated_tx

@app.post("/transactions/", response_model=schemas.Transaction)
def create_transaction(transaction: schemas.TransactionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Verify the target account or credit card exists AND belongs to this user
    if transaction.account_id:
        account = db.query(models.Account).filter(
            models.Account.id == transaction.account_id,
            models.Account.user_id == current_user.id,
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
    elif transaction.credit_card_id:
        cc = db.query(models.CreditCard).filter(
            models.CreditCard.id == transaction.credit_card_id,
            models.CreditCard.user_id == current_user.id,
        ).first()
        if not cc:
            raise HTTPException(status_code=404, detail="Credit card not found")
    else:
        raise HTTPException(status_code=400, detail="Either account_id or credit_card_id is required")
    transaction.user_id = current_user.id
    return crud.create_transaction(db=db, transaction=transaction)

@app.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.Transaction, transaction_id, current_user)
    deleted = crud.delete_transaction(db, transaction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted"}

@app.put("/transactions/{transaction_id}/resolve-discrepancy")
def resolve_discrepancy(transaction_id: str, body: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Resolve a balance discrepancy on a CC transaction."""
    import json as _json
    from datetime import datetime as _dt

    tx = _require_owned(db, models.Transaction, transaction_id, current_user)
    
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
def bulk_delete_transactions(payload: schemas.BulkDeleteRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    deleted_count = 0
    for tx_id in payload.ids:
        # Only delete transactions the caller owns; silently skip others.
        owned = db.query(models.Transaction).filter(
            models.Transaction.id == tx_id,
            models.Transaction.user_id == current_user.id,
        ).first()
        if not owned:
            continue
        crud.delete_transaction(db, tx_id)
        deleted_count += 1
    return {"message": f"Deleted {deleted_count} transactions"}

@app.post("/transactions/{transaction_id}/complete-transfer")
def complete_pending_transfer(transaction_id: str, source_account_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Complete a pending internal transfer by specifying the source account.
    This will:
    1. Mark the credit transaction as completed
    2. Create a corresponding debit transaction on the source account
    """
    # Get the pending transaction (must belong to the caller)
    pending_tx = _require_owned(db, models.Transaction, transaction_id, current_user)

    # Validate a real (non-"external") source account is owned by the caller
    if source_account_id != "external":
        _require_owned(db, models.Account, source_account_id, current_user)

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
def get_pending_transactions(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Get all pending transactions that need user action"""
    pending = db.query(models.Transaction).filter(
        models.Transaction.status == "pending_action",
        models.Transaction.user_id == current_user.id
    ).order_by(models.Transaction.timestamp.desc()).all()
    return pending

@app.get("/queue/status")
def get_queue_status(db: Session = Depends(get_db)):
    """Get current transaction queue status"""
    return queue_processor.get_queue_status(db)

@app.get("/queue/blocked")
def get_blocked_transactions(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
def get_allocation_analysis(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return analysis.calculate_allocation(db, user_id=current_user.id)


# --- SMS name enrichment ---------------------------------------------------
# Overwrite ONLY the counterparty name on already-imported statement rows using
# the real names carried in a bulk bank-SMS export. Never creates, deletes, or
# re-amounts anything. See sms_enrichment.py for the parser and match rules.

_GENERIC_STATEMENT_SOURCE = "statement"

# Uploaded SMS exports are kept so the enrichment can be re-run later (after a
# parser improvement, or once more statements are imported) without the user
# having to find the file again.
from pathlib import Path as _Path
SMS_UPLOADS_DIR = _Path("/app/sms_uploads")
SMS_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _user_sms_dir(user_id: str) -> "_Path":
    d = SMS_UPLOADS_DIR / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _read_stored_sms(user_id: str):
    """Return (raw_texts, file_infos) for every SMS export this user has uploaded."""
    raws, infos = [], []
    for p in sorted(_user_sms_dir(user_id).glob("*.txt")):
        try:
            raws.append(p.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            continue
        stat = p.stat()
        # stored as "<uuid>__<original name>.txt"
        original = p.name.split("__", 1)[1] if "__" in p.name else p.name
        infos.append({
            "id": p.name.split("__", 1)[0],
            "filename": original,
            "size": stat.st_size,
            "uploaded_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return raws, infos


def _account_name_map(db: Session, user_id: str) -> dict:
    """last-4 -> account name, so own-account transfers can be named after their
    destination account."""
    out = {}
    for a in db.query(models.Account).filter(models.Account.user_id == user_id).all():
        if a.last_4_digits:
            out[str(a.last_4_digits)[-4:]] = a.name
    return out


def _statement_txrows(db: Session, user_id: str) -> List[sms_enrichment.TxRow]:
    """The user's statement-imported transactions, projected for the matcher."""
    rows = db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id,
        models.Transaction.source == _GENERIC_STATEMENT_SOURCE,
        models.Transaction.timestamp.isnot(None),
    ).all()
    # Bank per statement, so date-only rows only match same-bank SMS.
    sids = {r.statement_id for r in rows if r.statement_id}
    banks = {}
    if sids:
        for sid, bank in db.query(models.Statement.id, models.Statement.bank_key).filter(
            models.Statement.id.in_(sids)
        ).all():
            banks[sid] = bank
    return [
        sms_enrichment.TxRow(
            id=r.id, timestamp=r.timestamp,
            amount=float(r.amount or 0), type=r.type, merchant=r.merchant,
            bank=banks.get(r.statement_id),
        )
        for r in rows
    ]


def _enrich_response(result, sources=None):
    """Shared payload for the preview and re-run endpoints."""
    payload = {
        "stats": result.stats,
        "skipped": result.skipped,
        "coverage": result.coverage,
        "proposals": [
            {
                "transaction_id": p.transaction_id,
                "old_merchant": p.old_merchant,
                "new_merchant": p.new_merchant,
                "amount": p.amount,
                "direction": p.direction,
                "tx_timestamp": p.tx_timestamp.isoformat(),
                "sms_timestamp": p.sms_timestamp.isoformat(),
                "delta_seconds": round(p.delta_seconds, 1),
                "shape": p.shape,
                "truncated": p.truncated,
                "raw_sms": p.raw_sms,
            }
            for p in result.proposals
        ],
    }
    if sources is not None:
        payload["sources"] = sources
    return payload


@app.get("/api/sms/enrich/sources")
def sms_enrich_sources(current_user: models.User = Depends(get_current_user)):
    """The SMS exports this user has uploaded, available for a re-run."""
    _, infos = _read_stored_sms(current_user.id)
    return {"sources": infos}


@app.post("/api/sms/enrich/rerun")
def sms_enrich_rerun(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Re-run enrichment over every stored SMS export, without re-uploading.

    Useful after the parser improves or more statements are imported. Rows already
    enriched are skipped by the generic-label gate, so this only ever fills gaps.
    """
    raws, infos = _read_stored_sms(current_user.id)
    if not raws:
        raise HTTPException(status_code=400, detail="No stored SMS exports yet — upload one first.")
    events = sms_enrichment.parse_exports(raws)
    txs = _statement_txrows(db, current_user.id)
    result = sms_enrichment.match(events, txs, account_names=_account_name_map(db, current_user.id))
    return _enrich_response(result, sources=infos)


@app.delete("/api/sms/enrich/sources/{source_id}")
def sms_enrich_delete_source(
    source_id: str,
    current_user: models.User = Depends(get_current_user),
):
    """Forget a stored SMS export so it no longer feeds re-runs."""
    if not re.fullmatch(r"[0-9a-f]{32}", source_id or ""):
        raise HTTPException(status_code=400, detail="Invalid source id")
    removed = 0
    for p in _user_sms_dir(current_user.id).glob(f"{source_id}__*"):
        try:
            p.unlink()
            removed += 1
        except OSError:
            pass
    return {"removed": removed}


@app.post("/api/sms/enrich/preview")
async def sms_enrich_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Parse an uploaded bulk-SMS .txt and return proposed name overwrites.
    Writes NOTHING — this is the dry-run half of the flow."""
    if not file.filename or not file.filename.lower().endswith((".txt", ".text")):
        raise HTTPException(status_code=400, detail="Only .txt SMS exports are accepted")
    contents = await file.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 8 MB)")
    try:
        raw = contents.decode("utf-8")
    except UnicodeDecodeError:
        raw = contents.decode("utf-8", errors="replace")

    # Keep the export so it can be re-run later without re-uploading.
    try:
        safe = re.sub(r"[^A-Za-z0-9._ -]", "_", os.path.basename(file.filename))[:80]
        if not safe.lower().endswith(".txt"):
            safe += ".txt"
        (_user_sms_dir(current_user.id) / f"{uuid.uuid4().hex}__{safe}").write_text(raw, encoding="utf-8")
    except OSError as exc:
        logger.warning(f"Could not store SMS export for re-run: {exc}")

    events = sms_enrichment.parse_export(raw)
    txs = _statement_txrows(db, current_user.id)
    result = sms_enrichment.match(events, txs, account_names=_account_name_map(db, current_user.id))

    return _enrich_response(result)


@app.post("/api/sms/enrich/apply")
def sms_enrich_apply(
    payload: schemas.EnrichApplyRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Apply approved name overwrites as one reversible batch. Re-validates every
    item server-side: owned, statement-sourced, and still a generic label. Uses a
    targeted column write — never crud.update_transaction, which would reverse and
    re-derive balance snapshots across the whole account for a name-only edit."""
    if not payload.items:
        raise HTTPException(status_code=400, detail="No items to apply")

    batch_id = uuid.uuid4().hex
    applied_at = datetime.utcnow()
    applied = 0
    failed = []

    for item in payload.items:
        new_name = (item.new_merchant or "").strip()[:255]
        if not new_name:
            failed.append({"transaction_id": item.transaction_id, "reason": "empty name"})
            continue
        tx = db.query(models.Transaction).filter(
            models.Transaction.id == item.transaction_id,
        ).first()
        if tx is None:
            failed.append({"transaction_id": item.transaction_id, "reason": "not found"})
            continue
        if tx.user_id is not None and tx.user_id != current_user.id:
            failed.append({"transaction_id": item.transaction_id, "reason": "not found"})
            continue
        if tx.source != _GENERIC_STATEMENT_SOURCE:
            failed.append({"transaction_id": item.transaction_id, "reason": "not a statement transaction"})
            continue
        if not sms_enrichment.is_generic_label(tx.merchant):
            failed.append({"transaction_id": item.transaction_id, "reason": "label no longer generic"})
            continue
        # Preserve the FIRST original only; a re-run must never clobber it.
        first_enrichment = tx.merchant_original is None
        if first_enrichment:
            tx.merchant_original = tx.merchant
        tx.merchant = new_name
        # Keep the SMS's reference fields (bill number, SADAD service, transfer
        # ref/IBAN) on the transaction's note. notes_original is captured with the
        # merchant on the first enrichment so undo restores it exactly.
        sms_note = sms_enrichment.extract_sms_note(item.raw_sms or "")
        if sms_note:
            if first_enrichment:
                # "" (not None) records "there was no note" so undo can tell a note
                # it added apart from one it never touched.
                tx.notes_original = tx.notes or ""
            # Append to the statement's own note rather than replace it, so the
            # counterparty/description it already carries is not lost.
            base = (tx.notes or "").strip()
            tx.notes = f"{base}\n{sms_note}" if base else sms_note
        tx.enrichment_batch_id = batch_id
        tx.enriched_at = applied_at
        applied += 1

    db.commit()
    return {"batch_id": batch_id, "applied": applied, "failed": failed}


@app.post("/transactions/link-transfers")
def link_internal_transfers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Pair up the two legs of each internal transfer for this user.

    The rows are left exactly as they are — this only records that a debit on one
    account and a credit on another are the same movement, so the pair can be
    shown as "Liability -> General". Only unambiguous pairs are linked; a
    repeated round-number transfer with several possible partners is left alone.
    """
    txs = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
    ).all()
    pairs, stats = transfer_linking.pair_internal_transfers(txs)
    linked = transfer_linking.apply_pairs(pairs)
    db.commit()
    logger.info(f"Linked {linked} internal transfer pairs for {current_user.username}: {stats}")
    return {"linked": linked, **stats}


@app.get("/api/sms/enrich/report")
def sms_enrich_report(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Coverage report over the stored exports and the CURRENT transactions.

    Read-only and repeatable: the coverage figures used to exist only inside a
    preview response, so they could be read once and not again without
    re-uploading. This recomputes them on demand and proposes nothing.
    """
    raws, infos = _read_stored_sms(current_user.id)
    txs = _statement_txrows(db, current_user.id)
    if not raws:
        return {
            "has_sources": False,
            "sources": infos,
            "coverage": {"transactions": len(txs)},
            "stats": {},
            "skipped": {},
        }
    result = sms_enrichment.match(sms_enrichment.parse_exports(raws), txs,
                                  account_names=_account_name_map(db, current_user.id))
    return {
        "has_sources": True,
        "sources": infos,
        "coverage": result.coverage,
        "stats": result.stats,
        "skipped": result.skipped,
    }


@app.get("/api/sms/enrich/batches")
def sms_enrich_batches(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Every enrichment batch this user has applied and can still reverse.

    Mirrors the statement flow: posting is reversible from the statement list at
    any time, so an applied enrichment should be reversible from a list too —
    not only on the screen that produced it.
    """
    rows = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.enrichment_batch_id.isnot(None),
    ).all()

    batches = {}
    for tx in rows:
        b = batches.setdefault(tx.enrichment_batch_id, {
            "batch_id": tx.enrichment_batch_id,
            "count": 0,
            "applied_at": None,
            "samples": [],
        })
        b["count"] += 1
        if tx.enriched_at and (b["applied_at"] is None or tx.enriched_at > b["applied_at"]):
            b["applied_at"] = tx.enriched_at
        if len(b["samples"]) < 3:
            b["samples"].append({"from": tx.merchant_original, "to": tx.merchant})

    out = sorted(batches.values(), key=lambda b: (b["applied_at"] is not None, b["applied_at"]), reverse=True)
    for b in out:
        b["applied_at"] = b["applied_at"].isoformat() if b["applied_at"] else None
    return {"batches": out}


@app.post("/api/sms/enrich/undo/{batch_id}")
def sms_enrich_undo(
    batch_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Restore the original statement labels for one enrichment batch."""
    rows = db.query(models.Transaction).filter(
        models.Transaction.enrichment_batch_id == batch_id,
        models.Transaction.user_id == current_user.id,
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No enrichment batch found to reverse")
    restored = 0
    for tx in rows:
        # Only count rows we can actually put back.
        if tx.merchant_original is not None:
            tx.merchant = tx.merchant_original
            restored += 1
        # Restore the note only if this batch changed it (notes_original set).
        if tx.notes_original is not None:
            tx.notes = tx.notes_original or None
            tx.notes_original = None
        tx.enrichment_batch_id = None
        tx.enriched_at = None
    db.commit()
    return {"batch_id": batch_id, "restored": restored, "affected": len(rows)}

# --- Background SMS Processing ---
async def _process_sms_background(raw_msg_id: str, sender: str, body: str, source: str = "webhook"):
    """
    Process an SMS message in the background.
    Creates its own DB session since the request session is closed by now.
    Used for iPhone Shortcuts and Telegram webhooks to avoid timeout errors.
    """
    from database import SessionLocal
    db = SessionLocal()
    try:
        raw_msg = db.query(models.RawMessage).filter(models.RawMessage.id == raw_msg_id).first()
        if not raw_msg:
            logger.error(f"[SMS-BG] Raw message {raw_msg_id} not found")
            return
        
        logger.info(f"[SMS-BG] Processing message {raw_msg_id} from {sender}")
        
        if source == "webhook":
            # Webhook path: use generic AI parser
            try:
                result = await sms_agent.parse_with_ai(db, body)
                result = sms_agent.validate_parsed_digits(body, result)
            except Exception as e:
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = f"AI Parse Error: {str(e)}"
                db.commit()
                logger.error(f"[SMS-BG] AI Parse Error for {raw_msg_id}: {e}")
                return
            
            if not result or not result.get("is_financial_event"):
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = "Not a financial event"
                db.commit()
                return
            
            # Find Account
            last_4 = result.get("destination_account_last4") or result.get("source_account_last4")
            if not last_4 and result.get("card_info"):
                card_match = re.search(r"(\d{4})", result["card_info"])
                if card_match: last_4 = card_match.group(1)
            
            account = crud.get_account_by_last_4(db, last_4=last_4) if last_4 else None
            
            if not account:
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = f"Account {last_4} not found"
                db.commit()
                return
            
            try:
                await sms_agent._create_transaction_logic(db, result, account, None, body, reply_target=None, source="telegram")
                raw_msg.status = models.MessageStatus.PARSED
                raw_msg.error_log = None
                db.commit()
                logger.info(f"[SMS-BG] Successfully processed webhook message {raw_msg_id}")
            except Exception as e:
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = f"Storage Error: {str(e)}"
                db.commit()
                logger.error(f"[SMS-BG] Storage Error for {raw_msg_id}: {e}")
        
        else:
            # Ingest path (iPhone Shortcuts): use bank-specific parser
            effective_sender = sender
            body_for_parsing = body
            body_lines = body.strip().split('\n')
            
            # Extract sender from header if present
            first_line = body_lines[0] if body_lines else ""
            header_match = re.search(r'^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+from\s+(.+)$', first_line.strip(), re.IGNORECASE)
            if header_match:
                effective_sender = header_match.group(1).strip()
                body_for_parsing = '\n'.join(body_lines[1:]).strip()
            
            raw_msg.sender = effective_sender
            db.commit()
            
            # Use bank-specific parser
            try:
                from bank_parsers import get_parser
                parser = get_parser(effective_sender)
                result = await parser.parse(db, body_for_parsing)
                result = sms_agent.validate_parsed_digits(body_for_parsing, result)
                logger.info(f"[SMS-BG] AI Response for {raw_msg_id}: {result}")
            except Exception as e:
                logger.error(f"[SMS-BG] AI Error for {raw_msg_id}: {str(e)}")
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = f"AI Error: {str(e)}"
                db.commit()
                return
            
            # Check for errors
            if isinstance(result, list):
                result = result[0] if result else {}
            
            if result and isinstance(result, dict) and result.get("error"):
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = result.get("error")
                db.commit()
                return
            
            if not result or not isinstance(result, dict) or not result.get("is_financial_event"):
                db.delete(raw_msg)
                db.commit()
                return
            
            # Extract source_bank from header if not parsed
            if not result.get("source_bank"):
                hdr_match = re.search(r'\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+from\s+(\S+)', body, re.IGNORECASE)
                if hdr_match:
                    result["source_bank"] = hdr_match.group(1)
            
            # Check for Declines
            if result.get("status") == "failed" or result.get("sub_type") == "decline":
                raw_msg.status = models.MessageStatus.PARSED
                raw_msg.error_log = "Transaction Declined (not added to ledger)"
                db.commit()
                return
            
            # Bank validation
            tx_type_for_bank = (result.get("transaction_type") or "debit").lower()
            if tx_type_for_bank == "credit":
                bank_to_check = result.get("destination_bank")
            else:
                bank_to_check = result.get("source_bank") or result.get("destination_bank")
            
            if bank_to_check:
                bank_lower = bank_to_check.lower().strip()
                user_accounts = db.query(models.Account).all()
                user_credit_cards = db.query(models.CreditCard).all()
                user_bank_names = set()
                for acc in user_accounts:
                    if acc.bank_name:
                        user_bank_names.add(acc.bank_name.lower().strip())
                for card in user_credit_cards:
                    if card.bank_name:
                        user_bank_names.add(card.bank_name.lower().strip())
                has_account_at_bank = any(
                    user_bank in bank_lower or bank_lower in user_bank
                    for user_bank in user_bank_names
                )
                if not has_account_at_bank and user_bank_names:
                    raw_msg.status = models.MessageStatus.FAILED
                    raw_msg.error_log = f"No account at bank: {bank_to_check}"
                    db.commit()
                    return
            
            # Find account
            account, credit_card, any_last4 = sms_agent.resolve_account(db, result, body)
            
            if not account and not credit_card:
                # For background processing, mark as FAILED so user can retry from SMS inbox
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = f"Account not found (last4: {any_last4 or 'none'}) — retry from SMS inbox"
                db.commit()
                logger.warning(f"[SMS-BG] No account found for {raw_msg_id}, last4={any_last4}")
                return
            
            # Duplicate check: skip if same SMS body already exists as a transaction
            existing_tx = db.query(models.Transaction).filter(
                models.Transaction.raw_sms_content == body
            ).first()
            if existing_tx:
                raw_msg.status = models.MessageStatus.PARSED
                raw_msg.error_log = f"Duplicate — already processed as transaction {existing_tx.id}"
                db.commit()
                logger.info(f"[SMS-BG] Duplicate SMS detected for {raw_msg_id}, existing tx={existing_tx.id}")
                return
            
            # Create transaction
            try:
                await sms_agent._create_transaction_logic(db, result, account, credit_card, body, reply_target=None, source="shortcut")
                raw_msg.status = models.MessageStatus.PARSED
                raw_msg.error_log = None
                db.commit()
                logger.info(f"[SMS-BG] Successfully processed ingest message {raw_msg_id}")
            except Exception as e:
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = f"Transaction Error: {str(e)}"
                db.commit()
                logger.error(f"[SMS-BG] Transaction Error for {raw_msg_id}: {e}")
    
    except Exception as e:
        logger.error(f"[SMS-BG] Unexpected error processing {raw_msg_id}: {e}")
        try:
            raw_msg = db.query(models.RawMessage).filter(models.RawMessage.id == raw_msg_id).first()
            if raw_msg:
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = f"Background processing error: {str(e)}"
                db.commit()
        except:
            pass
    finally:
        db.close()


# --- Webhook Endpoint ---
@app.post("/webhook/sms")
async def receive_sms(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
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

    # 1. Save Raw Message immediately
    raw_msg = models.RawMessage(
        sender=sender,
        body=body,
        status=models.MessageStatus.PENDING
    )
    db.add(raw_msg)
    db.commit()
    db.refresh(raw_msg)
    
    print(f"Extract SMS Body: {body}")

    # 2. Process in background — return immediately so callers don't timeout
    background_tasks.add_task(_process_sms_background, str(raw_msg.id), sender, body, "webhook")
    
    return {"status": "received", "message_id": str(raw_msg.id)}

# --- SMS Inbox Endpoints ---
@app.get("/messages/", response_model=List[schemas.RawMessage])
def read_messages(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.RawMessage).filter(models.RawMessage.user_id == current_user.id).order_by(models.RawMessage.timestamp.desc()).offset(skip).limit(limit).all()

@app.post("/messages/{message_id}/retry")
async def retry_message(message_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
        await sms_agent._create_transaction_logic(db, result, account, credit_card, msg.body, reply_target=None, source="webui", user_id=current_user.id)
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
async def ingest_sms(payload: schemas.SMSIngest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Direct SMS ingest endpoint for iPhone Shortcuts and Web UI.
    Accepts separate 'sender' and 'body' fields.
    
    For iPhone Shortcuts (non-WebUI senders):
    - Saves raw message and returns immediately with {"status": "received"}
    - Processes the SMS in the background to avoid iPhone timeout (-1001) errors
    
    For Web UI (sender="WebUI"):
    - Processes synchronously and returns full result with parsed data
    
    Returns:
    - status: "received" (async) | "success" | "pending_action" | "ignored" | "failed"
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
            status=models.MessageStatus.IGNORED,
            user_id=current_user.id
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
            status=models.MessageStatus.IGNORED,
            user_id=current_user.id
        )
        raw_msg.error_log = "Skipped: credit card statement/reminder notification"
        db.add(raw_msg)
        db.commit()
        return {"status": "ignored", "reason": "Credit card statement notification — not a transaction"}
    
    # --- ASYNC PATH: For iPhone Shortcuts (non-WebUI senders) ---
    # Save raw message immediately and process in background to avoid -1001 timeout
    is_webui = (payload.sender or "").strip().lower() == "webui"
    
    if not is_webui:
        raw_msg = models.RawMessage(
            sender=payload.sender,
            body=payload.body,
            status=models.MessageStatus.PENDING,
            timestamp=datetime.now(),
            user_id=current_user.id
        )
        db.add(raw_msg)
        db.commit()
        db.refresh(raw_msg)
        
        logger.info(f"[SMS-INGEST] iPhone/Shortcut sender detected — processing in background (msg_id={raw_msg.id})")
        background_tasks.add_task(_process_sms_background, str(raw_msg.id), payload.sender, payload.body, "ingest")
        
        return {"status": "received", "message_id": str(raw_msg.id), "message": "SMS received, processing in background"}
    
    # --- SYNC PATH: WebUI only (below this point) ---
    # 0b. QUEUE CHECK: Log pending transactions but don't block processing
    queue_status = queue_processor.get_queue_status(db)
    if queue_status["blocked"] > 0:
        logger.info(f"[SMS-INGEST] Note: {queue_status['blocked']} pending transactions exist, but continuing to process")
    
    # 0c. DUPLICATE CHECK: Handled in _create_transaction_logic with proper fragment matching.
    # (Early check removed — it used generic lines like "PoS" causing false positives)
    
    # 1. Create Raw Message record (will be deleted if not a transaction)
    raw_msg = models.RawMessage(
        sender=payload.sender,
        body=payload.body,
        status=models.MessageStatus.PENDING,
        timestamp=datetime.now(),
        user_id=current_user.id
    )
    db.add(raw_msg)
    db.commit()
    db.refresh(raw_msg)

    
    # 2. Extract sender from header if present (WebUI format: "2025-09-20 09:39:36 from STC Bank")
    effective_sender = payload.sender
    body_for_parsing = payload.body
    
    # Check first line for header pattern
    body_lines = payload.body.strip().split('\n')
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
        user_accounts = db.query(models.Account).filter(models.Account.user_id == current_user.id).all()
        user_credit_cards = db.query(models.CreditCard).filter(models.CreditCard.user_id == current_user.id).all()
        
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
                    user_id=current_user.id,
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
            user_id=current_user.id,
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
        await sms_agent._create_transaction_logic(db, result, account, credit_card, payload.body, reply_target=None, source="webui", user_id=current_user.id)
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
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
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
    
    # Assign account or credit card. The destination must belong to the caller,
    # and the transaction becomes owned by them once assigned.
    if account_id:
        account = db.query(models.Account).filter(
            models.Account.id == account_id,
            models.Account.user_id == current_user.id,
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        tx.account_id = account_id
        tx.user_id = current_user.id
        tx.status = "completed"

        # Update account balance via queue processor
        queue_processor.apply_balance_update(db, tx)

    elif credit_card_id:
        cc = db.query(models.CreditCard).filter(
            models.CreditCard.id == credit_card_id,
            models.CreditCard.user_id == current_user.id,
        ).first()
        if not cc:
            raise HTTPException(status_code=404, detail="Credit card not found")

        tx.credit_card_id = credit_card_id
        tx.user_id = current_user.id
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

# --- Allocation Rules: map a category / loan -> an envelope sub-account. ---
# These now DRIVE the allocation engine: an obligation inherits its category's
# envelope (calculate_allocation_preview) unless it has an explicit override.

@app.get("/allocation/rules", response_model=List[schemas.AllocationRule])
def get_allocation_rules(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.AllocationRule).filter(models.AllocationRule.user_id == current_user.id).all()

@app.post("/allocation/rules", response_model=schemas.AllocationRule)
def create_allocation_rule(rule: schemas.AllocationRuleCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # The envelope account must belong to the caller.
    _require_owned(db, models.Account, rule.target_account_id, current_user)
    return crud.create_allocation_rule(db, rule, user_id=current_user.id)

@app.delete("/allocation/rules/{rule_id}")
def delete_allocation_rule(rule_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rule = db.query(models.AllocationRule).filter(
        models.AllocationRule.id == rule_id,
        models.AllocationRule.user_id == current_user.id,
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"success": True}

# --- Obligations ---

# NOTE: Duplicate/shadowed /obligations/* and /obligations/history/* routes were
# removed here (including an unauthenticated, all-users GET /obligations/). The
# authoritative, auth-scoped versions are registered earlier
# (create/update/delete/reorder ~L553-582, pay/payments ~L1012-1022,
# history PUT/DELETE ~L1082-1089); FastAPI served those and this block was dead.

@app.post("/allocation/preview", response_model=schemas.AllocationPreviewResponse)
def preview_allocation(req: schemas.AllocationExecuteRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_owned(db, models.Account, req.source_account_id, current_user)
    return crud.calculate_allocation_preview(db, req.source_account_id, req.month_offset, user_id=current_user.id)

@app.post("/allocation/execute")
def execute_allocation(req: schemas.AllocationExecuteRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    source_acc = _require_owned(db, models.Account, req.source_account_id, current_user)
    preview = crud.calculate_allocation_preview(db, req.source_account_id, req.month_offset, user_id=current_user.id)

    # Calculate billing month
    from dateutil.relativedelta import relativedelta
    target_date = datetime.now() + relativedelta(months=req.month_offset)
    billing_month = target_date.strftime('%Y-%m')

    # Create ONE distribution PER OBLIGATION, idempotently (upsert on
    # source+target+month+obligation), so re-running never duplicates and each
    # distribution stays linked to the obligation it funds (precise reverse).
    executed_transfers = []
    for item in preview.allocations:
        if item.pending_amount <= 0 or item.status == 'transferred':
            continue
        if req.obligation_ids and item.obligation_id not in req.obligation_ids:
            continue
        transfer_amount = item.pending_amount
        if req.override_amounts and item.obligation_id in req.override_amounts:
            transfer_amount = req.override_amounts[item.obligation_id]
        if not transfer_amount or transfer_amount <= 0:
            continue

        note = f"Payday: {item.obligation_name}"
        existing = db.query(models.Distribution).filter(
            models.Distribution.source_account_id == source_acc.id,
            models.Distribution.target_account_id == item.target_account_id,
            models.Distribution.billing_month == billing_month,
            models.Distribution.obligation_id == item.obligation_id,
        ).first()
        if existing:
            existing.amount = round(transfer_amount, 2)
            existing.note = note
        else:
            db.add(models.Distribution(
                source_account_id=source_acc.id,
                target_account_id=item.target_account_id,
                obligation_id=item.obligation_id,
                amount=round(transfer_amount, 2),
                billing_month=billing_month,
                note=note,
                user_id=current_user.id,
            ))
        executed_transfers.append({
            "obligation_id": item.obligation_id,
            "obligation_name": item.obligation_name,
            "target_account": item.target_account_name,
            "amount": round(transfer_amount, 2),
        })
    db.commit()

    return {
        "status": "success",
        "transfers_count": len(executed_transfers),
        "details": executed_transfers,
        "note": "One distribution per obligation (idempotent). Link each to its real bank transfer when it occurs."
    }

@app.post("/allocation/reverse")
def reverse_allocation(req: schemas.AllocationReverseRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Reverse/undo a payday distribution for specific obligations.

    Only removes the requested obligation's OWN per-obligation distributions, and
    refuses to delete any distribution that already has a real linked bank
    transaction (that money actually moved) — such rows are reported as skipped.
    """
    _require_owned(db, models.Account, req.source_account_id, current_user)
    from dateutil.relativedelta import relativedelta
    target_date = datetime.now() + relativedelta(months=req.month_offset)
    billing_month = target_date.strftime('%Y-%m')

    reversed_items = []
    skipped_already_transferred = []

    for obl_id in req.obligation_ids:
        dists = db.query(models.Distribution).filter(
            models.Distribution.source_account_id == req.source_account_id,
            models.Distribution.billing_month == billing_month,
            models.Distribution.obligation_id == obl_id
        ).all()

        for d in dists:
            has_link = bool(d.transaction_id) or db.query(models.DistributionTransaction).filter(
                models.DistributionTransaction.distribution_id == d.id
            ).first() is not None
            if has_link:
                skipped_already_transferred.append({
                    "obligation_id": obl_id, "amount": d.amount, "distribution_id": d.id
                })
                continue
            reversed_items.append({
                "obligation_id": obl_id, "amount": d.amount, "distribution_id": d.id
            })
            db.delete(d)

    db.commit()

    return {
        "status": "reversed",
        "reversed_count": len(reversed_items),
        "details": reversed_items,
        "skipped_already_transferred": skipped_already_transferred,
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
def check_audit(request: schemas.AuditCheckRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Check system balance against actual balance and return discrepancy with transaction history."""
    result = crud.check_audit(db, request.account_id, request.actual_balance)
    if result is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return result

@app.post("/audit/confirm", response_model=schemas.Audit)
def confirm_audit(request: schemas.AuditConfirmRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
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
def get_audit_history(account_id: str, limit: int = 20, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Get audit history for an account owned by the caller."""
    _require_owned(db, models.Account, account_id, current_user)
    return crud.get_audit_history(db, account_id, limit)


# --- Distribution Endpoints ---

@app.post("/distributions", response_model=schemas.Distribution)
def create_distribution(distribution: schemas.DistributionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Create a distribution record."""
    db_distribution = crud.create_distribution(db, distribution, user_id=current_user.id)

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
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get distributions, optionally filtered by month or source account."""
    distributions = crud.get_distributions(db, billing_month, source_account_id)

    # Scope to the caller: only distributions whose source OR target account
    # belongs to the current user (distributions carry no reliable user_id).
    owned_account_ids = {
        aid for (aid,) in db.query(models.Account.id).filter(
            models.Account.user_id == current_user.id
        ).all()
    }
    distributions = [
        d for d in distributions
        if d.source_account_id in owned_account_ids or d.target_account_id in owned_account_ids
    ]

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
def get_distribution(distribution_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Get a single distribution by ID."""
    d = _require_owned_distribution(db, distribution_id, current_user)

    source = crud.get_account(db, d.source_account_id)
    target = crud.get_account(db, d.target_account_id)
    linked_tx = crud.get_transaction(db, d.transaction_id) if d.transaction_id else None
    # Resolve the junction rows to real Transactions (the raw junction objects
    # can't validate against List[Transaction], which is what caused the 500).
    linked_txs = [lt.transaction for lt in (d.linked_transactions or []) if lt.transaction]

    return {
        **{k: v for k, v in d.__dict__.items() if k != "linked_transactions"},
        "source_account_name": source.name if source else None,
        "target_account_name": target.name if target else None,
        "linked_transaction": linked_tx,
        "linked_transactions": linked_txs,
        "linked_transactions_count": len(linked_txs),
    }

@app.get("/distributions/{distribution_id}/matches", response_model=List[schemas.Transaction])
def get_distribution_matches(distribution_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Find matching transactions for a distribution."""
    _require_owned_distribution(db, distribution_id, current_user)
    matches = crud.get_distribution_matches(db, distribution_id)
    # Scope matches to the caller's own transactions where possible.
    matches = [m for m in matches if getattr(m, "user_id", None) in (None, current_user.id)]
    return matches

@app.post("/distributions/{distribution_id}/link")
def link_distribution(distribution_id: str, transaction_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Link a distribution to a transaction."""
    _require_owned_distribution(db, distribution_id, current_user)
    # Verify the transaction belongs to the caller before linking.
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.user_id == current_user.id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    result = crud.link_distribution_to_transaction(db, distribution_id, transaction_id)
    if not result:
        raise HTTPException(status_code=404, detail="Distribution not found")
    return {"status": "linked", "distribution_id": distribution_id, "transaction_id": transaction_id}

@app.put("/distributions/{distribution_id}", response_model=schemas.Distribution)
def update_distribution(distribution_id: str, update: schemas.DistributionUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Update a distribution."""
    _require_owned_distribution(db, distribution_id, current_user)
    result = crud.update_distribution(db, distribution_id, update)
    if not result:
        raise HTTPException(status_code=404, detail="Distribution not found")
    
    source = crud.get_account(db, result.source_account_id)
    target = crud.get_account(db, result.target_account_id)

    return {
        **{k: v for k, v in result.__dict__.items() if k != "linked_transactions"},
        "source_account_name": source.name if source else None,
        "target_account_name": target.name if target else None,
        "linked_transaction": None,
        "linked_transactions": [],
        "linked_transactions_count": 0,
    }

@app.delete("/distributions/{distribution_id}")
def delete_distribution(distribution_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Delete a distribution."""
    _require_owned_distribution(db, distribution_id, current_user)
    success = crud.delete_distribution(db, distribution_id)
    if not success:
        raise HTTPException(status_code=404, detail="Distribution not found")
    return {"status": "deleted"}


# --- Transaction Linking Endpoints ---

@app.get("/payments/{payment_id}/transactions")
def get_payment_linked_transactions(payment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Get all transactions linked to a payment."""
    _require_owned_payment(db, payment_id, current_user)
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


def _sync_payment_amount_from_links(db, payment_id):
    """Set a payment's amount to the sum of its linked transactions — the actual
    money that moved. A payment's own figure is otherwise only an estimate (or a
    placeholder from quick-pay), so once real transactions are linked they are the
    truth. BUDGET plans keep their planned amount; a payment with no links is left
    unchanged."""
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        return
    status = str(payment.status.value if hasattr(payment.status, "value") else payment.status)
    if status == "BUDGET":
        return
    ids = {j.transaction_id for j in db.query(models.PaymentTransaction).filter(
        models.PaymentTransaction.payment_id == payment_id).all()}
    if payment.transaction_id:
        ids.add(payment.transaction_id)
    if not ids:
        return
    total = sum(float(t.amount or 0) for t in db.query(models.Transaction).filter(
        models.Transaction.id.in_(ids)).all())
    payment.amount = round(total, 2)


@app.post("/payments/{payment_id}/transactions")
def link_transactions_to_payment(
    payment_id: int,
    request: schemas.LinkTransactionsRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Link multiple transactions to a payment."""
    _require_owned_payment(db, payment_id, current_user)

    linked = []
    for tx_id in request.transaction_ids:
        # Verify each transaction belongs to the caller before linking.
        tx = db.query(models.Transaction).filter(
            models.Transaction.id == tx_id,
            models.Transaction.user_id == current_user.id
        ).first()
        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found")

        existing = db.query(models.PaymentTransaction).filter(
            models.PaymentTransaction.payment_id == payment_id,
            models.PaymentTransaction.transaction_id == tx_id
        ).first()

        if not existing:
            link = models.PaymentTransaction(payment_id=payment_id, transaction_id=tx_id, link_source=request.link_source)
            db.add(link)
            linked.append(tx_id)

    db.commit()
    # Keep the payment amount in step with the transactions actually linked.
    _sync_payment_amount_from_links(db, payment_id)
    db.commit()
    return {"linked": linked, "count": len(linked)}


@app.delete("/payments/{payment_id}/transactions/{transaction_id}")
def unlink_transaction_from_payment(payment_id: int, transaction_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Unlink a transaction from a payment."""
    _require_owned_payment(db, payment_id, current_user)
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
def get_distribution_linked_transactions(distribution_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Get all transactions linked to a distribution."""
    _require_owned_distribution(db, distribution_id, current_user)
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
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Link multiple transactions to a distribution."""
    _require_owned_distribution(db, distribution_id, current_user)

    linked = []
    for tx_id in request.transaction_ids:
        # Verify each transaction belongs to the caller before linking.
        tx = db.query(models.Transaction).filter(
            models.Transaction.id == tx_id,
            models.Transaction.user_id == current_user.id
        ).first()
        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found")

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
def unlink_transaction_from_distribution(distribution_id: str, transaction_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Unlink a transaction from a distribution."""
    _require_owned_distribution(db, distribution_id, current_user)
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
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Search transactions with filters for the transaction selector modal.

    Returns {transactions, total, limit, offset}. `total` is the full match count
    so the caller can page through it — previously this returned a bare list
    silently capped at 50, which made it look like the user had no more
    transactions to link.
    """
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    q = db.query(models.Transaction).filter(models.Transaction.user_id == current_user.id)
    
    if query:
        qs = query.strip()
        conditions = [
            models.Transaction.merchant.ilike(f"%{qs}%"),
            models.Transaction.notes.ilike(f"%{qs}%"),
            models.Transaction.raw_sms_content.ilike(f"%{qs}%"),
            models.Transaction.category.ilike(f"%{qs}%"),
        ]
        # One search box for everything: a numeric query also matches the amount,
        # since users type the amount there expecting it to work ("1,500" finds
        # 1500.00). Match the value precisely — "1500" is 1500.xx, not 15000 —
        # by anchoring on the amount's "N.NN" text: a whole number matches its
        # integer part ("1500.%"), a decimal matches as a prefix ("1500.5%").
        num = qs.replace(",", "")
        if re.fullmatch(r"\d+(\.\d+)?", num):
            pattern = f"{num}%" if "." in num else f"{num}.%"
            conditions.append(cast(models.Transaction.amount, String).ilike(pattern))
        q = q.filter(or_(*conditions))

    
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
    
    total = q.count()
    q = q.order_by(models.Transaction.timestamp.desc())
    transactions = q.limit(limit).offset(offset).all()

    # Resolve the link state for the whole page in two queries rather than two
    # per row — at limit=500 the old per-row lookups meant 1000 round trips.
    tx_ids = [t.id for t in transactions]
    payment_by_tx, dist_by_tx = {}, {}
    if tx_ids:
        for pl in db.query(models.PaymentTransaction).filter(
            models.PaymentTransaction.transaction_id.in_(tx_ids)
        ).all():
            payment_by_tx.setdefault(pl.transaction_id, pl.payment_id)
        for dl in db.query(models.DistributionTransaction).filter(
            models.DistributionTransaction.transaction_id.in_(tx_ids)
        ).all():
            dist_by_tx.setdefault(dl.transaction_id, dl.distribution_id)

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
            "linked_to_payment_id": payment_by_tx.get(tx.id),
            "linked_to_distribution_id": dist_by_tx.get(tx.id),
            "raw_sms_content": tx.raw_sms_content
        }
        result.append(tx_dict)

    return {"transactions": result, "total": total, "limit": limit, "offset": offset}


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
