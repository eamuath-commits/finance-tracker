"""
Statement PDF Import Router.

Handles PDF upload, storage, and type detection for bank statement imports.

Endpoints:
    POST /api/statements/upload     — Upload a PDF and create a statement record
    GET  /api/statements/           — List all imported statements
    GET  /api/statements/{id}       — Get a single statement with details
    GET  /api/statements/{id}/pdf   — Serve the original PDF file
    DELETE /api/statements/{id}     — Delete a statement and its draft transactions
"""
import os
import uuid
import json
import logging
from datetime import datetime, date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from database import get_db
import models
import schemas
from auth import get_current_user
from statement_parser import parse_statement_pdf
from statement_category_mapper import map_type_to_category

logger = logging.getLogger("statement_router")

router = APIRouter(prefix="/api/statements", tags=["Statements"])

# Directory for storing uploaded PDFs
STATEMENTS_DIR = Path("/app/statements")
STATEMENTS_DIR.mkdir(parents=True, exist_ok=True)


def detect_pdf_type(file_path: str) -> str:
    """
    Detect whether a PDF is text-based or scanned (image-based).
    
    Strategy: Try to extract text from the first page. If we get a meaningful
    amount of text (> 50 chars), it's text-based. Otherwise, it's likely scanned.
    """
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            if not pdf.pages:
                return "unknown"
            # Check first page for extractable text
            first_page = pdf.pages[0]
            text = first_page.extract_text() or ""
            # Also check second page if exists (first page might be a cover)
            if len(pdf.pages) > 1:
                text += (pdf.pages[1].extract_text() or "")
            
            # If we can extract substantial text, it's text-based
            if len(text.strip()) > 50:
                return "text"
            else:
                return "scanned"
    except ImportError:
        logger.warning("pdfplumber not installed, falling back to PyPDF2")
        try:
            import PyPDF2
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                if not reader.pages:
                    return "unknown"
                text = reader.pages[0].extract_text() or ""
                if len(reader.pages) > 1:
                    text += (reader.pages[1].extract_text() or "")
                if len(text.strip()) > 50:
                    return "text"
                else:
                    return "scanned"
        except ImportError:
            logger.error("Neither pdfplumber nor PyPDF2 installed")
            return "unknown"
    except Exception as e:
        logger.error(f"PDF type detection failed: {e}")
        return "unknown"


@router.post("/upload")
async def upload_statement(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Upload a bank statement PDF.
    
    Creates a statement record, saves the PDF, and detects whether it's
    text-based or scanned. Only text-based PDFs can be processed further.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    
    if file.content_type and file.content_type != "application/pdf":
        # Some browsers send different content types, so we also check extension
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    
    # Generate unique filename to avoid collisions
    statement_id = str(uuid.uuid4())
    safe_filename = f"{statement_id}.pdf"
    file_path = STATEMENTS_DIR / safe_filename
    
    # Save the file
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        logger.error(f"Failed to save PDF: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded file")
    
    # Detect PDF type
    pdf_type = detect_pdf_type(str(file_path))
    
    # Create statement record
    statement = models.Statement(
        id=statement_id,
        user_id=current_user.id,
        bank_name="Al Rajhi",  # Default; can be updated later
        original_filename=file.filename,
        file_path=str(file_path),
        pdf_type=pdf_type,
        status="draft",
        reconciliation_status="pending",
        imported_at=datetime.utcnow(),
    )
    db.add(statement)
    db.commit()
    db.refresh(statement)
    
    # Auto-parse if text-based
    parsed_data = None
    if pdf_type == "text":
        parsed_data = _parse_and_store(statement, db, current_user.id)
    
    db.refresh(statement)
    
    # Build response
    result = {
        "id": statement.id,
        "original_filename": statement.original_filename,
        "bank_name": statement.bank_name,
        "pdf_type": pdf_type,
        "status": statement.status,
        "imported_at": statement.imported_at.isoformat() if statement.imported_at else None,
    }
    
    if pdf_type == "scanned":
        result["warning"] = "Scanned PDFs are not supported yet. Only text-based PDFs can be processed."
    elif pdf_type == "unknown":
        result["warning"] = "Could not determine PDF type. Please verify the file is a valid bank statement."
    else:
        result["message"] = "PDF uploaded and parsed successfully."
        if parsed_data:
            result["account_number"] = parsed_data["header"].get("account_number") if parsed_data["header"] else None
            result["iban"] = parsed_data["header"].get("iban") if parsed_data["header"] else None
            result["opening_balance"] = parsed_data["header"].get("opening_balance") if parsed_data["header"] else None
            result["closing_balance"] = parsed_data["header"].get("closing_balance") if parsed_data["header"] else None
            result["period_start"] = parsed_data["header"].get("period_start") if parsed_data["header"] else None
            result["period_end"] = parsed_data["header"].get("period_end") if parsed_data["header"] else None
            result["transaction_count"] = len(parsed_data.get("transactions", []))
            result["transactions"] = parsed_data.get("transactions", [])[:10]  # Preview first 10
    
    return result


def _parse_and_store(statement: models.Statement, db: Session, user_id: str = None) -> dict:
    """
    Parse a statement's PDF and update the statement record with header metadata.
    Returns the full parsed data dict.
    """
    result = parse_statement_pdf(statement.file_path)
    
    if result.get("error"):
        logger.error(f"Parse error for statement {statement.id}: {result['error']}")
        return result
    
    header = result.get("header", {})
    if header:
        statement.account_number = header.get("account_number")
        if header.get("opening_balance") is not None:
            statement.opening_balance = header["opening_balance"]
        if header.get("closing_balance") is not None:
            statement.closing_balance = header["closing_balance"]
        if header.get("period_start"):
            try:
                statement.statement_period_start = date.fromisoformat(header["period_start"])
            except ValueError:
                pass
        if header.get("period_end"):
            try:
                statement.statement_period_end = date.fromisoformat(header["period_end"])
            except ValueError:
                pass
    
    statement.transaction_count = len(result.get("transactions", []))
    
    # Auto-resolve account_id from account_number's last 4 digits
    resolve_user_id = user_id or statement.user_id
    if header and header.get("account_number") and not statement.account_id and resolve_user_id:
        last4 = header["account_number"][-4:]
        matching_account = db.query(models.Account).filter(
            models.Account.last_4_digits == last4,
            models.Account.user_id == resolve_user_id,
        ).first()
        if matching_account:
            statement.account_id = matching_account.id
            logger.info(f"Auto-resolved account: {matching_account.name} (last4={last4})")
    
    db.commit()
    
    return result


@router.get("/")
def list_statements(
    skip: int = 0,
    limit: int = 50,
    account_number: str = Query(None, description="Filter by account number (exact or last 4 digits)"),
    account_id: str = Query(None, description="Filter by account ID"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List all imported statements for the current user, optionally filtered by account."""
    query = db.query(models.Statement).filter(
        models.Statement.user_id == current_user.id
    )
    
    if account_number:
        query = query.filter(models.Statement.account_number.like(f"%{account_number}"))
    if account_id:
        query = query.filter(models.Statement.account_id == account_id)
    
    statements = (
        query
        .order_by(models.Statement.imported_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    # Build account name lookup
    account_ids = {s.account_id for s in statements if s.account_id}
    accounts_map = {}
    if account_ids:
        accounts = db.query(models.Account).filter(models.Account.id.in_(account_ids)).all()
        accounts_map = {a.id: a for a in accounts}
    
    return [
        {
            "id": s.id,
            "bank_name": s.bank_name,
            "original_filename": s.original_filename,
            "account_number": s.account_number,
            "account_id": s.account_id,
            "account_name": accounts_map[s.account_id].name if s.account_id and s.account_id in accounts_map else None,
            "account_last4": accounts_map[s.account_id].last_4_digits if s.account_id and s.account_id in accounts_map else (s.account_number[-4:] if s.account_number else None),
            "statement_period_start": s.statement_period_start.isoformat() if s.statement_period_start else None,
            "statement_period_end": s.statement_period_end.isoformat() if s.statement_period_end else None,
            "opening_balance": s.opening_balance,
            "closing_balance": s.closing_balance,
            "transaction_count": s.transaction_count,
            "reconciliation_status": s.reconciliation_status,
            "status": s.status,
            "pdf_type": s.pdf_type,
            "notes": s.notes,
            "imported_at": s.imported_at.isoformat() if s.imported_at else None,
        }
        for s in statements
    ]


# ─────────────── A: AUTO-CATEGORIZATION ───────────────

@router.get("/auto-categories")
def get_auto_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Build a merchant→category mapping learned from existing transactions.
    Returns the most common category per merchant name for auto-suggestion.
    """
    from sqlalchemy import func as sqlfunc
    
    rows = db.query(
        models.Transaction.merchant,
        models.Transaction.category,
        sqlfunc.count().label("cnt"),
    ).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.merchant.isnot(None),
        models.Transaction.merchant != "",
        models.Transaction.category.isnot(None),
        models.Transaction.category != "",
        models.Transaction.category != "Other",
    ).group_by(
        models.Transaction.merchant,
        models.Transaction.category,
    ).all()
    
    merchant_map = {}
    for merchant, category, count in rows:
        key = merchant.strip().lower()
        if key not in merchant_map or count > merchant_map[key]["count"]:
            merchant_map[key] = {"category": category, "count": count, "merchant": merchant}
    
    return {
        "merchant_categories": {
            v["merchant"]: v["category"]
            for v in merchant_map.values()
        },
        "total_merchants": len(merchant_map),
    }


# ─────────────── G: DASHBOARD STATEMENT HEALTH ───────────────

@router.get("/health/summary")
def statement_health_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Dashboard health widget data.
    Returns pending drafts, coverage gaps, and unreconciled periods.
    """
    from sqlalchemy import func as sqlfunc
    
    statements = db.query(models.Statement).filter(
        models.Statement.user_id == current_user.id,
    ).all()
    
    total = len(statements)
    drafts = sum(1 for s in statements if s.status == "draft")
    reviewed = sum(1 for s in statements if s.status == "reviewed")
    approved = sum(1 for s in statements if s.status == "approved")
    total_txs = sum(s.transaction_count or 0 for s in statements)
    
    covered_months = set()
    for s in statements:
        if s.statement_period_start and s.statement_period_end:
            start = s.statement_period_start if isinstance(s.statement_period_start, date) else datetime.strptime(str(s.statement_period_start), "%Y-%m-%d").date()
            end = s.statement_period_end if isinstance(s.statement_period_end, date) else datetime.strptime(str(s.statement_period_end), "%Y-%m-%d").date()
            current = start.replace(day=1)
            while current <= end:
                covered_months.add(f"{current.year}-{current.month:02d}")
                if current.month == 12:
                    current = current.replace(year=current.year+1, month=1)
                else:
                    current = current.replace(month=current.month+1)
    
    accounts_with_statements = set(s.account_id for s in statements if s.account_id)
    unreconciled = drafts + reviewed
    
    recent = None
    if statements:
        latest = max(statements, key=lambda s: s.imported_at or datetime.min)
        recent = {
            "filename": latest.original_filename,
            "status": latest.status,
            "imported_at": latest.imported_at.isoformat() if latest.imported_at else None,
            "transaction_count": latest.transaction_count,
        }
    
    return {
        "total_statements": total,
        "drafts": drafts,
        "reviewed": reviewed,
        "approved": approved,
        "total_transactions": total_txs,
        "covered_months": len(covered_months),
        "accounts_with_statements": len(accounts_with_statements),
        "unreconciled": unreconciled,
        "recent": recent,
    }


@router.get("/{statement_id}")
def get_statement(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a single statement with full details."""
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    # Count associated transactions
    tx_count = db.query(models.Transaction).filter(
        models.Transaction.statement_id == statement_id
    ).count()
    
    # Resolve account name and pre-statement balance
    account_name = None
    account_balance_before_stmt = None
    if statement.account_id:
        acct = db.query(models.Account).filter(models.Account.id == statement.account_id).first()
        if acct:
            account_name = acct.name
            # Calculate account balance EXCLUDING this statement's transactions
            # This is the system's independent anchor for balance verification
            from sqlalchemy import func
            stmt_credits = db.query(func.coalesce(func.sum(models.Transaction.amount), 0)).filter(
                models.Transaction.statement_id == statement_id,
                models.Transaction.type == "credit"
            ).scalar()
            stmt_debits = db.query(func.coalesce(func.sum(models.Transaction.amount), 0)).filter(
                models.Transaction.statement_id == statement_id,
                models.Transaction.type == "debit"
            ).scalar()
            # Account balance before statement = current - credits + debits
            account_balance_before_stmt = round(acct.current_balance - stmt_credits + stmt_debits, 2)
    
    return {
        "id": statement.id,
        "bank_name": statement.bank_name,
        "original_filename": statement.original_filename,
        "account_id": statement.account_id,
        "account_name": account_name,
        "account_number": statement.account_number,
        "statement_period_start": statement.statement_period_start.isoformat() if statement.statement_period_start else None,
        "statement_period_end": statement.statement_period_end.isoformat() if statement.statement_period_end else None,
        "opening_balance": statement.opening_balance,
        "closing_balance": statement.closing_balance,
        "account_balance_before_statement": account_balance_before_stmt,
        "transaction_count": tx_count,
        "reconciliation_status": statement.reconciliation_status,
        "reconciliation_errors": statement.reconciliation_errors,
        "status": statement.status,
        "pdf_type": statement.pdf_type,
        "notes": statement.notes,
        "imported_at": statement.imported_at.isoformat() if statement.imported_at else None,
    }


@router.get("/{statement_id}/pdf")
def serve_statement_pdf(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Serve the original PDF file for viewing/download."""
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if not statement.file_path or not os.path.exists(statement.file_path):
        raise HTTPException(status_code=404, detail="PDF file not found on server")
    
    return FileResponse(
        statement.file_path,
        media_type="application/pdf",
        filename=statement.original_filename or f"statement_{statement_id}.pdf",
    )

class StatementUpdateRequest(BaseModel):
    original_filename: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    account_id: Optional[str] = None


@router.patch("/{statement_id}")
def update_statement(
    statement_id: str,
    body: StatementUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update statement metadata (rename, notes, status)."""
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if body.original_filename is not None:
        statement.original_filename = body.original_filename
    if body.notes is not None:
        statement.notes = body.notes
    if body.status is not None:
        if body.status not in ("draft", "reviewed", "approved", "rejected"):
            raise HTTPException(status_code=400, detail="Invalid status. Must be draft, reviewed, approved, or rejected.")
        statement.status = body.status
    if body.account_id is not None:
        # Verify account belongs to current user
        account = db.query(models.Account).filter(
            models.Account.id == body.account_id,
            models.Account.user_id == current_user.id,
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found or does not belong to you.")
        statement.account_id = body.account_id
    
    db.commit()
    return {"message": "Statement updated", "id": statement.id}


class BulkIdsRequest(BaseModel):
    ids: List[str]


@router.post("/bulk-delete")
def bulk_delete_statements(
    body: BulkIdsRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete multiple statements and their draft transactions."""
    statements = db.query(models.Statement).filter(
        models.Statement.id.in_(body.ids),
        models.Statement.user_id == current_user.id,
    ).all()
    
    deleted = 0
    skipped = 0
    for s in statements:
        if s.status == "approved":
            skipped += 1
            continue
        # Delete draft transactions
        db.query(models.Transaction).filter(
            models.Transaction.statement_id == s.id,
            models.Transaction.status == "draft",
        ).delete(synchronize_session=False)
        # Delete PDF
        if s.file_path and os.path.exists(s.file_path):
            try:
                os.remove(s.file_path)
            except OSError:
                pass
        db.delete(s)
        deleted += 1
    
    db.commit()
    return {"message": f"Deleted {deleted} statements", "deleted": deleted, "skipped": skipped}


@router.post("/bulk-reparse")
def bulk_reparse_statements(
    body: BulkIdsRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Re-parse multiple statements."""
    statements = db.query(models.Statement).filter(
        models.Statement.id.in_(body.ids),
        models.Statement.user_id == current_user.id,
        models.Statement.pdf_type == "text",
    ).all()
    
    results = []
    for s in statements:
        if s.file_path and os.path.exists(s.file_path):
            parsed = _parse_and_store(s, db, current_user.id)
            results.append({
                "id": s.id,
                "filename": s.original_filename,
                "transaction_count": len(parsed.get("transactions", [])),
                "error": parsed.get("error"),
            })
    
    return {"message": f"Re-parsed {len(results)} statements", "results": results}


@router.post("/bulk-status")
def bulk_update_status(
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update status of multiple statements."""
    ids = body.get("ids", [])
    status = body.get("status", "")
    if status not in ("draft", "reviewed", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")
    
    updated = db.query(models.Statement).filter(
        models.Statement.id.in_(ids),
        models.Statement.user_id == current_user.id,
    ).update({"status": status}, synchronize_session=False)
    
    db.commit()
    return {"message": f"Updated {updated} statements to {status}", "updated": updated}


@router.delete("/{statement_id}")
def delete_statement(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Delete a statement and all its associated draft transactions.
    Only draft/rejected statements can be deleted. Approved statements
    must be rejected first.
    """
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if statement.status == "approved":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete an approved statement. Reject it first."
        )
    
    # Delete associated draft transactions
    deleted_tx_count = db.query(models.Transaction).filter(
        models.Transaction.statement_id == statement_id,
        models.Transaction.status == "draft",
    ).delete(synchronize_session=False)
    
    # Delete the PDF file
    if statement.file_path and os.path.exists(statement.file_path):
        try:
            os.remove(statement.file_path)
        except OSError as e:
            logger.warning(f"Failed to delete PDF file: {e}")
    
    # Delete the statement record
    db.delete(statement)
    db.commit()
    
    return {
        "message": "Statement deleted",
        "deleted_transactions": deleted_tx_count,
    }


@router.post("/{statement_id}/parse")
def parse_statement(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    (Re-)parse an uploaded statement PDF.
    Returns the full list of parsed transactions.
    """
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if statement.pdf_type != "text":
        raise HTTPException(status_code=400, detail="Only text-based PDFs can be parsed")
    
    if not statement.file_path or not os.path.exists(statement.file_path):
        raise HTTPException(status_code=404, detail="PDF file not found on server")
    
    parsed = _parse_and_store(statement, db, current_user.id)
    
    if parsed.get("error"):
        raise HTTPException(status_code=500, detail=f"Parse failed: {parsed['error']}")
    
    return {
        "statement_id": statement.id,
        "header": parsed.get("header"),
        "transactions": parsed.get("transactions", []),
        "transaction_count": len(parsed.get("transactions", [])),
        "page_count": parsed.get("page_count", 0),
    }


class CommitRequest(BaseModel):
    exclude_row_indices: Optional[List[int]] = None  # Row indices to skip (matched duplicates)


@router.post("/{statement_id}/commit")
def commit_statement_to_ledger(
    statement_id: str,
    body: CommitRequest = CommitRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Commit parsed statement transactions into the master Transaction ledger.
    
    Creates Transaction records with status='draft'. They will NOT affect
    account balances until explicitly approved.
    
    Accepts optional exclude_row_indices to skip matched/duplicate transactions.
    """
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if statement.status not in ("draft", "reviewed"):
        raise HTTPException(
            status_code=400,
            detail=f"Statement must be in draft or reviewed status to commit (current: {statement.status})"
        )
    
    if not statement.account_id:
        raise HTTPException(
            status_code=400,
            detail="Statement must be linked to an account before committing. "
                   "The account could not be auto-resolved from the statement header."
        )
    
    if not statement.file_path or not os.path.exists(statement.file_path):
        raise HTTPException(status_code=404, detail="PDF file not found on server")
    
    # Check if already committed (has draft transactions)
    existing_draft_count = db.query(models.Transaction).filter(
        models.Transaction.statement_id == statement_id,
        models.Transaction.status == "draft",
    ).count()
    
    if existing_draft_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Statement already has {existing_draft_count} draft transactions. "
                   "Delete them first or approve the existing ones."
        )
    
    # Parse the PDF
    parsed = parse_statement_pdf(statement.file_path)
    if parsed.get("error"):
        raise HTTPException(status_code=500, detail=f"Parse failed: {parsed['error']}")
    
    raw_transactions = parsed.get("transactions", [])
    if not raw_transactions:
        raise HTTPException(status_code=400, detail="No transactions found in statement")
    
    # Build set of excluded row indices (from frontend duplicate detection)
    excluded_rows = set(body.exclude_row_indices or [])
    
    # --- Create Transaction records ---
    created = []
    skipped = 0
    excluded_count = 0
    
    for tx in raw_transactions:
        row_idx = tx.get("row_index", 0)
        
        # Skip excluded (matched) rows
        if row_idx in excluded_rows:
            excluded_count += 1
            continue
        
        tx_date_str = tx.get("transaction_date")  # YYYY/MM/DD
        tx_time_str = tx.get("transaction_time")  # HH:MM:SS
        direction = tx.get("direction", "debit")
        
        # Determine amount
        if direction == "credit":
            amount = tx.get("credit_amount") or tx.get("amount") or 0
        else:
            amount = tx.get("debit_amount") or tx.get("amount") or 0
        
        if amount <= 0:
            skipped += 1
            continue
        
        # Build timestamp — prefer actual time from PDF, fall back to row_index for ordering
        timestamp = None
        if tx_date_str:
            try:
                date_part = tx_date_str.replace('/', '-')
                if tx_time_str:
                    # Use actual time from the statement PDF
                    try:
                        timestamp = datetime.strptime(f"{date_part} {tx_time_str}", "%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        try:
                            timestamp = datetime.strptime(f"{date_part} {tx_time_str}", "%Y-%m-%d %H:%M")
                        except ValueError:
                            timestamp = None
                
                if not timestamp:
                    # Fallback: use row_index for ordering within the same date
                    hour = (row_idx // 3600) % 24
                    minute = (row_idx % 3600) // 60
                    second = row_idx % 60
                    timestamp = datetime.strptime(date_part, "%Y-%m-%d").replace(
                        hour=hour, minute=minute, second=second
                    )
            except ValueError:
                timestamp = datetime.utcnow()
        else:
            timestamp = datetime.utcnow()
        
        # Map category from type_line
        category = map_type_to_category(tx.get("type_line", ""))
        
        # Build notes
        parts = []
        if tx_time_str:
            parts.append(f"Original Time: {tx_time_str}")
        if tx.get("type_line"):
            parts.append(f"Type: {tx['type_line']}")
        if tx.get("note_text"):
            parts.append(f"Note: {tx['note_text']}")
        notes_text = "\n".join(parts) if parts else None
        
        new_tx = models.Transaction(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            account_id=statement.account_id,
            amount=round(amount, 2),
            merchant=tx.get("merchant_or_beneficiary"),
            type=direction,
            timestamp=timestamp,
            balance_after_transaction=tx.get("balance"),
            category=category,
            notes=notes_text,
            raw_sms_content=tx.get("raw_description", ""),
            source="statement",
            statement_id=statement.id,
            statement_row_index=tx.get("row_index"),
            status="completed",
            fees=0.0,
        )
        db.add(new_tx)
        created.append({
            "id": new_tx.id,
            "amount": new_tx.amount,
            "merchant": new_tx.merchant,
            "type": new_tx.type,
            "category": category,
            "timestamp": timestamp.isoformat() if timestamp else None,
        })
    
    # Auto-approve: mark statement as approved
    statement.status = "approved"
    db.flush()
    
    # Recalculate account balance
    old_balance = None
    new_balance = None
    if statement.account_id:
        account = db.query(models.Account).filter(
            models.Account.id == statement.account_id
        ).first()
        if account:
            old_balance = round(account.current_balance or 0, 2)
        
        from main import _recalculate_account_balance
        result = _recalculate_account_balance(db, statement.account_id)
        if result:
            new_balance = result.get("new_balance")
    
    db.commit()
    
    logger.info(
        f"Committed statement {statement_id}: "
        f"{len(created)} created, {excluded_count} excluded (duplicates), {skipped} skipped, "
        f"balance {old_balance} → {new_balance}"
    )
    
    return {
        "statement_id": statement.id,
        "created": len(created),
        "excluded": excluded_count,
        "skipped": skipped,
        "old_balance": old_balance,
        "new_balance": new_balance,
        "transactions": created[:20],  # Preview first 20
        "message": f"{len(created)} transactions committed and approved. Balance updated.",
    }


class ApproveRequest(BaseModel):
    transaction_ids: Optional[List[str]] = None  # If None, approve all drafts


@router.post("/{statement_id}/approve")
def approve_statement_transactions(
    statement_id: str,
    body: ApproveRequest = ApproveRequest(),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Approve draft transactions for a statement:
    - If transaction_ids is provided, only approve those specific transactions
    - If transaction_ids is None/empty, approve ALL draft transactions
    Then recalculate the account balance chain.
    """
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if statement.status not in ("reviewed", "approved"):
        raise HTTPException(
            status_code=400,
            detail=f"Statement must be in 'reviewed' status to approve (current: {statement.status}). "
                   "Commit the statement first."
        )
    
    # Find draft transactions to approve
    query = db.query(models.Transaction).filter(
        models.Transaction.statement_id == statement_id,
        models.Transaction.status == "draft",
    )
    
    if body.transaction_ids:
        # Only approve selected transactions
        query = query.filter(models.Transaction.id.in_(body.transaction_ids))
    
    draft_txs = query.all()
    
    if not draft_txs:
        raise HTTPException(
            status_code=400,
            detail="No draft transactions found to approve."
        )
    
    approved_count = len(draft_txs)
    
    # Promote selected drafts to completed
    for tx in draft_txs:
        tx.status = "completed"
    
    # Check if any drafts remain — only mark statement as approved if none left
    remaining_drafts = db.query(models.Transaction).filter(
        models.Transaction.statement_id == statement_id,
        models.Transaction.status == "draft",
    ).count()
    
    if remaining_drafts == 0:
        statement.status = "approved"
    
    db.flush()
    
    # Recalculate account balance chain
    old_balance = None
    new_balance = None
    if statement.account_id:
        account = db.query(models.Account).filter(
            models.Account.id == statement.account_id
        ).first()
        if account:
            old_balance = round(account.current_balance or 0, 2)
        
        # Import and call the recalculation function
        from main import _recalculate_account_balance
        result = _recalculate_account_balance(db, statement.account_id)
        if result:
            new_balance = result.get("new_balance")
    
    db.commit()
    
    logger.info(
        f"Approved statement {statement_id}: {approved_count} transactions promoted, "
        f"balance {old_balance} → {new_balance}, {remaining_drafts} drafts remaining"
    )
    
    return {
        "statement_id": statement.id,
        "approved_count": approved_count,
        "remaining_drafts": remaining_drafts,
        "account_id": statement.account_id,
        "old_balance": old_balance,
        "new_balance": new_balance,
        "message": f"{approved_count} transactions approved. Account balance updated.",
    }


@router.get("/{statement_id}/transactions")
def get_statement_transactions(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get parsed transactions for a statement.
    If no transactions are stored yet, re-parse the PDF on the fly.
    Includes duplicate matching against existing DB transactions.
    """
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    # Parse the PDF to get raw transaction data
    if not statement.file_path or not os.path.exists(statement.file_path):
        raise HTTPException(status_code=404, detail="PDF file not found on server")
    
    parsed = parse_statement_pdf(statement.file_path)
    
    if parsed.get("error"):
        raise HTTPException(status_code=500, detail=f"Parse failed: {parsed['error']}")
    
    transactions = parsed.get("transactions", [])
    
    # --- Duplicate Matching ---
    # When statement is linked to an account, compare parsed rows against
    # existing non-statement transactions to detect duplicates
    match_summary = {"total": len(transactions), "matched": 0, "new": 0}
    
    if statement.account_id and transactions:
        # Collect date range from parsed transactions
        tx_dates = [tx.get("transaction_date") for tx in transactions if tx.get("transaction_date")]
        
        if tx_dates:
            try:
                from datetime import timedelta
                min_date_str = min(tx_dates)
                max_date_str = max(tx_dates)
                min_dt = datetime.strptime(min_date_str.replace('/', '-'), "%Y-%m-%d") - timedelta(days=1)
                max_dt = datetime.strptime(max_date_str.replace('/', '-'), "%Y-%m-%d") + timedelta(days=1)
                
                # Query existing non-statement transactions in the date range
                existing_txs = db.query(models.Transaction).filter(
                    models.Transaction.account_id == statement.account_id,
                    models.Transaction.source != "statement",
                    models.Transaction.timestamp >= min_dt,
                    models.Transaction.timestamp <= max_dt,
                ).all()
                
                # Build lookup: (date_str, amount_cents, type) → list of existing txs
                # Use amount_cents to avoid float comparison issues
                from collections import defaultdict
                existing_lookup = defaultdict(list)
                for etx in existing_txs:
                    if etx.timestamp and etx.amount:
                        date_key = etx.timestamp.strftime("%Y/%m/%d")
                        amount_cents = round(etx.amount * 100)
                        tx_type = str(etx.type).lower() if etx.type else "debit"
                        existing_lookup[(date_key, amount_cents, tx_type)].append({
                            "id": etx.id,
                            "merchant": etx.merchant,
                            "source": etx.source,
                        })
                
                # Annotate each parsed transaction with match info
                # Track which existing txs have been claimed to avoid double-matching
                claimed_tx_ids = set()
                
                for tx in transactions:
                    tx_date = tx.get("transaction_date")
                    direction = tx.get("direction", "debit")
                    
                    if direction == "credit":
                        amount = tx.get("credit_amount") or tx.get("amount") or 0
                    else:
                        amount = tx.get("debit_amount") or tx.get("amount") or 0
                    
                    amount_cents = round(amount * 100)
                    lookup_key = (tx_date, amount_cents, direction)
                    
                    candidates = existing_lookup.get(lookup_key, [])
                    # Find first unclaimed candidate
                    matched = None
                    for candidate in candidates:
                        if candidate["id"] not in claimed_tx_ids:
                            matched = candidate
                            claimed_tx_ids.add(candidate["id"])
                            break
                    
                    if matched:
                        tx["match_status"] = "matched"
                        tx["matched_tx_id"] = matched["id"]
                        tx["matched_tx_merchant"] = matched["merchant"]
                        tx["matched_tx_source"] = matched["source"]
                        match_summary["matched"] += 1
                    else:
                        tx["match_status"] = "new"
                        tx["matched_tx_id"] = None
                        tx["matched_tx_merchant"] = None
                        tx["matched_tx_source"] = None
                        match_summary["new"] += 1
                
            except Exception as e:
                logger.warning(f"Duplicate matching failed: {e}")
                # Fallback: mark all as new
                for tx in transactions:
                    tx["match_status"] = "new"
                    tx["matched_tx_id"] = None
                    tx["matched_tx_merchant"] = None
                    tx["matched_tx_source"] = None
                match_summary["new"] = len(transactions)
        else:
            for tx in transactions:
                tx["match_status"] = "new"
                tx["matched_tx_id"] = None
                tx["matched_tx_merchant"] = None
                tx["matched_tx_source"] = None
            match_summary["new"] = len(transactions)
    else:
        # No account linked — can't match
        for tx in transactions:
            tx["match_status"] = "new"
            tx["matched_tx_id"] = None
            tx["matched_tx_merchant"] = None
            tx["matched_tx_source"] = None
        match_summary["new"] = len(transactions)
    
    # If statement has been committed, also fetch committed DB transactions
    # to provide their IDs and statuses for the approval UI
    committed_txs = []
    if statement.status in ("reviewed", "approved"):
        db_txs = db.query(models.Transaction).filter(
            models.Transaction.statement_id == statement_id,
        ).order_by(models.Transaction.timestamp.asc()).all()
        committed_txs = [
            {"id": tx.id, "status": tx.status, "amount": tx.amount, "merchant": tx.merchant, "notes": tx.notes}
            for tx in db_txs
        ]
    
    return {
        "statement_id": statement.id,
        "header": parsed.get("header"),
        "transactions": transactions,
        "transaction_count": len(transactions),
        "committed_transactions": committed_txs,
        "match_summary": match_summary,
    }


class TransactionNoteUpdate(BaseModel):
    notes: Optional[str] = None


@router.patch("/transaction/{transaction_id}/notes")
def update_transaction_notes(
    transaction_id: str,
    body: TransactionNoteUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update notes for a committed transaction."""
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.user_id == current_user.id,
    ).first()
    
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    tx.notes = body.notes
    db.commit()
    
    return {"id": tx.id, "notes": tx.notes}


@router.get("/{statement_id}/validate")
def validate_statement(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Validate a statement's balance chain integrity.
    
    Performs deterministic arithmetic checks:
    1. Row-level: each row's balance = previous_balance ± amount
    2. Anchor check: first row anchors to opening_balance  
    3. Terminal check: last row balance matches closing_balance
    4. Aggregate: sum(debits) - sum(credits) = opening - closing
    
    Returns a detailed validation report.
    """
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if not statement.file_path or not os.path.exists(statement.file_path):
        raise HTTPException(status_code=404, detail="PDF file not found on server")
    
    # Re-parse to get raw transactions in print order
    parsed = parse_statement_pdf(statement.file_path)
    if parsed.get("error"):
        raise HTTPException(status_code=500, detail=f"Parse failed: {parsed['error']}")
    
    header = parsed.get("header", {})
    transactions = parsed.get("transactions", [])
    
    opening_balance = header.get("opening_balance")
    closing_balance = header.get("closing_balance")
    
    if opening_balance is None:
        return {
            "valid": False,
            "summary": "Cannot validate: opening balance not found in statement header",
            "checks": [],
        }
    
    # ─── Deterministic validation (no floating-point shortcuts) ───
    # Use integer cents to avoid floating point drift
    def to_cents(val):
        if val is None:
            return 0
        return round(val * 100)
    
    def from_cents(val):
        return val / 100.0
    
    checks = []
    row_errors = []
    
    opening_c = to_cents(opening_balance)
    closing_c = to_cents(closing_balance) if closing_balance is not None else None
    
    running_balance_c = opening_c
    total_debits_c = 0
    total_credits_c = 0
    
    for i, tx in enumerate(transactions):
        row_num = i + 1
        debit_c = to_cents(tx.get("debit_amount", 0) or 0)
        credit_c = to_cents(tx.get("credit_amount", 0) or 0)
        reported_balance_c = to_cents(tx.get("balance"))
        
        total_debits_c += debit_c
        total_credits_c += credit_c
        
        # Calculate expected balance after this transaction
        expected_balance_c = running_balance_c - debit_c + credit_c
        
        # Check against reported balance
        if reported_balance_c != 0:  # 0 means balance was not parsed
            drift_c = expected_balance_c - reported_balance_c
            
            if drift_c != 0:
                row_errors.append({
                    "row": row_num,
                    "date": tx.get("transaction_date"),
                    "merchant": tx.get("merchant_or_beneficiary", "—"),
                    "debit": from_cents(debit_c),
                    "credit": from_cents(credit_c),
                    "expected_balance": from_cents(expected_balance_c),
                    "reported_balance": from_cents(reported_balance_c),
                    "drift": from_cents(drift_c),
                })
            
            # Trust the reported balance for next iteration (PDF is source of truth)
            running_balance_c = reported_balance_c
        else:
            # No balance reported; carry forward calculated
            running_balance_c = expected_balance_c
    
    # ─── Check 1: Opening balance anchor ───
    if len(transactions) > 0:
        first_tx = transactions[0]
        first_debit_c = to_cents(first_tx.get("debit_amount", 0) or 0)
        first_credit_c = to_cents(first_tx.get("credit_amount", 0) or 0)
        first_bal_c = to_cents(first_tx.get("balance"))
        
        expected_first_c = opening_c - first_debit_c + first_credit_c
        anchor_ok = (first_bal_c == expected_first_c)
        
        checks.append({
            "name": "Opening Balance Anchor",
            "status": "pass" if anchor_ok else "fail",
            "detail": f"Opening {from_cents(opening_c)} {'−' if first_debit_c else '+'} {from_cents(first_debit_c or first_credit_c)} = {from_cents(expected_first_c)}, reported = {from_cents(first_bal_c)}",
            "expected": from_cents(expected_first_c),
            "actual": from_cents(first_bal_c),
        })
    
    # ─── Check 2: Closing balance terminal ───
    if closing_c is not None and len(transactions) > 0:
        last_bal_c = to_cents(transactions[-1].get("balance"))
        terminal_ok = (last_bal_c == closing_c)
        
        checks.append({
            "name": "Closing Balance Match",
            "status": "pass" if terminal_ok else "fail",
            "detail": f"Last transaction balance {from_cents(last_bal_c)} vs closing balance {from_cents(closing_c)}",
            "expected": from_cents(closing_c),
            "actual": from_cents(last_bal_c),
        })
    
    # ─── Check 3: Aggregate reconciliation ───
    if closing_c is not None:
        expected_diff_c = opening_c - closing_c
        actual_diff_c = total_debits_c - total_credits_c
        agg_ok = (expected_diff_c == actual_diff_c)
        
        checks.append({
            "name": "Aggregate Reconciliation",
            "status": "pass" if agg_ok else "fail",
            "detail": f"Opening − Closing = {from_cents(expected_diff_c)}, Sum(Debits) − Sum(Credits) = {from_cents(actual_diff_c)}",
            "expected": from_cents(expected_diff_c),
            "actual": from_cents(actual_diff_c),
        })
    
    # ─── Check 4: Row-level chain ───
    chain_ok = len(row_errors) == 0
    checks.append({
        "name": "Row-Level Balance Chain",
        "status": "pass" if chain_ok else "fail",
        "detail": f"{len(row_errors)} row(s) with balance drift" if not chain_ok else f"All {len(transactions)} rows verified",
        "error_count": len(row_errors),
    })
    
    # Overall result
    all_pass = all(c["status"] == "pass" for c in checks)
    
    return {
        "valid": all_pass,
        "summary": "✅ All checks passed — statement is arithmetically correct" if all_pass else f"⚠️ {sum(1 for c in checks if c['status'] == 'fail')} check(s) failed",
        "statement_id": statement.id,
        "opening_balance": opening_balance,
        "closing_balance": closing_balance,
        "total_debits": from_cents(total_debits_c),
        "total_credits": from_cents(total_credits_c),
        "transaction_count": len(transactions),
        "checks": checks,
        "row_errors": row_errors[:20],  # Cap at 20 for response size
        "row_error_count": len(row_errors),
    }


@router.get("/reconciliation/{account_id}")
def get_reconciliation_timeline(
    account_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Build a reconciliation timeline for an account showing all statements,
    gaps between them, and balance continuity checks.
    """
    # Verify account belongs to user
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Get all statements for this account, ordered by period start
    statements = db.query(models.Statement).filter(
        models.Statement.account_id == account_id,
        models.Statement.user_id == current_user.id,
    ).order_by(models.Statement.statement_period_start.asc()).all()
    
    if not statements:
        return {
            "account_id": account_id,
            "account_name": f"{account.name} ****{account.last_4_digits}",
            "current_balance": account.current_balance,
            "timeline": [],
            "checks": [],
        }
    
    from datetime import timedelta
    from sqlalchemy import func
    
    timeline = []
    checks = []
    
    for i, stmt in enumerate(statements):
        # Add statement block
        # Count committed transactions for this statement
        stmt_tx_count = db.query(models.Transaction).filter(
            models.Transaction.statement_id == stmt.id,
        ).count()
        
        timeline.append({
            "type": "statement",
            "statement_id": stmt.id,
            "filename": stmt.original_filename,
            "period_start": stmt.statement_period_start.isoformat() if stmt.statement_period_start else None,
            "period_end": stmt.statement_period_end.isoformat() if stmt.statement_period_end else None,
            "opening_balance": stmt.opening_balance,
            "closing_balance": stmt.closing_balance,
            "transaction_count": stmt_tx_count or stmt.transaction_count,
            "status": stmt.status,
        })
        
        # Check balance continuity with previous statement
        if i > 0:
            prev = statements[i - 1]
            if prev.closing_balance is not None and stmt.opening_balance is not None:
                prev_close_cents = round(prev.closing_balance * 100)
                this_open_cents = round(stmt.opening_balance * 100)
                is_match = prev_close_cents == this_open_cents
                
                # Also check if SMS transactions in the gap explain the difference
                gap_start = prev.statement_period_end + timedelta(days=1) if prev.statement_period_end else None
                gap_end = stmt.statement_period_start - timedelta(days=1) if stmt.statement_period_start else None
                
                gap_net_cents = 0
                gap_sms_count = 0
                if gap_start and gap_end and gap_start <= gap_end:
                    gap_credits = db.query(func.coalesce(func.sum(models.Transaction.amount), 0)).filter(
                        models.Transaction.account_id == account_id,
                        models.Transaction.source != "statement",
                        models.Transaction.type == "credit",
                        models.Transaction.timestamp >= datetime.combine(gap_start, datetime.min.time()),
                        models.Transaction.timestamp <= datetime.combine(gap_end, datetime.max.time()),
                    ).scalar()
                    gap_debits = db.query(func.coalesce(func.sum(models.Transaction.amount), 0)).filter(
                        models.Transaction.account_id == account_id,
                        models.Transaction.source != "statement",
                        models.Transaction.type == "debit",
                        models.Transaction.timestamp >= datetime.combine(gap_start, datetime.min.time()),
                        models.Transaction.timestamp <= datetime.combine(gap_end, datetime.max.time()),
                    ).scalar()
                    gap_sms_count = db.query(models.Transaction).filter(
                        models.Transaction.account_id == account_id,
                        models.Transaction.source != "statement",
                        models.Transaction.timestamp >= datetime.combine(gap_start, datetime.min.time()),
                        models.Transaction.timestamp <= datetime.combine(gap_end, datetime.max.time()),
                    ).count()
                    gap_net_cents = round(gap_credits * 100) - round(gap_debits * 100)
                
                # Check if prev_close + gap_net == this_open
                adjusted_close_cents = prev_close_cents + gap_net_cents
                is_match_with_gap = adjusted_close_cents == this_open_cents
                
                checks.append({
                    "type": "balance_continuity",
                    "from_statement_id": prev.id,
                    "to_statement_id": stmt.id,
                    "from_closing": prev.closing_balance,
                    "to_opening": stmt.opening_balance,
                    "gap_sms_count": gap_sms_count,
                    "gap_net_amount": gap_net_cents / 100,
                    "expected_opening": adjusted_close_cents / 100,
                    "pass": is_match or is_match_with_gap,
                    "direct_match": is_match,
                    "discrepancy": round((this_open_cents - adjusted_close_cents) / 100, 2),
                })
        
        # Add gap block between this statement and the next
        if i < len(statements) - 1:
            next_stmt = statements[i + 1]
            gap_start = stmt.statement_period_end + timedelta(days=1) if stmt.statement_period_end else None
            gap_end = next_stmt.statement_period_start - timedelta(days=1) if next_stmt.statement_period_start else None
            
            if gap_start and gap_end and gap_start <= gap_end:
                # Count SMS transactions in the gap
                gap_tx_count = db.query(models.Transaction).filter(
                    models.Transaction.account_id == account_id,
                    models.Transaction.source != "statement",
                    models.Transaction.timestamp >= datetime.combine(gap_start, datetime.min.time()),
                    models.Transaction.timestamp <= datetime.combine(gap_end, datetime.max.time()),
                ).count()
                
                gap_credits = db.query(func.coalesce(func.sum(models.Transaction.amount), 0)).filter(
                    models.Transaction.account_id == account_id,
                    models.Transaction.source != "statement",
                    models.Transaction.type == "credit",
                    models.Transaction.timestamp >= datetime.combine(gap_start, datetime.min.time()),
                    models.Transaction.timestamp <= datetime.combine(gap_end, datetime.max.time()),
                ).scalar()
                gap_debits = db.query(func.coalesce(func.sum(models.Transaction.amount), 0)).filter(
                    models.Transaction.account_id == account_id,
                    models.Transaction.source != "statement",
                    models.Transaction.type == "debit",
                    models.Transaction.timestamp >= datetime.combine(gap_start, datetime.min.time()),
                    models.Transaction.timestamp <= datetime.combine(gap_end, datetime.max.time()),
                ).scalar()
                
                timeline.append({
                    "type": "gap",
                    "gap_start": gap_start.isoformat(),
                    "gap_end": gap_end.isoformat(),
                    "gap_days": (gap_end - gap_start).days + 1,
                    "sms_transaction_count": gap_tx_count,
                    "sms_credits": round(float(gap_credits), 2),
                    "sms_debits": round(float(gap_debits), 2),
                    "sms_net_amount": round(float(gap_credits) - float(gap_debits), 2),
                })
    
    # Add trailing gap (after last statement to today)
    last_stmt = statements[-1]
    if last_stmt.statement_period_end:
        trailing_start = last_stmt.statement_period_end + timedelta(days=1)
        today = date.today()
        
        if trailing_start <= today:
            trailing_tx_count = db.query(models.Transaction).filter(
                models.Transaction.account_id == account_id,
                models.Transaction.source != "statement",
                models.Transaction.timestamp >= datetime.combine(trailing_start, datetime.min.time()),
            ).count()
            
            trailing_credits = db.query(func.coalesce(func.sum(models.Transaction.amount), 0)).filter(
                models.Transaction.account_id == account_id,
                models.Transaction.source != "statement",
                models.Transaction.type == "credit",
                models.Transaction.timestamp >= datetime.combine(trailing_start, datetime.min.time()),
            ).scalar()
            trailing_debits = db.query(func.coalesce(func.sum(models.Transaction.amount), 0)).filter(
                models.Transaction.account_id == account_id,
                models.Transaction.source != "statement",
                models.Transaction.type == "debit",
                models.Transaction.timestamp >= datetime.combine(trailing_start, datetime.min.time()),
            ).scalar()
            
            timeline.append({
                "type": "gap",
                "gap_start": trailing_start.isoformat(),
                "gap_end": today.isoformat(),
                "gap_days": (today - trailing_start).days + 1,
                "sms_transaction_count": trailing_tx_count,
                "sms_credits": round(float(trailing_credits), 2),
                "sms_debits": round(float(trailing_debits), 2),
                "sms_net_amount": round(float(trailing_credits) - float(trailing_debits), 2),
            })
    
    return {
        "account_id": account_id,
        "account_name": f"{account.name} ****{account.last_4_digits}",
        "current_balance": account.current_balance,
        "statement_count": len(statements),
        "timeline": timeline,
        "checks": checks,
    }


# ─────────────── D: EXPORT STATEMENT AS CSV ───────────────

@router.get("/{statement_id}/export")
def export_statement_csv(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Export statement transactions as a CSV file."""
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if not statement.file_path:
        raise HTTPException(status_code=400, detail="No PDF file available")
    
    parsed = parse_statement_pdf(statement.file_path)
    transactions = parsed.get("transactions", [])
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Row", "Date", "Time", "Type", "Merchant/Beneficiary", 
        "Debit", "Credit", "Balance", "Category", "Notes", "Match Status"
    ])
    
    committed_txs = {}
    if statement.status in ("reviewed", "approved"):
        db_txs = db.query(models.Transaction).filter(
            models.Transaction.statement_id == statement_id,
        ).order_by(models.Transaction.timestamp.asc()).all()
        for tx in db_txs:
            if tx.statement_row_index is not None:
                committed_txs[tx.statement_row_index] = tx
    
    for tx in transactions:
        row_idx = tx.get("row_index", 0)
        db_tx = committed_txs.get(row_idx)
        category = tx.get("category", map_type_to_category(tx.get("type_line", "")))
        
        writer.writerow([
            row_idx + 1,
            tx.get("transaction_date", ""),
            tx.get("transaction_time", ""),
            tx.get("type_line", ""),
            tx.get("merchant_or_beneficiary", tx.get("note_text", "")),
            tx.get("debit_amount", "") if tx.get("debit_amount", 0) > 0 else "",
            tx.get("credit_amount", "") if tx.get("credit_amount", 0) > 0 else "",
            tx.get("balance", ""),
            category,
            db_tx.notes if db_tx and db_tx.notes else "",
            tx.get("match_status", ""),
        ])
    
    output.seek(0)
    
    filename = f"statement_{statement.original_filename or statement_id}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─────────────── E: RECURRING TRANSACTION DETECTION ───────────────

@router.get("/{statement_id}/recurring")
def detect_recurring_transactions(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Detect recurring transaction patterns in a statement.
    Groups transactions by merchant + similar amount and flags likely recurring ones.
    """
    from collections import defaultdict
    
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if not statement.file_path:
        return {"patterns": [], "total_recurring": 0}
    
    parsed = parse_statement_pdf(statement.file_path)
    transactions = parsed.get("transactions", [])
    
    groups = defaultdict(list)
    for tx in transactions:
        merchant = (tx.get("merchant_or_beneficiary") or tx.get("note_text") or "").strip()
        if not merchant or len(merchant) < 3:
            continue
        
        amount = tx.get("debit_amount", 0) or tx.get("credit_amount", 0)
        if amount <= 0:
            continue
        
        bucket_amount = round(amount / 10) * 10
        key = f"{merchant.lower()[:30]}|{bucket_amount}"
        groups[key].append({
            "row_index": tx.get("row_index"),
            "date": tx.get("transaction_date"),
            "merchant": merchant,
            "amount": amount,
            "direction": tx.get("direction", "debit"),
            "type_line": tx.get("type_line", ""),
        })
    
    patterns = []
    for key, txs in groups.items():
        if len(txs) < 2:
            continue
        
        amounts = [t["amount"] for t in txs]
        avg_amount = sum(amounts) / len(amounts)
        
        dates = []
        for t in txs:
            try:
                d = datetime.strptime(t["date"], "%Y-%m-%d").date() if t["date"] else None
                if d:
                    dates.append(d)
            except (ValueError, TypeError):
                pass
        
        dates.sort()
        avg_interval = None
        frequency = "unknown"
        if len(dates) >= 2:
            intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
            avg_interval = sum(intervals) / len(intervals)
            if avg_interval <= 1:
                frequency = "daily"
            elif 5 <= avg_interval <= 10:
                frequency = "weekly"
            elif 13 <= avg_interval <= 17:
                frequency = "biweekly"
            elif 25 <= avg_interval <= 35:
                frequency = "monthly"
            else:
                frequency = "irregular"
        
        patterns.append({
            "merchant": txs[0]["merchant"],
            "occurrences": len(txs),
            "average_amount": round(avg_amount, 2),
            "total_amount": round(sum(amounts), 2),
            "direction": txs[0]["direction"],
            "frequency": frequency,
            "avg_interval_days": round(avg_interval, 1) if avg_interval else None,
            "transactions": txs,
        })
    
    patterns.sort(key=lambda p: p["total_amount"], reverse=True)
    
    return {
        "patterns": patterns,
        "total_recurring": sum(p["occurrences"] for p in patterns),
        "total_patterns": len(patterns),
    }
