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

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from auth import get_current_user
from statement_parser import parse_statement_pdf

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
    db.commit()
    
    return result


@router.get("/")
def list_statements(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List all imported statements for the current user."""
    statements = (
        db.query(models.Statement)
        .filter(models.Statement.user_id == current_user.id)
        .order_by(models.Statement.imported_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": s.id,
            "bank_name": s.bank_name,
            "original_filename": s.original_filename,
            "account_number": s.account_number,
            "statement_period_start": s.statement_period_start.isoformat() if s.statement_period_start else None,
            "statement_period_end": s.statement_period_end.isoformat() if s.statement_period_end else None,
            "transaction_count": s.transaction_count,
            "reconciliation_status": s.reconciliation_status,
            "status": s.status,
            "pdf_type": s.pdf_type,
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
    
    return {
        "id": statement.id,
        "bank_name": statement.bank_name,
        "original_filename": statement.original_filename,
        "account_id": statement.account_id,
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
