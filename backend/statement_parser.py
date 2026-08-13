"""
Al Rajhi Bank Statement PDF Parser.

Parses text-based Al Rajhi bank statement PDFs into structured transaction data.
Handles multi-line descriptions, credit/debit detection, and statement-level metadata.

IMPORTANT: Row order is preserved as printed in the PDF. Never re-sort by date or time.
"""
import re
import logging
import unicodedata
from typing import Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger("statement_parser")


# ─── Arabic text normalization ───
# pdfplumber extracts Arabic presentation forms (U+FB50–U+FEFF) in
# left-to-right order, producing reversed, non-joining characters.
# We normalise with NFKC (which maps presentation forms to standard
# Arabic U+0600–U+06FF), then reverse each contiguous Arabic run so
# the text reads correctly right-to-left.

_ARABIC_RE = re.compile(r'[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]+')


def normalize_arabic(text: str) -> str:
    """
    Fix Arabic text extracted from PDF:
    1. NFKC-normalize presentation forms → standard Arabic codepoints
    2. Reverse each contiguous Arabic run (pdfplumber gives them LTR)
    """
    if not text:
        return text
    # Step 1: normalize presentation forms
    text = unicodedata.normalize('NFKC', text)
    # Step 2: reverse each Arabic run
    def _reverse_match(m):
        return m.group(0)[::-1]
    return _ARABIC_RE.sub(_reverse_match, text)


# Which bank issued a statement. bank_key is the canonical id used to scope the
# transaction-type wording rules; bank_name is for display.
#
# The reliable signal is the account's OWN IBAN bank code (SA + 2 check + 2 bank
# code): every Saudi bank has a fixed code, and it can't be confused with a
# counterparty bank named in a transaction line — which is exactly what fooled a
# text-only match (an Aljazira statement quotes "ALRAJHI BANK" as a remitter).
# Name/domain tokens are only a fallback for when no IBAN is found.
_SAUDI_BANK_CODES = {
    "80": ("alrajhi", "Al Rajhi Bank"),
    "60": ("aljazira", "Bank Aljazira"),
    "78": ("stc", "STC Bank"),
    # Extend as more banks are imported — a new code here, never a new type.
}

# Fallback only. Scored by count so a single mention of another bank in a
# transaction narrative cannot outweigh the issuer's own repeated branding.
_BANK_SIGNATURES = [
    ("alrajhi", "Al Rajhi Bank", ("al rajhi", "alrajhi", "rajhi", "الراجحي")),
    ("aljazira", "Bank Aljazira", ("aljazira", "al jazira", "jazira", "الجزيرة")),
    ("stc", "STC Bank", ("stc bank", "stcbank")),
]


def detect_bank(first_page_text: str, iban: Optional[str] = None):
    """Return (bank_key, bank_name) for the ISSUING bank, or (None, None).

    Pass the account's own IBAN (from the header) — its bank code is the
    authoritative signal. Falls back to scored letterhead tokens otherwise.
    """
    if iban and iban.upper().startswith("SA") and len(iban) >= 6:
        code = iban[4:6]
        if code in _SAUDI_BANK_CODES:
            return _SAUDI_BANK_CODES[code]

    text = (first_page_text or "").lower()
    best_key, best_name, best_score = None, None, 0
    for key, name, needles in _BANK_SIGNATURES:
        score = sum(text.count(n) for n in needles)
        if score > best_score:
            best_key, best_name, best_score = key, name, score
    return (best_key, best_name) if best_score else (None, None)


@dataclass
class StatementHeader:
    """Metadata extracted from the statement's first page."""
    bank_key: Optional[str] = None       # canonical issuer id ("alrajhi", "aljazira")
    bank_name: Optional[str] = None      # display name
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

    # ── Bank Aljazira labels its metadata differently ("Account No.:",
    # "Statement Date: 25/01/26 - 24/06/26"). Only fill what Al Rajhi's
    # patterns left empty, so this can never override a good value.
    if header.account_number is None:
        m = re.search(r'Account\s+No\.?\s*:?\s*(\d{6,})', first_page_text)
        if m:
            header.account_number = m.group(1)

    if header.iban is None:
        m = re.search(r'\b(SA\d{20,})\b', first_page_text)
        if m:
            header.iban = m.group(1)

    # Issuing bank — after the IBAN, whose bank code is the authoritative signal.
    header.bank_key, header.bank_name = detect_bank(first_page_text, header.iban)

    if header.customer_name is None:
        m = re.search(r'Account\s+Name\s*:?\s*(.+?)\s*(?:\n|$)', first_page_text)
        if m and m.group(1).strip():
            header.customer_name = m.group(1).strip()

    if header.period_start is None:
        # "Statement Date: 25/01/26 - 24/06/26" (DD/MM/YY, day-first)
        m = re.search(r'(\d{2}/\d{2}/\d{2})\s*-\s*(\d{2}/\d{2}/\d{2})', first_page_text)
        if m:
            start = normalize_date_cell(m.group(1))
            end = normalize_date_cell(m.group(2))
            if start and end:
                header.period_start = start.replace('/', '-')
                header.period_end = end.replace('/', '-')

    return header


# Regex for the date + amounts line:
# 2026/04/01 1,199.00 SAR 0.00 SAR 9,913.16 SAR
DATE_AMOUNTS_RE = re.compile(
    r'^(\d{4}/\d{2}/\d{2})\s+'           # Date
    r'([\d,]+\.?\d*)\s+SAR\s+'           # Debit amount
    r'([\d,]+\.?\d*)\s+SAR\s+'           # Credit amount
    r'([\d,]+\.?\d*)\s+SAR$'             # Balance
)

# Alternate format: date + Time:**Note:...text... DEBIT CREDIT BALANCE
# Used by Al Rajhi for some transactions (e.g. salary/payroll credits)
# Example: 2026/01/25 Time:09:50:55**Note:PAYROLL-PRJHI26025050618- 0.00 SAR 110,095.73 SAR 110,095.73 SAR
INLINE_DATE_RE = re.compile(
    r'^(\d{4}/\d{2}/\d{2})\s+'                     # Date
    r'Time:(\d{2}:\d{2}:\d{2})\*\*Note:(.*?)\s+'    # Inline Time:**Note:...
    r'([\d,]+\.?\d*)\s+SAR\s+'                     # Debit amount
    r'([\d,]+\.?\d*)\s+SAR\s+'                     # Credit amount
    r'([\d,]+\.?\d*)\s+SAR$'                       # Balance
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
    
    # Join wrapped lines — PDF wraps long Note: text across lines
    note = ' '.join(note_text.strip().split('\n'))
    # Collapse multiple spaces
    note = re.sub(r'\s+', ' ', note).strip()
    
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
        # Extract card last4 from the note for reference
        card_match = re.search(r'(\d{6}\*{6}\d{4})', note)
        ref = card_match.group(1) if card_match else None
        return ("Credit Card Settlement", ref)
    
    # Pattern 4: Internal Transfer — W-/TOACCT/...TOname or W-/FRACCT/...FRname
    if 'TOACCT' in note or 'FRACCT' in note:
        # Extract beneficiary: the text after the last TO/FR marker
        # e.g. "W-/TOACCT/18100608010120450TOصباح-" → "صباح"
        acct_match = re.search(r'(?:TOACCT|FRACCT)/\d+(?:TO|FR)(.+?)(?:\s*-|$)', note)
        beneficiary = acct_match.group(1).strip() if acct_match else None
        # Extract account number for reference
        ref_match = re.search(r'(?:TOACCT|FRACCT)/(\d+)', note)
        ref = ref_match.group(1) if ref_match else None
        return (beneficiary, ref)
    
    # Pattern 5: IPS Transfer — ref/beneficiary_name
    m = re.match(r'^(\d+)/(.+)', note)
    if m:
        reference_id = m.group(1).strip()
        merchant = m.group(2).strip()
        return (merchant, reference_id)
    
    # Pattern 6: Sadad — W#... or W -/...
    if note.startswith('W#') or note.startswith('W -/'):
        return ("Sadad Payment", None)
    
    # Pattern 7: International card — 409201******9365 : MERCHANT CITY COUNTRY
    m = re.match(r'^(\d{6}\*{6}\d{4})\s*:\s*(.+)', note)
    if m:
        reference_id = m.group(1)
        merchant = m.group(2).strip()
        return (merchant, reference_id)
    
    # Fallback: return the note as-is if short enough
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
            
            # ── Check for INLINE format first ──
            # e.g. "2026/01/25 Time:09:50:55**Note:PAYROLL-... 0.00 SAR 110,095.73 SAR 110,095.73 SAR"
            inline_match = INLINE_DATE_RE.match(line)
            if inline_match:
                tx_date = inline_match.group(1)
                time_val = inline_match.group(2)
                inline_note = inline_match.group(3).strip()
                debit_raw = inline_match.group(4)
                credit_raw = inline_match.group(5)
                balance_raw = inline_match.group(6)
                
                debit_amt = parse_amount(debit_raw + ' SAR')
                credit_amt = parse_amount(credit_raw + ' SAR')
                balance_amt = parse_amount(balance_raw + ' SAR')
                
                # Determine direction
                if credit_amt and credit_amt > 0 and (debit_amt is None or debit_amt == 0):
                    direction = "credit"
                    amount = credit_amt
                else:
                    direction = "debit"
                    amount = debit_amt
                
                # Collect continuation lines (wrapped note/merchant text)
                note_lines = [inline_note] if inline_note else []
                i += 1
                while i < len(lines):
                    next_line = lines[i].strip()
                    if not next_line:
                        i += 1
                        continue
                    if DATE_AMOUNTS_RE.match(next_line) or INLINE_DATE_RE.match(next_line):
                        break
                    if is_page_header(next_line):
                        i += 1
                        continue
                    if TIME_NOTE_RE.match(next_line):
                        break
                    # Check if next line after this is a date line (making this a type line for next tx)
                    if i + 1 < len(lines):
                        peek = lines[i + 1].strip()
                        if DATE_AMOUNTS_RE.match(peek) or INLINE_DATE_RE.match(peek):
                            break
                    note_lines.append(next_line)
                    i += 1
                
                note_text = '\n'.join(note_lines).strip() if note_lines else None
                
                merchant, reference_id = parse_merchant_from_note(
                    note_text,
                    pending_type_line if 'pending_type_line' in dir() else ""
                )
                
                raw_desc = pending_type_line + '\n' if 'pending_type_line' in dir() and pending_type_line else ''
                raw_desc += f'{tx_date} Time:{time_val}**Note:{note_text or ""}'
                raw_desc += f'\n{debit_raw} SAR {credit_raw} SAR {balance_raw} SAR'
                
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
            
            # ── Standard format: date + amounts on one line ──
            date_match = DATE_AMOUNTS_RE.match(line)
            if date_match:
                tx_date = date_match.group(1)
                debit_raw = date_match.group(2)
                credit_raw = date_match.group(3)
                balance_raw = date_match.group(4)
                
                debit_amt = parse_amount(debit_raw + ' SAR')
                credit_amt = parse_amount(credit_raw + ' SAR')
                balance_amt = parse_amount(balance_raw + ' SAR')
                
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
                
                i += 1
                # Collect continuation lines (Time:, Note:, wrapped merchant text)
                while i < len(lines):
                    next_line = lines[i].strip()
                    if not next_line:
                        i += 1
                        continue
                    
                    # Check if this is the start of the NEXT transaction
                    if DATE_AMOUNTS_RE.match(next_line) or INLINE_DATE_RE.match(next_line):
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
                            if DATE_AMOUNTS_RE.match(wrap_line) or INLINE_DATE_RE.match(wrap_line) or is_page_header(wrap_line):
                                break
                            # Stop if this looks like a new transaction type line
                            if i + 1 < len(lines):
                                peek = lines[i + 1].strip()
                                if DATE_AMOUNTS_RE.match(peek) or INLINE_DATE_RE.match(peek):
                                    break
                            if TIME_NOTE_RE.match(wrap_line):
                                break
                            note_lines.append(wrap_line)
                            i += 1
                        break
                    else:
                        note_lines.append(next_line)
                        i += 1
                
                note_text = '\n'.join(note_lines).strip() if note_lines else None
                
                # Parse merchant from note
                merchant, reference_id = parse_merchant_from_note(
                    note_text, 
                    pending_type_line if 'pending_type_line' in dir() else ""
                )
                
                # Build raw description
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

    Reads the transaction grid with pdfplumber's TABLE extraction. The PDF's rows
    are a real table — [Date, Details, Debit, Credit, Balance] — so the columns are
    read directly instead of being reassembled from wrapped text lines. The old
    line-scanning approach mis-assembled multi-line cells: it dropped rows, lost the
    type/time, and under-counted credits. Details cell looks like:

        Internal Transfer between Accounts        <- type (first line)
        Time:17:47:21, Notes:W-/TOACCT/446...     <- time + note

    Note separator differs between statements ("**Note:" vs ", Notes:"), so both
    are accepted.

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

            # Credit-card statements use the dedicated text-line parser; remap its
            # rows into this entry point's {header, transactions} shape.
            if detect_credit_card_statement(pdf):
                cc = parse_credit_card_pdf(file_path)
                txns = [{
                    "row_index": r["row_index"],
                    "transaction_date": r["txn_date"],
                    "transaction_time": None,
                    "type_line": r["type_line"],
                    "raw_description": r["type_line"],
                    "debit_amount": r["debit"] or None,
                    "credit_amount": r["credit"] or None,
                    "amount": r["amount"],
                    "direction": r["direction"],
                    "balance": None,
                    "merchant_or_beneficiary": None,
                    "reference_id": None,
                    "note_text": r.get("note") or None,
                } for r in cc.get("rows", [])]
                return {"header": cc.get("header"), "transactions": txns,
                        "page_count": page_count, "error": cc.get("error")}

            # Header comes from page 1's text (summary page)
            header = parse_header(normalize_arabic(pdf.pages[0].extract_text() or ""))
            _fill_summary_from_last_page(pdf, header)

            cols = _document_columns(pdf)
            bal_i = cols.get("balance")
            is_stc = (header.bank_key == "stc")

            transactions = []
            idx = 0
            for page in pdf.pages:
                time_by_bal = _time_by_balance(page.extract_text() or "")
                for table in (page.extract_tables() or []):
                    for cells in table:
                        cells, colmap, bcol = _row_view(cells, is_stc, cols, bal_i)
                        if not cells or len(cells) < (max(colmap.values()) + 1):
                            continue
                        # Non-dates (header labels, footers, summary rows) drop out here.
                        date_cell = _row_date(cells, colmap, is_stc)
                        if not date_cell:
                            continue

                        details = normalize_arabic(cells[colmap["details"]] or "")
                        type_line = _row_type_line(details, is_stc) or None

                        txn_time = _extract_time(details)
                        nm = _NOTE_SEP_RE.search(details)
                        note_text = re.sub(r"\s+", " ", nm.group(1)).strip() if nm else None

                        debit = parse_amount(cells[colmap["debit"]]) or 0.0
                        credit = parse_amount(cells[colmap["credit"]]) or 0.0
                        balance = parse_amount(cells[bcol]) if bcol is not None else None
                        # Aljazira's per-row time is on a dropped continuation line;
                        # recover it from the page text, keyed on the running balance.
                        if txn_time is None:
                            txn_time = time_by_bal.get(_bal_cents(balance))

                        direction = "credit" if credit > 0 else "debit"
                        amount = credit if credit > 0 else debit

                        merchant, reference = parse_merchant_from_note(note_text or "", type_line or "")

                        transactions.append(RawTransaction(
                            row_index=idx,
                            transaction_date=date_cell,
                            transaction_time=txn_time,
                            type_line=type_line,
                            raw_description=details,
                            debit_amount=debit,
                            credit_amount=credit,
                            amount=amount,
                            direction=direction,
                            balance=balance,
                            merchant_or_beneficiary=merchant,
                            reference_id=reference,
                            note_text=note_text,
                        ))
                        idx += 1

            logger.info(
                f"Parsed statement (tables): account={header.account_number}, "
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


# ─────────────────────────────────────────────────────────────────────
# Table-based extractor (Phase 1 of the statement redesign).
#
# pdfplumber.extract_tables() returns the Al Rajhi transaction grid as clean
# rows — [Date, Details, Debit, Credit, Balance] — including multi-line cells,
# which the line-regex parser above has to reassemble heuristically. This
# extractor is more robust and also pulls the counterparty account/name,
# reference, and fee flag that the reconciler needs, and validates the
# running-balance chain in integer cents.
# ─────────────────────────────────────────────────────────────────────

# Al Rajhi prints "Time:14:38:22" (colons); Bank Aljazira prints "Time 02.26.40"
# (space + dots). Capture the components so both normalise to HH:MM:SS.
_TIME_RE = re.compile(r'Time[:\s]+(\d{1,2})[:.](\d{2})[:.](\d{2})', re.I)


def _extract_time(text):
    """Transaction time as HH:MM:SS, or None — handles Al Rajhi (colons) and
    Bank Aljazira (space + dots) formats."""
    m = _TIME_RE.search(text or "")
    if not m:
        return None
    h, mi, s = m.groups()
    return f"{int(h):02d}:{mi}:{s}"


_ROW_HEADER_RE = re.compile(r'^\s*\d{2}/\d{2}/\d{2}\b')
_MONEY_TOKEN_RE = re.compile(r'\d[\d,]*\.\d{2}')


def _bal_cents(value):
    """A balance amount (float, or a comma-grouped string) as integer cents."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = float(value.replace(",", ""))
        except ValueError:
            return None
    return round(value * 100)


def _time_by_balance(page_text):
    """Map a row's running balance (integer cents) -> posting time 'HH:MM:SS'.

    Bank Aljazira prints each transaction's time on a continuation line
    ('Date 19-02-1448(H) Time 02.26.40') that the table extractor drops, so it
    never reaches the details cell. In the page TEXT, though, every transaction
    opens with a header line ending in its unique running balance and carries
    that Time line a few rows below — the balance ties the two together. Used
    only as a fallback when the details cell has no time, and keyed on the exact
    running balance, so it cannot mis-attribute a time to the wrong row."""
    out = {}
    cur = None
    for ln in (page_text or "").splitlines():
        if _ROW_HEADER_RE.match(ln):
            nums = _MONEY_TOKEN_RE.findall(ln)
            cur = _bal_cents(nums[-1]) if nums else None
        elif cur is not None:
            t = _extract_time(ln)
            if t:
                out.setdefault(cur, t)
                cur = None
    return out
# Statements differ in how the note is introduced: "Time:..**Note:x" vs
# "Time:.., Notes:x". Accept both so the note/merchant is never lost.
_NOTE_SEP_RE = re.compile(r'(?:\*\*Notes?:|,\s*Notes?:)\s*(.*)', re.S)
_ACCT_RE = re.compile(r'(FRACCT|TOACCT)/(\d+)(?:(?:FR|TO))?([^/\d-]+)?')
_IPS_RE = re.compile(r'([A-Z0-9]{10,})\/([A-Z][A-Za-z .]+)')
_DATE_CELL_RE = re.compile(r'^\d{4}/\d{2}/\d{2}$')

# ─────────────────────────────────────────────────────────────────────
# Multi-bank layout support.
#
# Banks lay the transaction grid out differently:
#   Al Rajhi      no header row, [Date, Details, Debit, Credit, Balance],
#                 dates as YYYY/MM/DD.
#   Bank Aljazira labelled header, [Date, Description, Value Date,
#                 Withdrawal (Dr), Deposit (Cr), Balance], dates as DD/MM/YY.
#
# Reading Aljazira with Al Rajhi's positional map would take its *Value Date*
# as the debit amount — silently producing wrong money rather than failing —
# so the layout is detected from a header row when the statement has one, and
# falls back to Al Rajhi's positional layout when it does not.
# ─────────────────────────────────────────────────────────────────────

_DATE_YMD_RE = re.compile(r'^(\d{4})/(\d{2})/(\d{2})$')   # Al Rajhi  2026/01/25
_DATE_YMD_DASH_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})$')  # STC Bank  2026-01-25
_DATE_DMY_RE = re.compile(r'^(\d{2})/(\d{2})/(\d{2})$')   # Aljazira  26/01/26

# Matched as whole words anywhere in the cell, not anchored: STC labels each
# column bilingually ("التاريخ\nDate", "تفاصيل العملية\nTransaction details"), so
# the English keyword sits after Arabic text rather than filling the cell.
_COL_PATTERNS = {
    "value_date": re.compile(r'value\s*date', re.I),
    "date":       re.compile(r'\bdate\b', re.I),
    "details":    re.compile(r'\b(description|details|particulars|narration|transaction)\b', re.I),
    "debit":      re.compile(r'withdraw|debit|\(dr\)', re.I),
    "credit":     re.compile(r'deposit|credit|\(cr\)', re.I),
    "balance":    re.compile(r'\bbalance\b', re.I),
}

# Al Rajhi's layout, used when a statement has no labelled header row.
_LEGACY_COLUMNS = {"date": 0, "details": 1, "debit": 2, "credit": 3, "balance": 4}


def normalize_date_cell(text: str) -> Optional[str]:
    """Return a cell's date as YYYY/MM/DD, or None if it isn't a date.

    Two-digit dates are read day-first (DD/MM/YY) — the Saudi convention, and
    the statement periods confirm it. Everything is normalised to Al Rajhi's
    existing YYYY/MM/DD shape so downstream consumers need no changes.
    """
    t = (text or "").strip()
    if _DATE_YMD_RE.match(t):
        return t
    m = _DATE_YMD_DASH_RE.match(t)   # STC prints ISO YYYY-MM-DD; slash-normalise
    if m:
        year, month, day = m.groups()
        return f"{year}/{month}/{day}"
    m = _DATE_DMY_RE.match(t)
    if m:
        day, month, year = m.groups()
        return f"20{year}/{month}/{day}"
    return None


# The QR-code watermark ("Scan QR to Validate") STC prints at the top of every
# page bleeds into the first transaction row's cells; drop those fragments.
_STC_FURNITURE_RE = re.compile(r'scan\s*q|to\s*validate|validate', re.I)


def _date_any_line(text: str) -> Optional[str]:
    """normalize_date_cell, but try each line — STC's watermark bleed can push a
    stray fragment ahead of the real date inside one cell."""
    for ln in (text or "").split('\n'):
        d = normalize_date_cell(ln.strip())
        if d:
            return d
    return None


# After compaction STC's columns always read balance, credit, debit, details, date.
_STC_MAP = {"balance": 0, "credit": 1, "debit": 2, "details": 3, "date": 4}


def _row_view(cells, is_stc, cols, bal_i):
    """One table row as (cells, colmap, balance_index).

    STC lays the grid out right-to-left with a varying number of empty spacer
    columns, so the money columns sit at different indices on different pages.
    Dropping the blank spacers — but keeping the "-" placeholders that mark which
    of debit/credit is unused — collapses every page to _STC_MAP's single order.
    Other banks keep the header-detected map unchanged.
    """
    if is_stc:
        cells = [c for c in cells if (c or "").strip() != ""]
        return cells, _STC_MAP, _STC_MAP["balance"]
    return cells, cols, bal_i


def _row_date(cells, colmap, is_stc):
    return _date_any_line(cells[colmap["date"]]) if is_stc \
        else normalize_date_cell(cells[colmap["date"]])


def _row_type_line(details, is_stc):
    """First description line, dropping STC's 'Scan QR to Validate' watermark."""
    lines = [ln.strip() for ln in (details or "").split('\n') if ln.strip()]
    if is_stc:
        lines = [ln for ln in lines if not _STC_FURNITURE_RE.search(ln)] or lines
    return lines[0] if lines else ""


def _detect_columns(row) -> Optional[dict]:
    """Build a column map from a table's header row, or None if it isn't one."""
    if not row:
        return None
    found = {}
    for i, cell in enumerate(row):
        text = re.sub(r'\s+', ' ', (cell or '')).strip()
        # Bilingual headers run longer than one word; still bounded so a wordy
        # data cell can't be mistaken for a header. The all-four requirement
        # below is the real guard.
        if not text or len(text) > 48:
            continue
        if _COL_PATTERNS["value_date"].search(text):
            continue  # a second date column we deliberately ignore
        for key in ("date", "details", "debit", "credit", "balance"):
            if key not in found and _COL_PATTERNS[key].search(text):
                found[key] = i
                break
    # Only a genuine header row names all four date/description/money columns.
    if {"date", "details", "debit", "credit"} <= set(found):
        return found
    return None


def corrected_opening(prev, wd, dep, new):
    """Reconcile a statement summary's four over-determined figures.

    prev - withdrawals + deposits must equal new. Bank Aljazira sometimes prints
    the Previous Balance as the balance AFTER the first same-day transaction (so
    it equals row 0's balance), which is inconsistent with its own New Balance
    and totals and breaks the balance chain + continuity with the prior
    statement. The New Balance and the withdrawal/deposit totals are corroborated
    by the transaction rows, so when the four disagree, derive the true opening
    from them. Returns prev unchanged when the figures are already consistent.
    """
    if prev is None or wd is None or dep is None or new is None:
        return prev
    if abs((prev - wd + dep) - new) > 0.01:
        return round(new + wd - dep, 2)
    return prev


def _fill_summary_from_last_page(pdf, header) -> None:
    """Fill balances from a closing summary table when the header block lacks them.

    Bank Aljazira prints "Previous Balance / Total Withdrawal (Dr) /
    Total Deposit (Cr) / New Balance" as a table on the final page instead of in
    the page-1 header. Only fills values still missing, so Al Rajhi is untouched.
    """
    if header.opening_balance is not None and header.closing_balance is not None:
        return
    try:
        for table in (pdf.pages[-1].extract_tables() or []):
            for i, row in enumerate(table):
                joined = " ".join((c or "") for c in row)
                if re.search(r'Previous\s+Balance', joined, re.I) and i + 1 < len(table):
                    vals = [v for v in (parse_amount(c) for c in table[i + 1]) if v is not None]
                    if len(vals) >= 4:
                        wd, dep, new = vals[1], vals[2], vals[3]
                        prev = corrected_opening(vals[0], wd, dep, new)
                        if header.opening_balance is None:
                            header.opening_balance = prev
                        if header.total_withdrawals is None:
                            header.total_withdrawals = wd
                        if header.total_deposits is None:
                            header.total_deposits = dep
                        if header.closing_balance is None:
                            header.closing_balance = new
                    return
    except Exception:  # a malformed summary must never fail the whole parse
        pass


def _document_columns(pdf) -> dict:
    """Detect the layout once for the whole PDF.

    The header row is printed only on the first table; later tables (and later
    pages) are bare continuation rows, so the map cannot be re-derived per table.
    """
    for page in pdf.pages:
        for table in (page.extract_tables() or []):
            if table:
                cols = _detect_columns(table[0])
                if cols:
                    return cols
    return _LEGACY_COLUMNS


def _cents(value: float) -> int:
    """Convert a currency float to integer cents to avoid float drift."""
    return int(round((value or 0.0) * 100))


def extract_statement_rows(file_path: str) -> dict:
    """
    Extract normalized statement rows using table detection.

    Returns {
        "header": {opening_balance, closing_balance, account_number,
                   num_deposits, num_withdrawals, ...},
        "rows": [ {row_index, txn_date (YYYY-MM-DD), txn_time (HH:MM:SS|None),
                   type_line, note, debit, credit, balance, direction,
                   amount, counterparty_account, counterparty_name,
                   reference, is_fee, category}, ... ],
        "chain_valid": bool,       # running balance closes to closing_balance
        "chain_mismatches": int,
        "error": str | None,
    }
    """
    try:
        import pdfplumber
    except ImportError:
        return {"header": None, "rows": [], "chain_valid": False,
                "chain_mismatches": 0, "error": "pdfplumber not installed"}

    try:
        from statement_category_mapper import map_type_to_category
    except Exception:
        def map_type_to_category(_):  # graceful fallback
            return "Other"

    try:
        with pdfplumber.open(file_path) as pdf:
            if len(pdf.pages) == 0:
                return {"header": None, "rows": [], "chain_valid": False,
                        "chain_mismatches": 0, "error": "PDF has no pages"}

            # A credit-card statement is a different document (text lines, debt
            # balance) — hand it to the dedicated parser rather than the table logic.
            if detect_credit_card_statement(pdf):
                return parse_credit_card_pdf(file_path)

            _hdr = parse_header(normalize_arabic(pdf.pages[0].extract_text() or ""))
            # Some banks (Bank Aljazira) print opening/closing in a last-page
            # summary rather than the page-1 header. Without this, opening comes
            # back None here, the chain validation below starts from 0, and every
            # row is flagged as a mismatch even though the statement is correct.
            _fill_summary_from_last_page(pdf, _hdr)
            header = asdict(_hdr)

            cols = _document_columns(pdf)
            bal_i = cols.get("balance")
            is_stc = header.get("bank_key") == "stc"

            rows = []
            idx = 0
            for page in pdf.pages:
                time_by_bal = _time_by_balance(page.extract_text() or "")
                for table in (page.extract_tables() or []):
                    for cells in table:
                        cells, colmap, bcol = _row_view(cells, is_stc, cols, bal_i)
                        if not cells or len(cells) < (max(colmap.values()) + 1):
                            continue
                        date = _row_date(cells, colmap, is_stc)
                        if not date:
                            continue

                        details = cells[colmap["details"]] or ""
                        first_line = _row_type_line(details, is_stc)
                        txn_time = _extract_time(details)
                        _nm = _NOTE_SEP_RE.search(details)
                        note = re.sub(r'\s+', ' ', _nm.group(1)).strip() if _nm else ""

                        debit = parse_amount(cells[colmap["debit"]]) or 0.0
                        credit = parse_amount(cells[colmap["credit"]]) or 0.0
                        balance = (parse_amount(cells[bcol]) or 0.0) if bcol is not None else 0.0
                        # Aljazira's per-row time is on a dropped continuation line;
                        # recover it from the page text, keyed on the running balance.
                        if txn_time is None:
                            txn_time = time_by_bal.get(_bal_cents(balance))

                        counterparty_account = counterparty_name = reference = None
                        am = _ACCT_RE.search(details)
                        if am:
                            counterparty_account = am.group(2)
                            if am.group(3):
                                counterparty_name = normalize_arabic(am.group(3).strip()) or None
                        im = _IPS_RE.search(details.replace('\n', ' '))
                        if im:
                            reference = im.group(1)
                            counterparty_name = counterparty_name or im.group(2).strip()

                        rows.append({
                            "row_index": idx,
                            "txn_date": date.replace('/', '-'),
                            "txn_time": txn_time,
                            "type_line": first_line,
                            "note": note,
                            "debit": round(debit, 2),
                            "credit": round(credit, 2),
                            "balance": round(balance, 2),
                            "direction": "credit" if credit > 0 else "debit",
                            "amount": round(credit if credit > 0 else debit, 2),
                            "counterparty_account": counterparty_account,
                            "counterparty_name": counterparty_name,
                            "reference": reference,
                            "is_fee": "charge" in first_line.lower(),
                            "category": map_type_to_category(first_line),
                        })
                        idx += 1

            # STC prints opening/closing in a page-1 summary with RTL-split labels
            # the header parser can't read. The transaction rows carry a running
            # balance, so recover the opening from the first row (balance before it)
            # and the closing from the last — only when the header left them blank,
            # so Al Rajhi / Aljazira headers are untouched.
            if header.get("opening_balance") is None and rows:
                r0 = rows[0]
                signed0 = r0["amount"] if r0["direction"] == "credit" else -r0["amount"]
                header["opening_balance"] = round(r0["balance"] - signed0, 2)
            if header.get("closing_balance") is None and rows:
                header["closing_balance"] = rows[-1]["balance"]

            # Validate the running-balance chain in integer cents.
            chain_mismatches = 0
            opening = parse_amount(header.get("opening_balance")) if isinstance(header.get("opening_balance"), str) else header.get("opening_balance")
            running = _cents(opening if opening is not None else 0.0)
            for r in rows:
                running += _cents(r["amount"]) if r["direction"] == "credit" else -_cents(r["amount"])
                if running != _cents(r["balance"]):
                    chain_mismatches += 1
            closing = header.get("closing_balance")
            chain_valid = (chain_mismatches == 0 and closing is not None
                           and running == _cents(closing))

            logger.info(
                f"extract_statement_rows: {len(rows)} rows, "
                f"chain_valid={chain_valid}, mismatches={chain_mismatches}"
            )
            return {"header": header, "rows": rows, "chain_valid": chain_valid,
                    "chain_mismatches": chain_mismatches, "error": None}

    except Exception as e:
        logger.error(f"extract_statement_rows failed: {e}", exc_info=True)
        return {"header": None, "rows": [], "chain_valid": False,
                "chain_mismatches": 0, "error": str(e)}


# ─────────────────────────────────────────────────────────────────────
# Credit-card statements
#
# A card statement is a different document from an account statement: no
# transaction table (the rows are plain text lines), and the balance is DEBT —
# a charge increases what you owe, a payment (marked "CR") reduces it. So it is
# parsed separately and dispatched to from the two entry points below.
#
# Line shape:  DD/MM/YY  DESCRIPTION  DD/MM/YY  AMOUNT[CR]
# with the location/type sometimes wrapping onto the following line. "CR" marks
# a credit (payment or reversal); no suffix is a charge.
# ─────────────────────────────────────────────────────────────────────

_CC_TXN_RE = re.compile(
    r'^(\d{2}/\d{2}/\d{2})\s+(.+?)\s+(\d{2}/\d{2}/\d{2})\s+([\d,]+\.\d{2})(CR)?\s*$'
)
_CC_BROUGHT_FWD_RE = re.compile(r'BROUGHT\s+FORWARD\s+BALANCE\s+([\d,]+\.\d{2})', re.I)
# Lines that end a transaction's description — never fold these into it.
_CC_STOP_RE = re.compile(
    r'BROUGHT\s+FORWARD|TRANSACTIONS\s+OF|CARD\s+NO|TOTAL|MINIMUM|CREDIT\s+LIMIT|'
    r'PAYMENT\s+DUE|STATEMENT\s+DATE|PAGE\s|www\.alrajhi', re.I)


def detect_credit_card_statement(pdf) -> bool:
    """True if this PDF is a credit-card statement (text-based, carries a
    'BROUGHT FORWARD BALANCE' line and no transaction table)."""
    try:
        txt = normalize_arabic(pdf.pages[0].extract_text() or "")
    except Exception:
        return False
    return bool(_CC_BROUGHT_FWD_RE.search(txt))


def _cc_iso(d: str):
    """DD/MM/YY -> YYYY-MM-DD."""
    try:
        dd, mm, yy = d.split("/")
        return "20%s-%s-%s" % (yy, mm, dd)
    except ValueError:
        return None


def _parse_cc_lines(lines: list) -> dict:
    """Pure core of the card-statement parser: turn already-extracted text lines
    into {header, rows}. Kept separate from PDF I/O so it can be unit-tested.
    Direction follows the card's debt convention: a charge is a 'debit' (increases
    what you owe), a CR line is a 'credit' (reduces it)."""
    opening = None
    for l in lines:
        m = _CC_BROUGHT_FWD_RE.search(l)
        if m:
            opening = parse_amount(m.group(1))
            break

    rows = []
    idx = 0
    last = None
    for raw in lines:
        l = raw.strip()
        if not l:
            continue
        m = _CC_TXN_RE.match(l)
        if m:
            txn_date, desc, post_date, amt, cr = m.groups()
            amount = parse_amount(amt) or 0.0
            is_credit = bool(cr)
            rows.append({
                "row_index": idx,
                "txn_date": _cc_iso(txn_date),
                "txn_time": None,
                "type_line": desc.strip(),
                "note": f"posted {_cc_iso(post_date)}" if post_date else "",
                "debit": 0.0 if is_credit else round(amount, 2),
                "credit": round(amount, 2) if is_credit else 0.0,
                "balance": None,   # card statements carry no per-row running balance
                "direction": "credit" if is_credit else "debit",
                "amount": round(amount, 2),
                "counterparty_account": None,
                "counterparty_name": None,
                "reference": None,
                "is_fee": False,
                "category": None,
            })
            last = rows[-1]
            idx += 1
        elif last is not None and not _CC_STOP_RE.search(l):
            # A wrapped location/type continuation for the previous charge.
            last["type_line"] = (last["type_line"] + " " + l).strip()[:255]
        else:
            last = None  # a section boundary — stop folding

    charges = round(sum(r["debit"] for r in rows), 2)
    payments = round(sum(r["credit"] for r in rows), 2)
    # Debt closes higher by charges, lower by payments.
    closing = round((opening or 0.0) + charges - payments, 2) if opening is not None else None

    header = {
        "bank_key": "alrajhi", "bank_name": "Al Rajhi Bank",
        "account_number": None, "iban": None, "customer_name": None,
        "opening_balance": opening, "closing_balance": closing,
        "period_start": rows[0]["txn_date"] if rows else None,
        "period_end": rows[-1]["txn_date"] if rows else None,
        "total_deposits": payments, "total_withdrawals": charges,
        "num_deposits": None, "num_withdrawals": None, "ref_no": None,
        "is_credit_card": True,
    }
    return {"header": header, "rows": rows,
            "chain_valid": True, "chain_mismatches": 0, "error": None}


def parse_credit_card_pdf(file_path: str) -> dict:
    """Extract a credit-card statement into the same {header, rows, ...} shape as
    extract_statement_rows, so the review UI can show it."""
    try:
        import pdfplumber
    except ImportError:
        return {"header": None, "rows": [], "chain_valid": False,
                "chain_mismatches": 0, "error": "pdfplumber not installed"}
    try:
        lines = []
        with pdfplumber.open(file_path) as pdf:
            for p in pdf.pages:
                lines += normalize_arabic(p.extract_text() or "").split("\n")
        return _parse_cc_lines(lines)
    except Exception as e:
        logger.error(f"parse_credit_card_pdf failed: {e}", exc_info=True)
        return {"header": None, "rows": [], "chain_valid": False,
                "chain_mismatches": 0, "error": str(e)}
