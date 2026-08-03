"""
Credit-card statement parser (Al Rajhi).

A credit-card statement is a DIFFERENT document from a current-account statement:
it has no table grid (so the table extractor finds nothing), no running balance
and no IBAN. It is line-based text, and each transaction reads:

    10/12/25 Tabby 12/12/25 327.87
    Riyadh SA TYPE MOBILE PAYMENT          <- continuation: location / type

    <txn_date DD/MM/YY> <description> <post_date DD/MM/YY> <amount>[CR]

A trailing "CR" marks a credit (payment received, refund/reversal); no suffix is
a charge. The balance is DEBT: charges raise it, credits lower it. Correctness
oracle from the statement itself:

    closing (outstanding) = brought_forward + charges - credits
    available_credit      = credit_limit - closing        (printed in the header)

so a good parse reproduces the printed available-credit figure exactly.
"""
import re
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional, List

import transaction_types

logger = logging.getLogger("credit_card_parser")

# A transaction row. Both dates are DD/MM/YY; a trailing CR flags a credit.
_TX_RE = re.compile(
    r'^(?P<d1>\d{2}/\d{2}/\d{2})\s+(?P<desc>.+?)\s+(?P<d2>\d{2}/\d{2}/\d{2})\s+'
    r'(?P<amt>[\d,]+\.\d{2})(?P<cr>CR)?\s*$'
)
_BF_RE = re.compile(r'BROUGHT FORWARD BALANCE\s+([\d,]+\.\d{2})(CR)?', re.I)
# Header: "... 4738 27XX XXXX 4897 ..." — the printed card number, last 4 = 4897.
_CARD_RE = re.compile(r'\b\d{4}\s+\d{2}XX\s+XXXX\s+(\d{4})\b')
# The summary figures line: "24,845.32 75,000.00 22,500.00 22,500.00 0"
#   available_credit  credit_limit  ...
_SUMMARY_RE = re.compile(r'^([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+[\d,]+\.\d{2}')
# The repeated page header carries the statement date: "... 10/01/26 36.61 1"
_STMT_DATE_RE = re.compile(r'\b(\d{2}/\d{2}/\d{2})\s+[\d,]+\.\d{2}\s+\d+\s*$')

# Lines that are section markers / page furniture, never a transaction or a
# description continuation.
_SECTION_RE = re.compile(
    r'^(TRANSACTIONS OF|CARD NO\.|BROUGHT FORWARD|PLAN DETAILS:|ORIGINAL PLAN|'
    r'SINGLE INSTALLMENT|REMAINING AMOUNT|MUATH|\d{3}\s+\d)', re.I)


@dataclass
class CardTransaction:
    row_index: int
    txn_date: Optional[str] = None     # YYYY/MM/DD
    post_date: Optional[str] = None    # YYYY/MM/DD
    type_line: Optional[str] = None    # the description (first line)
    note: Optional[str] = None         # continuation text (location / type / fx)
    amount: Optional[float] = None
    direction: Optional[str] = None    # "debit" (charge) | "credit" (payment/refund)
    transaction_type: Optional[str] = None


def _amt(s: str) -> float:
    return float(s.replace(",", ""))


def _norm_date(ddmmyy: str) -> Optional[str]:
    """DD/MM/YY -> YYYY/MM/DD (2000s)."""
    m = re.match(r'^(\d{2})/(\d{2})/(\d{2})$', ddmmyy or "")
    if not m:
        return None
    d, mo, y = m.groups()
    return f"20{y}/{mo}/{d}"


_CCY_RE = re.compile(r'^(aed|usd|eur|gbp|kwd|bhd|aed|try|egp)\b', re.I)


def _classify(desc: str, note: str, direction: str) -> str:
    d = (desc or "").strip()
    text = f"{desc} {note}".lower()
    if "reversal" in text or "refund" in text:
        return transaction_types.REFUND
    if "payment received" in text:
        return transaction_types.CARD_PAYMENT
    if "profit" in text or "interest" in text:
        return transaction_types.INTEREST
    # International purchase — a currency code LEADS the description
    # ("AED 14,610.13 Booking.com"). Checked before fees: the FX purchase's note
    # carries "FXFEE", which must not make the whole purchase a fee.
    if _CCY_RE.match(d):
        return transaction_types.PURCHASE_INTL
    # Standalone fee/VAT/markup lines ("VAT on Forex Markup"). \bfee\b so "fxfee"
    # inside an FX purchase note does not match.
    if "vat on" in text or "markup" in text or re.search(r'\bfee\b', text):
        return transaction_types.FEE
    if direction == "credit":
        return transaction_types.REFUND
    return transaction_types.PURCHASE


def classify(desc: Optional[str], note: Optional[str], direction: Optional[str]) -> str:
    """Public: classify a stored card line at post time from its text + direction."""
    return _classify(desc or "", note or "", direction or "")


def looks_like_credit_card(first_page_text: str) -> bool:
    """A credit-card statement is identified by markers a current account never
    prints: a brought-forward balance and the masked card-number header."""
    t = (first_page_text or "")
    return bool(_BF_RE.search(t) or _CARD_RE.search(t))


def parse_credit_card_pdf(file_path: str) -> dict:
    """Parse a credit-card statement into header + transactions.

    Returns {header, transactions, page_count, error} — the same shape as the
    account parser so the router can treat it uniformly.
    """
    try:
        import pdfplumber
    except ImportError:
        return {"header": None, "transactions": [], "page_count": 0,
                "error": "pdfplumber not installed"}
    try:
        with pdfplumber.open(file_path) as pdf:
            page_count = len(pdf.pages)
            pages = [p.extract_text() or "" for p in pdf.pages]
    except Exception as e:
        logger.error(f"Failed to open credit-card PDF: {e}", exc_info=True)
        return {"header": None, "transactions": [], "page_count": 0, "error": str(e)}

    lines: List[str] = []
    for tp in pages:
        lines.extend(tp.split("\n"))

    # The issuing bank is NOT hardcoded and usually is not in the statement text
    # (the letterhead is an image). It is taken from the linked credit card, which
    # the user set up — see _store_credit_card_lines.
    header = {"bank_key": None, "bank_name": None,
              "card_last4": None, "statement_date": None,
              "brought_forward": None, "credit_limit": None,
              "available_credit": None, "closing_balance": None,
              "period_start": None, "period_end": None}

    for l in lines:
        ls = l.strip()
        if header["card_last4"] is None:
            m = _CARD_RE.search(ls)
            if m:
                header["card_last4"] = m.group(1)
        if header["brought_forward"] is None:
            m = _BF_RE.search(ls)
            if m:
                header["brought_forward"] = _amt(m.group(1)) * (-1 if m.group(2) else 1)
        if header["available_credit"] is None:
            m = _SUMMARY_RE.match(ls)
            if m:
                header["available_credit"] = _amt(m.group(1))
                header["credit_limit"] = _amt(m.group(2))
        if header["statement_date"] is None:
            m = _STMT_DATE_RE.search(ls)
            if m:
                header["statement_date"] = _norm_date(m.group(1))

    # Transactions, in printed order. A non-matching line after a transaction is
    # a description continuation unless it is section furniture.
    txs: List[CardTransaction] = []
    idx = 0
    for l in lines:
        ls = l.strip()
        m = _TX_RE.match(ls)
        if m:
            direction = "credit" if m.group("cr") else "debit"
            desc = m.group("desc").strip()
            txs.append(CardTransaction(
                row_index=idx,
                txn_date=_norm_date(m.group("d1")),
                post_date=_norm_date(m.group("d2")),
                type_line=desc,
                note=None,
                amount=_amt(m.group("amt")),
                direction=direction,
                transaction_type=None,  # set after the note is gathered
            ))
            idx += 1
        elif txs and ls and not _SECTION_RE.match(ls) and not _SUMMARY_RE.match(ls):
            # continuation of the previous transaction's description. Skip the
            # page-summary figures line ("24,845.32 75,000.00 ...") so it does not
            # bleed into the last transaction's note.
            last = txs[-1]
            last.note = (f"{last.note} {ls}" if last.note else ls).strip()

    for t in txs:
        t.transaction_type = _classify(t.type_line or "", t.note or "", t.direction)

    charges = round(sum(t.amount for t in txs if t.direction == "debit"), 2)
    credits = round(sum(t.amount for t in txs if t.direction == "credit"), 2)
    if header["brought_forward"] is not None:
        header["closing_balance"] = round(header["brought_forward"] + charges - credits, 2)
    header["statement_period_start"] = header["period_start"]
    header["statement_period_end"] = header["period_end"]

    return {
        "header": header,
        "transactions": [asdict(t) for t in txs],
        "charges_total": charges,
        "credits_total": credits,
        "page_count": page_count,
        "error": None,
    }
