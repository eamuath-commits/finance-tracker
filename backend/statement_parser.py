"""
Al Rajhi Bank Statement PDF Parser.

Parses text-based Al Rajhi bank statement PDFs into structured transaction data.
Handles multi-line descriptions, credit/debit detection, and statement-level metadata.

IMPORTANT: Row order is preserved as printed in the PDF. Never re-sort by date or time.
"""
import re
import logging
from typing import Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger("statement_parser")


@dataclass
class StatementHeader:
    """Metadata extracted from the statement's first page."""
    account_number: Optional[str] = None
    iban: Optional[str] = None
    customer_name: Optional[str] = None
    opening_balance: Optional[float] = None
    closing_balance: Optional[float] = None
    period_start: Optional[str] = None  # ISO date
    period_end: Optional[str] = None    # ISO date
    total_deposits: Optional[float] = None
    total_withdrawals: Optional[float] = None
    num_deposits: Optional[int] = None
    num_withdrawals: Optional[int] = None
    ref_no: Optional[str] = None


@dataclass
class RawTransaction:
    """A single transaction row extracted from the statement."""
    row_index: int                       # Order as printed in PDF (0-based)
    transaction_date: Optional[str] = None   # YYYY/MM/DD from PDF
    transaction_time: Optional[str] = None   # HH:MM:SS from Time: line
    type_line: Optional[str] = None          # e.g. "POS purchase Apple pay (Domestic)"
    raw_description: str = ""                # Full untouched text of the transaction cell
    debit_amount: Optional[float] = None     # Parsed from Debit column
    credit_amount: Optional[float] = None    # Parsed from Credit column
    amount: Optional[float] = None           # The non-zero amount
    direction: Optional[str] = None          # "debit" or "credit"
    balance: Optional[float] = None          # Running balance after this transaction
    merchant_or_beneficiary: Optional[str] = None  # Parsed from Note:
    reference_id: Optional[str] = None       # Reference(s) from Note:(...)
    note_text: Optional[str] = None          # Full Note: content


def parse_amount(text: str) -> Optional[float]:
    """
    Parse an amount string like '9,913.16 SAR' or '0.00 SAR' into a float.
    Strips thousands separators and the SAR suffix.
    """
    if not text:
        return None
    # Remove SAR suffix, commas, and whitespace
    cleaned = text.replace('SAR', '').replace(',', '').strip()
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def parse_header(first_page_text: str) -> StatementHeader:
    """Extract statement-level metadata from the first page."""
    header = StatementHeader()

    # Account Number
    m = re.search(r'Account\s+Number\s+(\d+)', first_page_text)
    if m:
        header.account_number = m.group(1)

    # IBAN
    m = re.search(r'IBAN\s+Number\s+(SA\d+)', first_page_text)
    if m:
        header.iban = m.group(1)

    # Customer Name
    m = re.search(r'Customer\s+Name\s+(.+?)(?:\n|ﻞﻴﻤﻌﻟﺍ)', first_page_text)
    if m:
        header.customer_name = m.group(1).strip()

    # Opening Balance
    m = re.search(r'Opening\s+Balance\s+([\d,]+\.?\d*)\s*SAR', first_page_text)
    if m:
        header.opening_balance = parse_amount(m.group(1) + ' SAR')

    # Closing Balance
    m = re.search(r'Closing\s+Balance\s+([\d,]+\.?\d*)\s*SAR', first_page_text)
    if m:
        header.closing_balance = parse_amount(m.group(1) + ' SAR')

    # Period
    m = re.search(r'On\s+The\s+Period\s+(\d{4}/\d{2}/\d{2})\s*-\s*(\d{4}/\d{2}/\d{2})', first_page_text)
    if m:
        header.period_start = m.group(1).replace('/', '-')
        header.period_end = m.group(2).replace('/', '-')

    # Total Deposits / Withdrawals
    m = re.search(r'Total\s+Deposits\s+([\d,]+\.?\d*)\s*SAR', first_page_text)
    if m:
        header.total_deposits = parse_amount(m.group(1) + ' SAR')

    m = re.search(r'Total\s+Withdrawals\s+([\d,]+\.?\d*)\s*SAR', first_page_text)
    if m:
        header.total_withdrawals = parse_amount(m.group(1) + ' SAR')

    # Number of Deposits / Withdrawals
    m = re.search(r'Number\s+Of\s+Deposits\s+(\d+)', first_page_text)
    if m:
        header.num_deposits = int(m.group(1))

    m = re.search(r'Number\s+Of\s+Withdrawals\s+(\d+)', first_page_text)
    if m:
        header.num_withdrawals = int(m.group(1))

    # Ref. No
    m = re.search(r'Ref\.\s*No\s+(\d+)', first_page_text)
    if m:
        header.ref_no = m.group(1)

    return header


# Regex for the date + amounts line:
# 2026/04/01 1,199.00 SAR 0.00 SAR 9,913.16 SAR
DATE_AMOUNTS_RE = re.compile(
    r'^(\d{4}/\d{2}/\d{2})\s+'           # Date
    r'([\d,]+\.?\d*)\s+SAR\s+'           # Debit amount
    r'([\d,]+\.?\d*)\s+SAR\s+'           # Credit amount
    r'([\d,]+\.?\d*)\s+SAR$'             # Balance
)

# Time and Note line: Time:HH:MM:SS**Note:...
TIME_NOTE_RE = re.compile(r'^Time:(\d{2}:\d{2}:\d{2})\*\*Note:(.*)', re.DOTALL)

# Page header lines to skip
PAGE_HEADER_PATTERNS = [
    re.compile(r'^Ref\.\s*No\s+\d+'),
    re.compile(r'^ﻲﻠﺴﻠﺴﺘﻟﺍ'),
    re.compile(r'^Date\s+Transaction\s+Details'),
    re.compile(r'^\d+$'),  # Page numbers
    re.compile(r'^Note$'),
    re.compile(r'^ﺔﻈﺣﻼﻣ$'),
    re.compile(r'^This document is confidential'),
    re.compile(r'^ﺔﻈﻓﺎﺤﻤﻟﺍ'),
]


def is_page_header(line: str) -> bool:
    """Check if a line is a page header/footer that should be skipped."""
    for pattern in PAGE_HEADER_PATTERNS:
        if pattern.match(line):
            return True
    return False


def parse_merchant_from_note(note_text: str, type_line: str) -> tuple:
    """
    Extract merchant/beneficiary and reference from Note: text.
    
    Returns (merchant_or_beneficiary, reference_id)
    """
    if not note_text:
        return (None, None)
    
    note = note_text.strip()
    reference_id = None
    merchant = None
    
    # Pattern 1: POS — Note:(ref1-ref2) MERCHANT, CITY, COUNTRY
    m = re.match(r'^\(([^)]+)\)\s*(.+)', note)
    if m:
        reference_id = m.group(1).strip()
        rest = m.group(2).strip()
        # Merchant is everything before the last two comma-separated parts (CITY, COUNTRY)
        parts = rest.split(',')
        if len(parts) >= 3:
            merchant = ','.join(parts[:-2]).strip()
        elif len(parts) == 2:
            merchant = parts[0].strip()
        else:
            merchant = rest.strip()
        return (merchant, reference_id)
    
    # Pattern 2: Online Purchase — Note:Online Purchase from MERCHANT, CITY
    m = re.match(r'^Online\s+Purchase\s+from\s+(.+)', note, re.IGNORECASE)
    if m:
        rest = m.group(1).strip()
        parts = rest.split(',')
        if len(parts) >= 2:
            merchant = parts[0].strip()
        else:
            merchant = rest.strip()
        return (merchant, None)
    
    # Pattern 3: Card settlement — W - Visa/Mastercard : Advance payment - ...
    if 'Visa/Mastercard' in note and ('Advance payment' in note or 'Refund' in note):
        # No merchant for card settlements
        return (None, None)
    
    # Pattern 4: Internal Transfer — W-/TOACCT/... or W-/FRACCT/...
    if note.startswith('W-/') or note.startswith('W-\n/'):
        return (None, None)
    
    # Pattern 5: IPS Transfer — ref/beneficiary_name
    m = re.match(r'^(\d+)/(.+)', note)
    if m:
        reference_id = m.group(1).strip()
        merchant = m.group(2).strip()
        return (merchant, reference_id)
    
    # Pattern 6: Sadad — W#... or W -/...
    if note.startswith('W#') or note.startswith('W -/'):
        return (None, None)
    
    # Pattern 7: TABBY/Agmt style — (CODE -ref) Agmt ..., MERCHANT, CITY, COUNTRY
    m = re.match(r'^\(([^)]+)\)\s*(.+)', note)
    if m:
        reference_id = m.group(1).strip()
        rest = m.group(2).strip()
        parts = rest.split(',')
        if len(parts) >= 2:
            merchant = parts[-3].strip() if len(parts) >= 3 else parts[0].strip()
        return (merchant, reference_id)
    
    # Pattern 8: International card — 409201******9365 : MERCHANT CITY COUNTRY
    m = re.match(r'^\d{6}\*{6}\d{4}\s*:\s*(.+)', note)
    if m:
        merchant = m.group(1).strip()
        return (merchant, None)
    
    # Fallback: return the note as-is if nothing matched
    return (note.strip() if len(note) < 100 else None, None)


def parse_transactions_from_text(all_pages_text: list[str]) -> list[RawTransaction]:
    """
    Parse transaction rows from all pages of text.
    
    Each transaction block looks like:
        TypeLine (e.g. "POS purchase Apple pay (Domestic)")
        DATE  DEBIT  CREDIT  BALANCE
        Time:HH:MM:SS**Note:...
        (possibly continuation lines for Note)
    
    Key insight: The type line comes BEFORE the date+amounts line.
    Multi-line Notes wrap to subsequent lines until the next type line or date line.
    """
    transactions = []
    row_index = 0
    
    for page_text in all_pages_text:
        lines = page_text.split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Skip empty lines and page headers
            if not line or is_page_header(line):
                i += 1
                continue
            
            # Look for a date+amounts line — this anchors a transaction
            date_match = DATE_AMOUNTS_RE.match(line)
            if date_match:
                tx_date = date_match.group(1)
                debit_raw = date_match.group(2)
                credit_raw = date_match.group(3)
                balance_raw = date_match.group(4)
                
                debit_amt = parse_amount(debit_raw + ' SAR')
                credit_amt = parse_amount(credit_raw + ' SAR')
                balance_amt = parse_amount(balance_raw + ' SAR')
                
                # The type line is the line(s) BEFORE this date line
                # We need to look back to find it. The type line is what we
                # accumulated since the last transaction ended.
                # We handle this by collecting "pending" lines.
                
                # Determine direction
                if credit_amt and credit_amt > 0 and (debit_amt is None or debit_amt == 0):
                    direction = "credit"
                    amount = credit_amt
                else:
                    direction = "debit"
                    amount = debit_amt
                
                # Now collect the Time:**Note: lines that follow
                time_val = None
                note_text = None
                note_lines = []
                raw_desc_parts = []
                
                # Add the type line (collected before this date line)
                # We'll handle this below
                
                i += 1
                # Collect continuation lines (Time:, Note:, wrapped merchant text)
                while i < len(lines):
                    next_line = lines[i].strip()
                    if not next_line:
                        i += 1
                        continue
                    
                    # Check if this is the start of the NEXT transaction
                    # (either a new date+amounts line, or a new type line
                    #  followed by a date line)
                    if DATE_AMOUNTS_RE.match(next_line):
                        break
                    if is_page_header(next_line):
                        i += 1
                        continue
                    
                    # Time:**Note: line
                    time_match = TIME_NOTE_RE.match(next_line)
                    if time_match:
                        time_val = time_match.group(1)
                        note_first = time_match.group(2)
                        note_lines = [note_first]
                        i += 1
                        # Collect wrapped note lines
                        while i < len(lines):
                            wrap_line = lines[i].strip()
                            if not wrap_line:
                                i += 1
                                continue
                            # Stop if we hit a new type line or date line or page header
                            if DATE_AMOUNTS_RE.match(wrap_line) or is_page_header(wrap_line):
                                break
                            # Stop if this looks like a new transaction type line
                            # (i.e., the NEXT line after this is a date+amounts line)
                            if i + 1 < len(lines):
                                peek = lines[i + 1].strip()
                                if DATE_AMOUNTS_RE.match(peek):
                                    # This line is the type line for the next tx
                                    break
                            # Also check if this is a Time: line (shouldn't happen but safety)
                            if TIME_NOTE_RE.match(wrap_line):
                                break
                            note_lines.append(wrap_line)
                            i += 1
                        break
                    else:
                        # This could be a wrapped note continuation or something else
                        # If we haven't seen Time yet, it might be a continuation of type line
                        note_lines.append(next_line)
                        i += 1
                
                note_text = '\n'.join(note_lines).strip() if note_lines else None
                
                # Parse merchant from note
                merchant, reference_id = parse_merchant_from_note(
                    note_text, 
                    pending_type_line if 'pending_type_line' in dir() else ""
                )
                
                # Build raw description from type line + date + time + note
                raw_desc = pending_type_line + '\n' if 'pending_type_line' in dir() and pending_type_line else ''
                raw_desc += f'{tx_date} {debit_raw} SAR {credit_raw} SAR {balance_raw} SAR'
                if time_val:
                    raw_desc += f'\nTime:{time_val}'
                if note_text:
                    raw_desc += f'**Note:{note_text}'
                
                tx = RawTransaction(
                    row_index=row_index,
                    transaction_date=tx_date,
                    transaction_time=time_val,
                    type_line=pending_type_line if 'pending_type_line' in dir() else None,
                    raw_description=raw_desc.strip(),
                    debit_amount=debit_amt,
                    credit_amount=credit_amt,
                    amount=amount,
                    direction=direction,
                    balance=balance_amt,
                    merchant_or_beneficiary=merchant,
                    reference_id=reference_id,
                    note_text=note_text,
                )
                transactions.append(tx)
                row_index += 1
                pending_type_line = ""
                continue
            
            # If not a date line, this might be a type line for the upcoming transaction
            # Store it as the pending type line
            if 'pending_type_line' not in dir() or not pending_type_line:
                pending_type_line = line
            else:
                # Multi-line type (rare but possible)
                pending_type_line += ' ' + line
            i += 1
    
    return transactions


def parse_statement_pdf(file_path: str) -> dict:
    """
    Main entry point: parse an Al Rajhi statement PDF.
    
    Returns {
        "header": StatementHeader dict,
        "transactions": list of RawTransaction dicts,
        "page_count": int,
        "error": str or None,
    }
    """
    try:
        import pdfplumber
    except ImportError:
        return {"header": None, "transactions": [], "page_count": 0, 
                "error": "pdfplumber not installed"}
    
    try:
        with pdfplumber.open(file_path) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                return {"header": None, "transactions": [], "page_count": 0,
                        "error": "PDF has no pages"}
            
            # Extract text from all pages
            all_text = []
            for page in pdf.pages:
                text = page.extract_text() or ""
                all_text.append(text)
            
            # Parse header from first page
            header = parse_header(all_text[0])
            
            # Parse transactions from pages 2+ (index 1+)
            # Page 1 is the header/summary page
            tx_pages = all_text[1:] if len(all_text) > 1 else []
            transactions = parse_transactions_from_text(tx_pages)
            
            logger.info(
                f"Parsed statement: account={header.account_number}, "
                f"period={header.period_start} to {header.period_end}, "
                f"{len(transactions)} transactions from {page_count} pages"
            )
            
            return {
                "header": asdict(header),
                "transactions": [asdict(tx) for tx in transactions],
                "page_count": page_count,
                "error": None,
            }
    
    except Exception as e:
        logger.error(f"Failed to parse statement PDF: {e}", exc_info=True)
        return {"header": None, "transactions": [], "page_count": 0,
                "error": str(e)}
