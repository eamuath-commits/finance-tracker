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
        parsed_data = _parse_and_store(statement, db)
    
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


def _parse_and_store(statement: models.Statement, db: Session) -> dict:
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
    if header and header.get("account_number") and not statement.account_id:
        last4 = header["account_number"][-4:]
        matching_account = db.query(models.Account).filter(
            models.Account.last_4_digits == last4,
            models.Account.user_id == current_user.id,
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
    
    # Resolve account name
    account_name = None
    if statement.account_id:
        acct = db.query(models.Account).filter(models.Account.id == statement.account_id).first()
        if acct:
            account_name = acct.name
    
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
            parsed = _parse_and_store(s, db)
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
    
    parsed = _parse_and_store(statement, db)
    
    if parsed.get("error"):
        raise HTTPException(status_code=500, detail=f"Parse failed: {parsed['error']}")
    
    return {
        "statement_id": statement.id,
        "header": parsed.get("header"),
        "transactions": parsed.get("transactions", []),
        "transaction_count": len(parsed.get("transactions", [])),
        "page_count": parsed.get("page_count", 0),
    }


@router.post("/{statement_id}/commit")
def commit_statement_to_ledger(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Commit parsed statement transactions into the master Transaction ledger.
    
    Creates Transaction records with status='draft'. They will NOT affect
    account balances until explicitly approved. Runs deduplication checks
    against existing transactions on the same account.
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
    
    # --- Deduplication: load existing transactions for this account in the date range ---
    # Collect date range from parsed transactions
    tx_dates = [tx.get("transaction_date") for tx in raw_transactions if tx.get("transaction_date")]
    existing_lookup = set()
    if tx_dates:
        min_date_str = min(tx_dates)
        max_date_str = max(tx_dates)
        try:
            from datetime import timedelta
            min_dt = datetime.strptime(min_date_str.replace('/', '-'), "%Y-%m-%d") - timedelta(days=1)
            max_dt = datetime.strptime(max_date_str.replace('/', '-'), "%Y-%m-%d") + timedelta(days=1)
            
            existing_txs = db.query(models.Transaction).filter(
                models.Transaction.account_id == statement.account_id,
                models.Transaction.source != "statement",  # Only check non-statement sources
                models.Transaction.timestamp >= min_dt,
                models.Transaction.timestamp <= max_dt,
            ).all()
            
            # Build lookup: (date_str, amount, type) → True
            for etx in existing_txs:
                if etx.timestamp and etx.amount:
                    date_key = etx.timestamp.strftime("%Y/%m/%d")
                    existing_lookup.add((date_key, round(etx.amount, 2), etx.type))
        except Exception as e:
            logger.warning(f"Deduplication lookup failed: {e}")
    
    # --- Create Transaction records ---
    created = []
    duplicates_flagged = 0
    skipped = 0
    
    for tx in raw_transactions:
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
        
        # Build timestamp
        timestamp = None
        if tx_date_str:
            try:
                date_part = tx_date_str.replace('/', '-')
                if tx_time_str:
                    timestamp = datetime.strptime(f"{date_part} {tx_time_str}", "%Y-%m-%d %H:%M:%S")
                else:
                    timestamp = datetime.strptime(date_part, "%Y-%m-%d")
            except ValueError:
                timestamp = datetime.utcnow()
        else:
            timestamp = datetime.utcnow()
        
        # Deduplication check
        is_duplicate = False
        if tx_date_str:
            dup_key = (tx_date_str, round(amount, 2), direction)
            if dup_key in existing_lookup:
                is_duplicate = True
                duplicates_flagged += 1
        
        # Map category from type_line
        category = map_type_to_category(tx.get("type_line", ""))
        
        # Build notes
        parts = []
        if tx.get("type_line"):
            parts.append(f"Type: {tx['type_line']}")
        if tx.get("note_text"):
            parts.append(f"Note: {tx['note_text']}")
        if is_duplicate:
            parts.append("⚠️ POTENTIAL DUPLICATE (matches existing SMS transaction)")
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
            status="draft",
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
            "is_duplicate": is_duplicate,
        })
    
    # Update statement status
    statement.status = "reviewed"
    db.commit()
    
    logger.info(
        f"Committed statement {statement_id}: "
        f"{len(created)} created, {duplicates_flagged} duplicates flagged, {skipped} skipped"
    )
    
    return {
        "statement_id": statement.id,
        "created": len(created),
        "duplicates_flagged": duplicates_flagged,
        "skipped": skipped,
        "transactions": created[:20],  # Preview first 20
    }


@router.post("/{statement_id}/approve")
def approve_statement_transactions(
    statement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Approve all draft transactions for a statement:
    1. Promote status from 'draft' → 'completed'
    2. Update statement status to 'approved'
    3. Recalculate the account balance chain
    """
    statement = db.query(models.Statement).filter(
        models.Statement.id == statement_id,
        models.Statement.user_id == current_user.id,
    ).first()
    
    if not statement:
        raise HTTPException(status_code=404, detail="Statement not found")
    
    if statement.status != "reviewed":
        raise HTTPException(
            status_code=400,
            detail=f"Statement must be in 'reviewed' status to approve (current: {statement.status}). "
                   "Commit the statement first."
        )
    
    # Find all draft transactions for this statement
    draft_txs = db.query(models.Transaction).filter(
        models.Transaction.statement_id == statement_id,
        models.Transaction.status == "draft",
    ).all()
    
    if not draft_txs:
        raise HTTPException(
            status_code=400,
            detail="No draft transactions found for this statement."
        )
    
    approved_count = len(draft_txs)
    
    # Promote all drafts to completed
    for tx in draft_txs:
        tx.status = "completed"
    
    # Update statement status
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
        f"balance {old_balance} → {new_balance}"
    )
    
    return {
        "statement_id": statement.id,
        "approved_count": approved_count,
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
    
    return {
        "statement_id": statement.id,
        "header": parsed.get("header"),
        "transactions": parsed.get("transactions", []),
        "transaction_count": len(parsed.get("transactions", [])),
    }


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
