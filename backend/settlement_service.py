"""
Bank Statement Settlement Service
=================================
Self-contained module for uploading bank statements, parsing transactions,
comparing against system records, and logging missing transactions.

Endpoints:
  POST /settlement/upload         - Upload & reconcile a bank statement
  POST /settlement/log-transaction - Log a single missing transaction
  POST /settlement/log-batch       - Batch log selected missing transactions
"""

import csv
import io
import re
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

import models
import schemas
import crud
from database import get_db

logger = logging.getLogger("settlement")

router = APIRouter(prefix="/settlement", tags=["Settlement"])


# ============================================================
# Pydantic Schemas (local to this service)
# ============================================================

class ParsedTransaction(BaseModel):
    """A single transaction extracted from the uploaded bank statement."""
    date: str  # ISO format string
    amount: float
    description: str
    type: str  # "credit" or "debit"
    raw_line: Optional[str] = None  # Original line for debugging


class MatchedTransaction(BaseModel):
    """A bank transaction that was matched to a system transaction."""
    bank_date: str
    bank_amount: float
    bank_description: str
    bank_type: str
    system_transaction_id: str
    system_merchant: Optional[str] = None
    system_date: str
    system_amount: float


class MissingTransaction(BaseModel):
    """A bank transaction that has no matching system transaction."""
    index: int  # Position in the parsed list (for selection)
    date: str
    amount: float
    description: str
    type: str
    raw_line: Optional[str] = None


class ReconciliationReport(BaseModel):
    """Full reconciliation report returned after upload & matching."""
    account_id: str
    account_name: str
    file_name: str
    total_bank_transactions: int
    matched_count: int
    missing_count: int
    matched_transactions: List[MatchedTransaction]
    missing_transactions: List[MissingTransaction]
    date_range: Optional[Dict[str, str]] = None  # {start, end}
    parsing_warnings: List[str] = []


class LogTransactionRequest(BaseModel):
    """Request to log a single missing transaction."""
    account_id: str
    date: str
    amount: float
    description: str
    type: str  # "credit" or "debit"
    category: Optional[str] = None
    notes: Optional[str] = None


class LogBatchRequest(BaseModel):
    """Request to batch-log multiple missing transactions."""
    account_id: str
    transactions: List[LogTransactionRequest]


# ============================================================
# File Parsing Logic
# ============================================================

def _detect_date(value: str) -> Optional[datetime]:
    """Try to parse a date string using common bank statement formats."""
    if not value or not value.strip():
        return None

    value = value.strip()

    # Common date formats used by Saudi and international banks
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d %b %Y",
        "%d %B %Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%d-%b-%Y",
        "%d-%b-%y",
        "%d/%m/%y",
        "%m/%d/%y",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue

    return None


def _detect_amount(value: str) -> Optional[float]:
    """Parse an amount string, handling commas, currency symbols, and negative markers."""
    if not value or not value.strip():
        return None

    value = value.strip()

    # Remove common currency symbols and whitespace
    value = re.sub(r'[SAR$€£¥₹\s]', '', value, flags=re.IGNORECASE)

    # Handle parentheses as negative: (1,234.56) -> -1234.56
    is_negative = False
    if value.startswith('(') and value.endswith(')'):
        value = value[1:-1]
        is_negative = True

    # Handle minus sign
    if value.startswith('-'):
        is_negative = True
        value = value[1:]

    # Remove thousands separators (commas)
    value = value.replace(',', '')

    try:
        amount = float(value)
        return -amount if is_negative else amount
    except ValueError:
        return None


def _identify_columns(headers: List[str], data_rows: List[List[str]] = None) -> Dict[str, int]:
    """
    Heuristically identify which columns contain date, amount, and description.
    If keyword-based detection fails and data_rows are provided, falls back to
    sampling actual cell values to infer column types.
    Returns a mapping of {field_name: column_index}.
    """
    headers_lower = [h.lower().strip() for h in headers]
    mapping = {}

    # Date column detection
    date_keywords = ['date', 'transaction date', 'posting date', 'value date',
                     'txn date', 'trans date', 'booking date', 'تاريخ']
    for i, h in enumerate(headers_lower):
        if any(kw in h for kw in date_keywords):
            mapping['date'] = i
            break

    # Amount column detection (look for single amount or debit/credit split)
    amount_keywords = ['amount', 'transaction amount', 'txn amount', 'المبلغ']
    debit_keywords = ['debit', 'withdrawal', 'dr', 'مدين', 'سحب']
    credit_keywords = ['credit', 'deposit', 'cr', 'دائن', 'إيداع']

    for i, h in enumerate(headers_lower):
        if any(kw in h for kw in amount_keywords):
            mapping['amount'] = i
            break

    # Check for split debit/credit columns
    for i, h in enumerate(headers_lower):
        if any(kw in h for kw in debit_keywords):
            mapping['debit'] = i
        if any(kw in h for kw in credit_keywords):
            mapping['credit'] = i

    # Description column detection
    desc_keywords = ['description', 'details', 'narrative', 'particulars',
                     'merchant', 'memo', 'reference', 'الوصف', 'البيان',
                     'transaction description']
    for i, h in enumerate(headers_lower):
        if any(kw in h for kw in desc_keywords):
            mapping['description'] = i
            break

    # --- Fallback: infer from data when keyword detection is incomplete ---
    needs_amount = 'amount' not in mapping and 'debit' not in mapping and 'credit' not in mapping
    needs_date = 'date' not in mapping

    if (needs_amount or needs_date) and data_rows:
        mapping = _infer_columns_from_data(data_rows, mapping)

    # Fallback: if description not found, use the longest text column
    if 'description' not in mapping and len(headers) >= 3:
        used = set(mapping.values())
        if data_rows:
            # Pick the column with the longest average text (likely description)
            best_col = None
            best_avg_len = 0
            for i in range(len(headers)):
                if i in used:
                    continue
                total_len = 0
                count = 0
                for row in data_rows[:15]:
                    if i < len(row) and row[i].strip():
                        val = row[i].strip()
                        # Skip if it looks like a date or number
                        if _detect_date(val) or _detect_amount(val) is not None:
                            continue
                        total_len += len(val)
                        count += 1
                avg_len = total_len / max(count, 1)
                if avg_len > best_avg_len:
                    best_avg_len = avg_len
                    best_col = i
            if best_col is not None:
                mapping['description'] = best_col
        else:
            for i in range(len(headers)):
                if i not in used:
                    mapping['description'] = i
                    break

    return mapping


def _infer_columns_from_data(data_rows: List[List[str]], existing_map: Dict[str, int]) -> Dict[str, int]:
    """
    When header keywords fail (generic 'Column 1', 'Column 2'...), sample actual
    data rows to infer which columns are dates, amounts, and descriptions.
    """
    mapping = dict(existing_map)
    if not data_rows:
        return mapping

    sample = data_rows[:15]  # Sample up to 15 rows
    num_cols = max(len(row) for row in sample) if sample else 0

    # Score each column for date-ness and amount-ness
    date_scores = [0] * num_cols
    amount_scores = [0] * num_cols
    text_scores = [0] * num_cols
    row_count = len(sample)

    for row in sample:
        for col_idx in range(min(len(row), num_cols)):
            val = row[col_idx].strip()
            if not val:
                continue

            if _detect_date(val):
                date_scores[col_idx] += 1
            elif _detect_amount(val) is not None:
                amount_scores[col_idx] += 1
            else:
                text_scores[col_idx] += 1

    used = set(mapping.values())
    threshold = max(row_count * 0.4, 2)  # At least 40% of rows or 2 matches

    # Assign date column (highest date score above threshold)
    if 'date' not in mapping:
        best_date_col = None
        best_date_score = 0
        for i in range(num_cols):
            if i in used:
                continue
            if date_scores[i] >= threshold and date_scores[i] > best_date_score:
                best_date_score = date_scores[i]
                best_date_col = i
        if best_date_col is not None:
            mapping['date'] = best_date_col
            used.add(best_date_col)

    # Assign amount column(s)
    if 'amount' not in mapping and 'debit' not in mapping and 'credit' not in mapping:
        # Collect all columns that look like amounts
        amount_cols = []
        for i in range(num_cols):
            if i in used:
                continue
            if amount_scores[i] >= threshold:
                amount_cols.append((i, amount_scores[i]))

        amount_cols.sort(key=lambda x: x[1], reverse=True)

        if len(amount_cols) == 1:
            # Single amount column (signed: positive = credit, negative = debit)
            mapping['amount'] = amount_cols[0][0]
            used.add(amount_cols[0][0])
        elif len(amount_cols) >= 2:
            # Two amount columns — likely debit/credit split
            # Check which one has more negative or which tends to be the first
            col_a, col_b = amount_cols[0][0], amount_cols[1][0]

            # Heuristic: in split format, one column has values and the other is empty
            # The column that appears first is usually debit
            if col_a < col_b:
                mapping['debit'] = col_a
                mapping['credit'] = col_b
            else:
                mapping['debit'] = col_b
                mapping['credit'] = col_a
            used.add(col_a)
            used.add(col_b)

    return mapping


def _rows_to_transactions(rows: List[List[str]], col_map: Dict[str, int]) -> tuple:
    """
    Convert parsed rows + column mapping into ParsedTransaction objects.
    Returns (transactions, warnings).
    """
    transactions = []
    warnings = []

    for row_idx, row in enumerate(rows):
        if not row or all(not cell.strip() for cell in row):
            continue  # Skip empty rows

        # Extract date
        date_val = None
        if 'date' in col_map and col_map['date'] < len(row):
            date_val = _detect_date(row[col_map['date']])

        if not date_val:
            # Try to find a date in any column (fallback)
            for cell in row:
                date_val = _detect_date(cell)
                if date_val:
                    break

        if not date_val:
            warnings.append(f"Row {row_idx + 1}: Could not parse date, skipping")
            continue

        # Extract amount and determine type
        amount = None
        tx_type = "debit"

        if 'amount' in col_map and col_map['amount'] < len(row):
            amount = _detect_amount(row[col_map['amount']])
            if amount is not None:
                if amount > 0:
                    tx_type = "credit"
                else:
                    tx_type = "debit"
                amount = abs(amount)
        elif 'debit' in col_map or 'credit' in col_map:
            # Split column format
            debit_val = None
            credit_val = None
            if 'debit' in col_map and col_map['debit'] < len(row):
                debit_val = _detect_amount(row[col_map['debit']])
            if 'credit' in col_map and col_map['credit'] < len(row):
                credit_val = _detect_amount(row[col_map['credit']])

            if debit_val and debit_val != 0:
                amount = abs(debit_val)
                tx_type = "debit"
            elif credit_val and credit_val != 0:
                amount = abs(credit_val)
                tx_type = "credit"

        if amount is None or amount == 0:
            warnings.append(f"Row {row_idx + 1}: Could not parse amount, skipping")
            continue

        # Extract description
        description = ""
        if 'description' in col_map and col_map['description'] < len(row):
            description = row[col_map['description']].strip()

        if not description:
            # Fallback: concatenate non-date, non-amount cells
            used_indices = set(col_map.values())
            desc_parts = [row[i].strip() for i in range(len(row))
                          if i not in used_indices and row[i].strip()]
            description = " | ".join(desc_parts) if desc_parts else "Unknown Transaction"

        raw_line = " | ".join(cell.strip() for cell in row if cell.strip())

        transactions.append(ParsedTransaction(
            date=date_val.strftime("%Y-%m-%d"),
            amount=round(amount, 2),
            description=description,
            type=tx_type,
            raw_line=raw_line
        ))

    return transactions, warnings


def _is_sms_export_csv(headers: List[str]) -> bool:
    """Check if a CSV is an iPhone/Android SMS export (has 'Text' and date-like columns)."""
    headers_lower = [h.lower().strip() for h in headers]
    has_text = any(h in ('text', 'message', 'body', 'sms text', 'sms body', 'content') for h in headers_lower)
    has_date = any('date' in h for h in headers_lower)
    has_sender = any(h in ('sender id', 'sender', 'sender name', 'address', 'from', 'number', 'phone') for h in headers_lower)
    return has_text and has_date and (has_sender or len(headers) > 5)


def _extract_transaction_from_sms(sms_text: str) -> Optional[Dict[str, Any]]:
    """
    Extract transaction data from a bank SMS message using regex patterns.
    Returns None if the text is not a recognizable financial transaction.
    """
    if not sms_text or len(sms_text.strip()) < 10:
        return None

    text = sms_text.strip()

    # Skip non-transaction messages (OTPs, promo, balance inquiries without amounts)
    skip_patterns = [
        r'\bOTP\b', r'\bverification\s+code\b', r'\bpassword\b', r'\bPIN\b',
        r'\bرمز التحقق\b', r'\bactivat', r'\bunsubscribe\b', r'\bpromo\b'
    ]
    for sp in skip_patterns:
        if re.search(sp, text, re.IGNORECASE):
            return None

    # --- Amount extraction ---
    amount = None
    # Pattern: SAR 1,234.56 or 1,234.56 SAR or Amount: 1234.56 or ر.س 1234.56
    amount_patterns = [
        r'(?:SAR|sar|S\.R|ر\.س|SR)\s*[:\s]?\s*([\d,]+\.?\d*)',
        r'([\d,]+\.?\d*)\s*(?:SAR|sar|S\.R|ر\.س|SR)',
        r'(?:Amount|المبلغ|Amt)[:\s]+\s*([\d,]+\.?\d*)',
        r'(?:of|بمبلغ)\s+([\d,]+\.?\d*)',
    ]

    for pat in amount_patterns:
        m = re.search(pat, text)
        if m:
            try:
                amount = float(m.group(1).replace(',', ''))
                if amount > 0:
                    break
            except ValueError:
                continue

    if not amount or amount <= 0:
        return None

    # --- Transaction type ---
    tx_type = "debit"  # Default
    credit_keywords = [
        r'\b(?:credited|deposited?|received|incoming|salary|refund)\b',
        r'\b(?:إيداع|تحويل وارد|استلام|راتب|استرداد)\b',
        r'\btransfer(?:red)?\s+to\s+your\b',
        r'\bcredit\b(?!\s*card)',
    ]
    debit_keywords = [
        r'\b(?:purchase|purchas|debit|withdrawn|withdrawal|payment|paid|spent|PoS|P\.O\.S)\b',
        r'\b(?:شراء|سحب|خصم|دفع|مشتريات)\b',
        r'\b(?:mada|visa|mastercard)\b',
        r'\btransfer(?:red)?\s+from\b',
    ]

    for ck in credit_keywords:
        if re.search(ck, text, re.IGNORECASE):
            tx_type = "credit"
            break

    # Debit overrides if credit wasn't matched
    if tx_type != "credit":
        for dk in debit_keywords:
            if re.search(dk, text, re.IGNORECASE):
                tx_type = "debit"
                break

    # --- Merchant / description extraction ---
    description = ""
    merchant_patterns = [
        r'(?:At|at|AT|From|from|To|to|By|Store|Merchant)[:\s]+\s*([A-Za-z0-9\s\-\.\'&/]+?)(?:\s*(?:on|On|Amount|SAR|SR|Acc|Avl|Bal|\d{2}[/\-]))',
        r'(?:عند|لدى|من|الى)\s+(.+?)(?:\s*(?:بمبلغ|مبلغ|SAR|SR|\d))',
    ]
    for mp in merchant_patterns:
        m = re.search(mp, text)
        if m:
            description = m.group(1).strip().rstrip('.')
            break

    if not description:
        # Fallback: use the first ~60 chars of the SMS text as description
        description = text[:80].strip()
        if len(text) > 80:
            description += "..."

    return {
        "amount": round(amount, 2),
        "type": tx_type,
        "description": description,
    }


def _parse_sms_csv(headers: List[str], data_rows: List[List[str]]) -> tuple:
    """
    Parse an SMS export CSV by extracting transactions from the 'Text' column.
    Returns (transactions, warnings).
    """
    warnings = ["Detected SMS export format — extracting transactions from message text"]
    transactions = []

    headers_lower = [h.lower().strip() for h in headers]

    # Find the text column
    text_col = None
    for i, h in enumerate(headers_lower):
        if h in ('text', 'message', 'body', 'sms text', 'sms body', 'content'):
            text_col = i
            break
    if text_col is None:
        raise ValueError("SMS export detected but could not find 'Text' column")

    # Find the date column (prefer 'Message Date', then any date column)
    date_col = None
    for i, h in enumerate(headers_lower):
        if h == 'message date':
            date_col = i
            break
    if date_col is None:
        for i, h in enumerate(headers_lower):
            if 'date' in h and 'delete' not in h and 'edit' not in h and 'read' not in h:
                date_col = i
                break

    skipped = 0
    parsed = 0

    for row_idx, row in enumerate(data_rows):
        if not row or text_col >= len(row):
            continue

        sms_text = row[text_col].strip()
        if not sms_text:
            continue

        # Extract transaction from SMS text
        tx_data = _extract_transaction_from_sms(sms_text)
        if not tx_data:
            skipped += 1
            continue

        # Extract date
        date_val = None
        if date_col is not None and date_col < len(row):
            date_val = _detect_date(row[date_col].strip())

        if not date_val:
            # Try parsing common SMS export date formats
            if date_col is not None and date_col < len(row):
                raw_date = row[date_col].strip()
                # Handle "Jun 05, 2026 17:30:00" or similar
                extra_formats = [
                    "%b %d, %Y %H:%M:%S", "%b %d, %Y %H:%M",
                    "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S%z",
                    "%m/%d/%y, %H:%M", "%m/%d/%Y, %H:%M",
                ]
                for fmt in extra_formats:
                    try:
                        date_val = datetime.strptime(raw_date, fmt)
                        break
                    except ValueError:
                        continue

        if not date_val:
            warnings.append(f"Row {row_idx + 1}: Could not parse date, skipping")
            continue

        parsed += 1
        transactions.append(ParsedTransaction(
            date=date_val.strftime("%Y-%m-%d"),
            amount=tx_data["amount"],
            description=tx_data["description"],
            type=tx_data["type"],
            raw_line=sms_text[:120]
        ))

    warnings.append(f"Processed {parsed + skipped} SMS messages: {parsed} transactions found, {skipped} non-transaction messages skipped")

    return transactions, warnings


def parse_csv(file_content: bytes, filename: str) -> tuple:
    """Parse a CSV bank statement or SMS export. Returns (transactions, warnings)."""
    warnings = []

    # Decode content
    try:
        text = file_content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = file_content.decode('utf-8-sig')  # BOM-aware
        except UnicodeDecodeError:
            text = file_content.decode('latin-1')
            warnings.append("File encoding detected as Latin-1 (non-UTF8)")

    # Detect delimiter
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(text[:4096])
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ','

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = list(reader)

    if len(all_rows) < 2:
        raise ValueError("CSV file appears to be empty or has only headers")

    # First non-empty row is assumed to be headers
    header_row = None
    data_rows = []
    for i, row in enumerate(all_rows):
        if not row or all(not cell.strip() for cell in row):
            continue
        if header_row is None:
            # Check if this row looks like headers (no parseable date in first few cells)
            looks_like_header = True
            for cell in row[:3]:
                if _detect_date(cell.strip()):
                    looks_like_header = False
                    break
            if looks_like_header:
                header_row = row
            else:
                # No header row, use generic column names
                header_row = [f"Column {j+1}" for j in range(len(row))]
                data_rows.append(row)
        else:
            data_rows.append(row)

    if not header_row:
        raise ValueError("Could not detect headers in CSV file")

    # --- Check if this is an SMS export CSV ---
    if _is_sms_export_csv(header_row):
        return _parse_sms_csv(header_row, data_rows)

    # --- Standard bank statement CSV parsing ---
    col_map = _identify_columns(header_row, data_rows)

    if 'date' not in col_map:
        warnings.append("Could not identify a date column from headers — will attempt per-row detection")
    if 'amount' not in col_map and 'debit' not in col_map and 'credit' not in col_map:
        raise ValueError(
            f"Could not identify amount columns in headers: {header_row}. "
            "Expected column names like 'Amount', 'Debit', 'Credit', etc."
        )

    transactions, parse_warnings = _rows_to_transactions(data_rows, col_map)
    warnings.extend(parse_warnings)

    return transactions, warnings


def parse_excel(file_content: bytes, filename: str) -> tuple:
    """Parse an Excel bank statement. Returns (transactions, warnings)."""
    import openpyxl

    warnings = []

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_content), read_only=True, data_only=True)
    except Exception as e:
        raise ValueError(f"Could not read Excel file: {str(e)}")

    ws = wb.active
    if not ws:
        raise ValueError("Excel workbook has no active sheet")

    # Read all rows as string lists
    all_rows = []
    for row in ws.iter_rows(values_only=True):
        str_row = [str(cell) if cell is not None else "" for cell in row]
        all_rows.append(str_row)

    wb.close()

    if len(all_rows) < 2:
        raise ValueError("Excel file appears to be empty or has only headers")

    # Same logic as CSV: detect headers and columns
    header_row = None
    data_rows = []
    for i, row in enumerate(all_rows):
        if not row or all(not cell.strip() for cell in row):
            continue
        if header_row is None:
            looks_like_header = True
            for cell in row[:3]:
                if _detect_date(cell.strip()):
                    looks_like_header = False
                    break
            if looks_like_header:
                header_row = row
            else:
                header_row = [f"Column {j+1}" for j in range(len(row))]
                data_rows.append(row)
        else:
            data_rows.append(row)

    if not header_row:
        raise ValueError("Could not detect headers in Excel file")

    col_map = _identify_columns(header_row, data_rows)

    if 'amount' not in col_map and 'debit' not in col_map and 'credit' not in col_map:
        raise ValueError(
            f"Could not identify amount columns in headers: {header_row}. "
            "Expected column names like 'Amount', 'Debit', 'Credit', etc."
        )

    transactions, parse_warnings = _rows_to_transactions(data_rows, col_map)
    warnings.extend(parse_warnings)

    return transactions, warnings


def parse_pdf(file_content: bytes, filename: str) -> tuple:
    """Parse a PDF bank statement using pdfplumber. Returns (transactions, warnings)."""
    import pdfplumber

    warnings = []
    warnings.append("PDF parsing is in beta — results may vary by bank format")

    try:
        pdf = pdfplumber.open(io.BytesIO(file_content))
    except Exception as e:
        raise ValueError(f"Could not read PDF file: {str(e)}")

    all_rows = []
    header_row = None

    for page_num, page in enumerate(pdf.pages):
        tables = page.extract_tables()

        if not tables:
            # Try extracting text lines as fallback
            text = page.extract_text()
            if text:
                warnings.append(f"Page {page_num + 1}: No tables found, extracted text only")
            continue

        for table in tables:
            for row_idx, row in enumerate(table):
                if not row or all(cell is None or str(cell).strip() == '' for cell in row):
                    continue
                str_row = [str(cell).strip() if cell else "" for cell in row]

                if header_row is None:
                    # Check if this looks like a header
                    looks_like_header = True
                    for cell in str_row[:3]:
                        if _detect_date(cell):
                            looks_like_header = False
                            break
                    if looks_like_header:
                        header_row = str_row
                    else:
                        header_row = [f"Column {j+1}" for j in range(len(str_row))]
                        all_rows.append(str_row)
                else:
                    all_rows.append(str_row)

    pdf.close()

    if not header_row:
        raise ValueError("Could not extract any tabular data from PDF")

    if not all_rows:
        raise ValueError("No data rows found in PDF tables")

    col_map = _identify_columns(header_row, all_rows)

    if 'amount' not in col_map and 'debit' not in col_map and 'credit' not in col_map:
        raise ValueError(
            f"Could not identify amount columns in PDF headers: {header_row}. "
            "Expected column names like 'Amount', 'Debit', 'Credit', etc."
        )

    transactions, parse_warnings = _rows_to_transactions(all_rows, col_map)
    warnings.extend(parse_warnings)

    return transactions, warnings
def parse_text(file_content: bytes, filename: str) -> tuple:
    """Parse a plain text file containing SMS messages.
    
    Supports two formats:
    1. Dash-separated blocks (e.g. iPhone SMS export tools):
       2026-05-23 11:56:53 from AlRajhiBank
       
       Debit Internal Transfer
       From:3264
       Amount:SR 1100
       ...
       
       ----------------------------------------------------
    
    2. Simple line-by-line (one SMS per line)
    """
    warnings = ["Detected plain text file — treating each line/block as an SMS message"]
    transactions = []

    # Decode
    try:
        text = file_content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = file_content.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = file_content.decode('latin-1')
            warnings.append("File encoding detected as Latin-1 (non-UTF8)")

    # Detect dash-separated format (lines of 4+ dashes as separator)
    has_dash_separator = bool(re.search(r'^-{4,}\s*$', text, re.MULTILINE))

    skipped = 0
    parsed = 0
    otp_skipped = 0
    non_financial_skipped = 0
    dates_found = 0

    # Header pattern: "2026-05-23 11:56:53 from AlRajhiBank"
    header_pattern = re.compile(
        r'^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+from\s+(.+)$',
        re.IGNORECASE
    )

    # OTP / non-transaction patterns to skip early
    skip_patterns = [
        r'otp\s*code',
        r'verification\s*code',
        r'beneficiary\s+(added|activated|deleted)',
        r'security\s*code',
        r'one.time\s*password',
        r'password\s*reset',
        r'login\s*code',
        r'رمز\s*التحقق',
    ]
    skip_re = re.compile('|'.join(skip_patterns), re.IGNORECASE)

    if has_dash_separator:
        # === Mode 1: Dash-separated blocks ===
        blocks = re.split(r'^-{4,}\s*$', text, flags=re.MULTILINE)
        warnings[0] = f"Detected dash-separated SMS export — {len(blocks)} blocks found"

        for block in blocks:
            block = block.strip()
            if not block or len(block) < 10:
                continue

            # Try to extract header line
            lines = block.split('\n')
            header_match = header_pattern.match(lines[0].strip())

            block_date = None
            sender = None
            sms_body = block

            if header_match:
                date_str = header_match.group(1)  # "2026-05-23"
                time_str = header_match.group(2)  # "11:56:53"
                sender = header_match.group(3).strip()  # "AlRajhiBank"

                try:
                    block_date = datetime.strptime(date_str, "%Y-%m-%d")
                    dates_found += 1
                except ValueError:
                    pass

                # SMS body is everything after the header (skip blank lines after header)
                body_lines = []
                started = False
                for line in lines[1:]:
                    if not started and not line.strip():
                        continue  # Skip blank lines between header and body
                    started = True
                    body_lines.append(line)
                sms_body = '\n'.join(body_lines).strip()

            if not sms_body or len(sms_body) < 5:
                continue

            # Skip OTP/non-financial messages early
            if skip_re.search(sms_body):
                otp_skipped += 1
                continue

            # Try to extract transaction
            # Join multi-line body for regex matching
            sms_oneline = sms_body.replace('\n', ' ').strip()
            tx_data = _extract_transaction_from_sms(sms_oneline)

            if not tx_data:
                # Try with the raw multi-line body (some patterns need newlines)
                tx_data = _extract_transaction_from_sms(sms_body)

            if not tx_data:
                skipped += 1
                continue

            # If no date from header, try inline dates in the body
            if not block_date:
                for dp in [r'(\d{2}/\d{1,2}/\d{2,4})', r'(\d{4}-\d{2}-\d{2})', r'(\d{2}-\d{2}-\d{4})']:
                    m = re.search(dp, sms_body)
                    if m:
                        block_date = _detect_date(m.group(1))
                        if block_date:
                            dates_found += 1
                            break

            parsed += 1
            transactions.append(ParsedTransaction(
                date=block_date.strftime("%Y-%m-%d") if block_date else datetime.now().strftime("%Y-%m-%d"),
                amount=tx_data["amount"],
                description=tx_data["description"],
                type=tx_data["type"],
                raw_line=sms_body[:200]
            ))

    else:
        # === Mode 2: Simple line-by-line or paragraph-separated ===
        paragraphs = re.split(r'\n\s*\n', text.strip())
        if len(paragraphs) <= 1:
            items = [line.strip() for line in text.strip().split('\n') if line.strip()]
        else:
            items = [p.replace('\n', ' ').strip() for p in paragraphs if p.strip()]

        for item in items:
            if not item or len(item) < 10:
                continue

            if skip_re.search(item):
                otp_skipped += 1
                continue

            tx_data = _extract_transaction_from_sms(item)
            if not tx_data:
                skipped += 1
                continue

            # Extract date from text
            date_val = None
            for dp in [r'(\d{2}/\d{1,2}/\d{2,4})', r'(\d{4}-\d{2}-\d{2})', r'(\d{2}-\d{2}-\d{4})']:
                m = re.search(dp, item)
                if m:
                    date_val = _detect_date(m.group(1))
                    if date_val:
                        dates_found += 1
                        break

            parsed += 1
            transactions.append(ParsedTransaction(
                date=date_val.strftime("%Y-%m-%d") if date_val else datetime.now().strftime("%Y-%m-%d"),
                amount=tx_data["amount"],
                description=tx_data["description"],
                type=tx_data["type"],
                raw_line=item[:200]
            ))

    # Summary warnings
    total = parsed + skipped + otp_skipped + non_financial_skipped
    if otp_skipped > 0:
        warnings.append(f"Auto-skipped {otp_skipped} OTP/verification/non-financial messages")
    if dates_found == 0 and parsed > 0:
        warnings.append("No dates found — using today's date as fallback for all transactions")
    warnings.append(f"Processed {total} messages: {parsed} transactions found, {skipped + otp_skipped} skipped")

    return transactions, warnings


def parse_file(file_content: bytes, filename: str) -> tuple:
    """
    Route to the appropriate parser based on file extension.
    Returns (transactions: List[ParsedTransaction], warnings: List[str]).
    """
    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''

    if ext == 'csv':
        return parse_csv(file_content, filename)
    elif ext in ('xlsx', 'xls'):
        return parse_excel(file_content, filename)
    elif ext == 'pdf':
        return parse_pdf(file_content, filename)
    elif ext == 'txt':
        return parse_text(file_content, filename)
    else:
        raise ValueError(
            f"Unsupported file format: .{ext}. "
            "Please upload a CSV, Excel (.xlsx), PDF, or Text (.txt) file."
        )


# ============================================================
# Transaction Matching Algorithm
# ============================================================

def match_transactions(
    bank_transactions: List[ParsedTransaction],
    system_transactions: list,
    date_tolerance_days: int = 3
) -> tuple:
    """
    Compare bank transactions against system transactions.

    Matching criteria:
    - Date must be within ±date_tolerance_days
    - Amount must match exactly (after rounding to 2 decimal places)
    - Description is used as a tiebreaker when multiple candidates match

    Returns (matched: List[MatchedTransaction], missing: List[MissingTransaction])
    """
    matched = []
    missing = []

    # Build a lookup structure for system transactions indexed by amount
    sys_by_amount: Dict[float, list] = {}
    for tx in system_transactions:
        key = round(tx.amount, 2)
        sys_by_amount.setdefault(key, []).append(tx)

    # Track which system transactions have been matched (by id)
    used_system_ids = set()

    for idx, bank_tx in enumerate(bank_transactions):
        bank_date = datetime.strptime(bank_tx.date, "%Y-%m-%d")
        bank_amount = round(bank_tx.amount, 2)

        # Find candidates with matching amount
        candidates = sys_by_amount.get(bank_amount, [])

        best_match = None
        best_score = -1

        for sys_tx in candidates:
            if sys_tx.id in used_system_ids:
                continue

            # Check type match
            sys_type = sys_tx.type or "debit"
            if sys_type != bank_tx.type:
                continue

            # Check date tolerance
            sys_date = sys_tx.timestamp
            if sys_date is None:
                continue

            # Handle timezone-aware vs naive
            if sys_date.tzinfo:
                sys_date = sys_date.replace(tzinfo=None)

            date_diff = abs((sys_date.date() - bank_date.date()).days)
            if date_diff > date_tolerance_days:
                continue

            # Calculate match score (lower date diff = better)
            score = 100 - (date_diff * 30)

            # Bonus for description similarity
            sys_desc = (sys_tx.merchant or sys_tx.notes or "").lower()
            bank_desc = bank_tx.description.lower()
            if sys_desc and bank_desc:
                # Check for substring match
                if sys_desc in bank_desc or bank_desc in sys_desc:
                    score += 20
                else:
                    # Check for word overlap
                    sys_words = set(sys_desc.split())
                    bank_words = set(bank_desc.split())
                    overlap = len(sys_words & bank_words)
                    if overlap > 0:
                        score += min(overlap * 5, 15)

            if score > best_score:
                best_score = score
                best_match = sys_tx

        if best_match:
            used_system_ids.add(best_match.id)
            sys_date = best_match.timestamp
            if sys_date and sys_date.tzinfo:
                sys_date = sys_date.replace(tzinfo=None)

            matched.append(MatchedTransaction(
                bank_date=bank_tx.date,
                bank_amount=bank_tx.amount,
                bank_description=bank_tx.description,
                bank_type=bank_tx.type,
                system_transaction_id=best_match.id,
                system_merchant=best_match.merchant,
                system_date=sys_date.strftime("%Y-%m-%d") if sys_date else "",
                system_amount=best_match.amount
            ))
        else:
            missing.append(MissingTransaction(
                index=idx,
                date=bank_tx.date,
                amount=bank_tx.amount,
                description=bank_tx.description,
                type=bank_tx.type,
                raw_line=bank_tx.raw_line
            ))

    return matched, missing


# ============================================================
# API Endpoints
# ============================================================

@router.post("/upload", response_model=ReconciliationReport)
async def upload_and_reconcile(
    file: UploadFile = File(...),
    account_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Upload a bank statement file and reconcile against system transactions.

    Accepts CSV, Excel (.xlsx), or PDF files.
    Pass account_id="all" to match against all accounts.
    Returns a reconciliation report with matched and missing transactions.
    """
    # Validate account exists (or "all" mode)
    is_all_accounts = account_id.lower() == "all"

    if is_all_accounts:
        account_name = "All Accounts"
    else:
        account = db.query(models.Account).filter(models.Account.id == account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        account_name = account.name

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Read file content
    try:
        file_content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    if len(file_content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Size limit: 10MB
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB.")

    # Parse file
    try:
        bank_transactions, warnings = parse_file(file_content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error parsing file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error parsing file: {str(e)}"
        )

    if not bank_transactions:
        raise HTTPException(
            status_code=422,
            detail="No transactions could be extracted from the file. "
                   "Please check the file format and ensure it contains transaction data."
        )

    # Determine date range from parsed transactions
    parsed_dates = [datetime.strptime(t.date, "%Y-%m-%d") for t in bank_transactions]
    min_date = min(parsed_dates)
    max_date = max(parsed_dates)

    # Expand search window by tolerance
    search_start = min_date - timedelta(days=7)
    search_end = max_date + timedelta(days=7)

    # Query system transactions within the date range
    tx_query = db.query(models.Transaction).filter(
        models.Transaction.timestamp >= search_start,
        models.Transaction.timestamp <= search_end
    )

    if not is_all_accounts:
        tx_query = tx_query.filter(models.Transaction.account_id == account_id)

    system_transactions = tx_query.order_by(models.Transaction.timestamp.asc()).all()

    # Run matching algorithm
    matched, missing = match_transactions(bank_transactions, system_transactions)

    logger.info(
        f"Settlement reconciliation for {account_name}: "
        f"{len(bank_transactions)} bank txs, {len(matched)} matched, {len(missing)} missing"
    )

    return ReconciliationReport(
        account_id=account_id,
        account_name=account_name,
        file_name=file.filename,
        total_bank_transactions=len(bank_transactions),
        matched_count=len(matched),
        missing_count=len(missing),
        matched_transactions=matched,
        missing_transactions=missing,
        date_range={
            "start": min_date.strftime("%Y-%m-%d"),
            "end": max_date.strftime("%Y-%m-%d")
        },
        parsing_warnings=warnings
    )


@router.post("/log-transaction")
def log_missing_transaction(
    req: LogTransactionRequest,
    db: Session = Depends(get_db)
):
    """Log a single missing transaction into the system."""
    # Validate account
    account = db.query(models.Account).filter(models.Account.id == req.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Parse date
    try:
        timestamp = datetime.strptime(req.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {req.date}")

    # Create transaction using existing crud
    tx_data = schemas.TransactionCreate(
        account_id=req.account_id,
        amount=req.amount,
        merchant=req.description,
        category=req.category,
        type=req.type,
        status="completed",
        timestamp=timestamp,
        source="settlement",
        notes=req.notes or f"Logged from bank statement settlement"
    )

    try:
        transaction = crud.create_transaction(db, tx_data)
    except Exception as e:
        logger.error(f"Failed to create transaction: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create transaction: {str(e)}")

    return {
        "message": "Transaction logged successfully",
        "transaction_id": transaction.id,
        "amount": transaction.amount,
        "merchant": transaction.merchant,
        "date": timestamp.strftime("%Y-%m-%d")
    }


@router.post("/log-batch")
def log_batch_transactions(
    req: LogBatchRequest,
    db: Session = Depends(get_db)
):
    """Batch log multiple missing transactions into the system."""
    # Validate account
    account = db.query(models.Account).filter(models.Account.id == req.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if not req.transactions:
        raise HTTPException(status_code=400, detail="No transactions provided")

    results = []
    errors = []

    for i, tx_req in enumerate(req.transactions):
        try:
            timestamp = datetime.strptime(tx_req.date, "%Y-%m-%d")

            tx_data = schemas.TransactionCreate(
                account_id=req.account_id,
                amount=tx_req.amount,
                merchant=tx_req.description,
                category=tx_req.category,
                type=tx_req.type,
                status="completed",
                timestamp=timestamp,
                source="settlement",
                notes=tx_req.notes or "Logged from bank statement settlement"
            )

            transaction = crud.create_transaction(db, tx_data)
            results.append({
                "index": i,
                "transaction_id": transaction.id,
                "status": "success"
            })
        except Exception as e:
            logger.error(f"Failed to create transaction {i}: {e}")
            errors.append({
                "index": i,
                "description": tx_req.description,
                "error": str(e)
            })

    return {
        "message": f"Batch complete: {len(results)} logged, {len(errors)} failed",
        "total_requested": len(req.transactions),
        "successful": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors
    }


class ParseSmsRequest(BaseModel):
    sms_text: str
    account_id: Optional[str] = None  # Optional: if provided, will match to this account


@router.post("/parse-sms")
async def parse_sms_preview(
    req: ParseSmsRequest,
    db: Session = Depends(get_db)
):
    """
    Parse a raw SMS text through the AI pipeline (same as Telegram ingest)
    and return the parsed result as a preview — without saving to DB.
    """
    import sms_agent

    if not req.sms_text or len(req.sms_text.strip()) < 5:
        raise HTTPException(status_code=400, detail="SMS text is too short")

    try:
        # Run through AI parser (same as Telegram flow)
        result = await sms_agent.parse_with_ai(db, req.sms_text.strip())

        if "error" in result:
            raise HTTPException(
                status_code=500,
                detail=f"AI parsing failed: {result['error']}"
            )

        # Validate parsed digits
        result = sms_agent.validate_parsed_digits(req.sms_text, result)

        # Resolve account
        account, credit_card, any_last4 = sms_agent.resolve_account(db, result, req.sms_text)

        # Build preview response
        account_name = None
        account_id = req.account_id
        if account:
            account_name = account.name
            account_id = account.id
        elif credit_card:
            account_name = f"{credit_card.name} (Credit Card)"

        preview = {
            "is_transaction": result.get("is_transaction", False),
            "is_financial_event": result.get("is_financial_event", False),
            "transaction_type": result.get("transaction_type", "debit"),
            "sub_type": result.get("sub_type"),
            "amount": result.get("amount"),
            "currency": result.get("currency", "SAR"),
            "merchant": result.get("merchant"),
            "brand_name": result.get("brand_name"),
            "description": result.get("description"),
            "category": result.get("category"),
            "timestamp": result.get("timestamp"),
            "source_account_last4": result.get("source_account_last4"),
            "destination_account_last4": result.get("destination_account_last4"),
            "source_bank": result.get("source_bank"),
            "beneficiary": result.get("beneficiary"),
            "resolved_account_name": account_name,
            "resolved_account_id": account_id,
            "available_balance": result.get("available_balance"),
            "fees": result.get("fees"),
        }

        logger.info(f"SMS preview parsed: {preview.get('description')} - {preview.get('amount')} {preview.get('currency')}")

        return preview

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SMS parse preview error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to parse SMS: {str(e)}")


class ConfirmSmsIngestRequest(BaseModel):
    sms_text: str
    account_id: str
    amount: float
    merchant: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    transaction_type: str = "debit"
    timestamp: Optional[str] = None


@router.post("/confirm-sms-ingest")
def confirm_sms_ingest(
    req: ConfirmSmsIngestRequest,
    db: Session = Depends(get_db)
):
    """
    Confirm and log a previewed SMS transaction into the system.
    This saves the transaction after the user has reviewed the AI-parsed preview.
    """
    # Validate account
    account = db.query(models.Account).filter(models.Account.id == req.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Parse timestamp
    tx_timestamp = datetime.now()
    if req.timestamp:
        try:
            tx_timestamp = datetime.strptime(req.timestamp, "%Y-%m-%d %H:%M")
        except ValueError:
            try:
                tx_timestamp = datetime.strptime(req.timestamp, "%Y-%m-%d")
            except ValueError:
                pass  # Use current time as fallback

    tx_data = schemas.TransactionCreate(
        account_id=req.account_id,
        amount=req.amount,
        merchant=req.merchant or req.description or "Unknown",
        raw_sms_content=req.sms_text,
        category=req.category or "Uncategorized",
        type=req.transaction_type,
        status="completed",
        timestamp=tx_timestamp,
        source="settlement_rerun",
        notes=f"Re-ingested from settlement service"
    )

    try:
        transaction = crud.create_transaction(db, tx_data)
    except Exception as e:
        logger.error(f"Failed to create re-ingested transaction: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create transaction: {str(e)}")

    return {
        "message": "Transaction logged successfully",
        "transaction_id": transaction.id,
        "amount": transaction.amount,
        "merchant": transaction.merchant,
        "date": tx_timestamp.strftime("%Y-%m-%d")
    }
