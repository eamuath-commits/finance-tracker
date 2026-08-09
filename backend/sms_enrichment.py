"""
SMS-based name-only enrichment for statement-imported transactions.

Bank statement PDFs carry generic type labels where the counterparty name
should be ("POS purchase Apple pay (Domestic)", "Debit - Credit Cards
Transactions", or a bare Arabic first name like "ساره"). The bank's SMS for the
same event carries the real name ("At:HUNGERSTA", "To:MOHAMMED ISLAM",
"Service:STC BILL"). This module parses a bulk SMS text export locally (no AI)
and proposes overwriting ONLY the merchant name on an already-imported
transaction it can match with high confidence. It never creates, deletes, or
re-amounts anything.

Every threshold here was derived from a measured study of a 982-message AlRajhi
export against live data. Two rules keep it safe:

  1. ALLOWLIST, fail closed. Only an enumerated set of message shapes that carry
     a genuine counterparty may propose a name. Everything else — OTPs, declines,
     beneficiary notices, operation-type labels — is dropped at classification
     time, before any field is read. A new/unknown bank message format is
     therefore inert by default, not a silent enrichment source.

  2. 1:1 BIJECTION over the FULL money-event pool. A proposal is made only when
     exactly one SMS and exactly one transaction claim each other on
     (amount, direction, timestamp within 60s). The competitor pool includes
     name-less money SMS (card top-ups, own-transfers), because filtering to
     named messages first is what lets a purchase name land on the top-up row
     that funded it.

The header timestamp is authoritative; the in-body timestamp is inconsistently
formatted and occasionally off by the Riyadh UTC offset, so it is never used.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta, time as _time_cls
from typing import Dict, List, Optional, Tuple

# Matching tolerances — measured optima, do not change without re-measuring.
#
# 45s, not 60s. The bank SMSes within a few seconds of the transaction: the
# largest delta among accepted matches is 36s, so nothing real sits in the
# 45-60s band. Those extra 15 seconds only pulled in spurious candidates and
# created ambiguity — a fee paid twice 54s apart had both messages seeing both
# transactions, so neither could be told apart and both were refused. Measured
# over the full export: 60s -> 487 proposals / 43 contested; 45s -> 489 / 39,
# with zero proposals lost. Narrowing further is expensive, not safer: 15s drops
# to 252 proposals, discarding ~235 real names to resolve a handful of clashes.
TIME_WINDOW = timedelta(seconds=45)
AMOUNT_EPS = 0.02

# Loan instalments are the one measured exception to the 60s window: the bank
# SMSes them a day BEFORE the statement posts them (statement 2026-04-25 vs SMS
# 2026-04-24, consistent across every month). Their amount is also heavily shared
# with unrelated transfers, so this wider window is only ever applied against rows
# that are themselves loan-instalment labelled — see _candidate().
LOAN_WINDOW = timedelta(days=2)
_LOAN_LABEL_RE = re.compile(r"instal?lments?|loan\s+instal", re.I)


def is_loan_label(merchant):
    """True if a statement label denotes a loan instalment ('Debit T & F
    installments', 'Loan Instalment')."""
    return bool(merchant and _LOAN_LABEL_RE.search(merchant))


# International purchases are a SECOND measured exception, like loans. The card
# authorises (and SMSes) at the point of sale, but the transaction SETTLES onto
# the statement a few days later — a reported case is SMS 28/6 -> statement 1/7
# (3 days), and the posting time-of-day differs from the SMS, so neither the 45s
# window nor the same-time next-day rule reaches it. The lag is a property of
# INTERNATIONAL-scheme transactions, which the statement labels "(International)",
# so — exactly like loans — the wider window is only ever applied against rows
# that are themselves International-labelled, and the bijection's uniqueness guard
# still refuses any ambiguous same-amount pair rather than mis-assigning it.
INTL_WINDOW = timedelta(days=5)
_INTL_LABEL_RE = re.compile(r"international|دولي", re.I)
# SMS purchase kinds that can settle internationally (a domestic PoS posts same
# day and is never International-labelled, so it is deliberately excluded).
_INTL_SHAPES = {"pos_international", "online_purchase", "online_purchase_ar"}


def is_international_label(merchant):
    """True if a statement label denotes an international-scheme purchase
    ('Online purchase Apple pay (International)')."""
    return bool(merchant and _INTL_LABEL_RE.search(merchant))

# Currency tokens that mean Saudi Riyal and are therefore comparable to the
# SAR-settled statement amount. "SR" is a spelling variant, not a foreign
# currency (~160 records). "682" is the ISO-4217 numeric code for SAR.
LOCAL_CURRENCIES = {"SAR", "SR", "ريال", "682"}
# Any other currency (USD/EUR/AED/840/978/...) carries a FOREIGN amount while the
# statement holds the SAR-settled value; they can never be joined on amount, so
# they are excluded from the pool entirely rather than mis-compared.
_ALL_CURRENCIES = r"SAR|SR|USD|EUR|AED|GBP|ريال|682|840|978|784|826"

# ---------------------------------------------------------------------------
# Record splitting and header
# ---------------------------------------------------------------------------

# Records are separated by a line of 4+ dashes. Anchored so the file's leading
# separator does not glue a 52-dash line onto the first record.
_RECORD_SEP = re.compile(r"(?:^|\n)-{4,}[ \t]*(?:\n|$)")
# "2026-03-01 01:19:01 from AlRajhiBank" — 1 record in the wild is "to
# AlRajhiBank" (an outbound message); only "from" is bank-authored.
_HEADER = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s+from\s+(?P<sender>.+?)\s*$",
    re.MULTILINE,
)

# Amount: currency may lead or trail the number, with or without a space, and an
# Arabic tatweel ("بـSR") may precede the code — hence a non-alphanumeric
# lookbehind rather than \b. "SAR" must precede "SR" in the alternation.
_AMT = r"\d[\d,]*(?:\.\d+)?"
_AMOUNT_RE = re.compile(
    r"(?:(?<![A-Za-z0-9])(?P<c1>" + _ALL_CURRENCIES + r")\s*(?P<a1>" + _AMT + r")(?![\d])"
    r"|(?<![\d.,])(?P<a2>" + _AMT + r")\s*(?P<c2>" + _ALL_CURRENCIES + r")(?![A-Za-z0-9]))"
)

_DIGITS4 = re.compile(r"^\*?\d{3,4}$")
# An "At:" value that is really a date/time (the sole "Outgoing Funds Transfer
# Declined" record puts a timestamp there) must never become a name.
_LOOKS_LIKE_DATE = re.compile(r"^\d{1,4}[/\-:]\d{1,2}")


def _clean(text: str) -> str:
    """Strip invisible control/format characters that defeat keyword matching
    (a raw 0x98 byte splits 'fund\\x98in'; U+061C ARABIC LETTER MARK appears in
    several records), keeping newlines and ordinary whitespace."""
    out = []
    for ch in text:
        if ch in "\n\t":
            out.append(ch)
            continue
        cat = unicodedata.category(ch)
        if cat in ("Cc", "Cf", "Co", "Cn"):
            continue
        out.append(ch)
    return "".join(out)


def parse_amount(body: str) -> Tuple[Optional[float], Optional[str]]:
    """Return (amount, currency_token) or (None, None). Never uses a bare \\d{3}
    branch — a numeric currency code is only accepted from the explicit list, so
    '1000.00 ريال' can never parse as amount=0.00, currency='100'."""
    m = _AMOUNT_RE.search(body)
    if not m:
        return None, None
    raw = m.group("a1") or m.group("a2")
    cur = (m.group("c1") or m.group("c2") or "").strip()
    try:
        return float(raw.replace(",", "")), cur
    except ValueError:
        return None, None


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

# A message KIND either (a) may enrich — it is a completed money movement that
# exposes a real counterparty; (b) is money but exposes no usable name (still a
# bijection competitor so it can block a wrong match); or (c) is noise.

_NOISE = "noise"          # never money; excluded before any field is read
_MONEY_UNNAMED = "money"  # real money, no counterparty — competitor only
_MONEY_NAMED = "named"    # real money with a counterparty — may enrich

# Order matters: noise is tested first so a decline that also carries "At:MERCHANT"
# is excluded by KIND before extraction ever runs.
_NOISE_RULES = [
    re.compile(r"one\s*time\s*password|(?<![a-z])otp(?![a-z])", re.I),
    re.compile(r"رمز\s*مؤقت|لا\s*تفصح"),
    re.compile(r"declin", re.I),                        # covers "Outgoing Funds Transfer Declined"
    re.compile(r"^\s*beneficiary\s+(added|activated)", re.I | re.M),
    re.compile(r"مستفيد|المستفيد"),
    re.compile(r"new\s+device|new\s+login|reset\s+your\s+password", re.I),
    re.compile(r"statement\b.*(due|amount due)|amount due", re.I),
    re.compile(r"عميلنا\s+العزيز"),                       # service-request notices
    re.compile(r"payment\s+has\s+been\s+approved", re.I),
    re.compile(r"تمنحك|جوائز|عرض\s|الفوز"),               # marketing / promo
]


@dataclass
class Event:
    index: int
    timestamp: Optional[datetime]
    sender: str
    body: str
    kind: str = _NOISE          # _NOISE | _MONEY_UNNAMED | _MONEY_NAMED
    shape: str = "unknown"      # human-readable sub-type, for stats
    amount: Optional[float] = None
    currency: Optional[str] = None
    direction: Optional[str] = None   # "debit" | "credit"
    name: Optional[str] = None
    is_local: bool = False      # amount comparable to a SAR statement row

    @property
    def matchable(self) -> bool:
        """Eligible to sit in the bijection pool: real money, local currency,
        known direction, parsed amount."""
        return (
            self.kind in (_MONEY_UNNAMED, _MONEY_NAMED)
            and self.is_local
            and self.amount is not None
            and self.direction in ("debit", "credit")
        )


def _to_names(body: str, field_name: str) -> List[str]:
    """All values of a 'Field:...' line that are NOT a bare account number."""
    vals = re.findall(rf"^{field_name}\s*:\s*(.+)$", body, re.MULTILINE | re.IGNORECASE)
    out = []
    for v in vals:
        v = v.strip()
        if not v or _DIGITS4.match(v) or _LOOKS_LIKE_DATE.match(v):
            continue
        out.append(v)
    return out


def _first(body: str, field_name: str) -> Optional[str]:
    names = _to_names(body, field_name)
    return names[0] if names else None


def _line_field(body: str, *labels: str) -> Optional[str]:
    """Value after any of `labels` (each a regex fragment), tolerant of 'Label:',
    'Label :' and one-line runs where the value ends at the next 'Word :' field.
    Rejects bare account numbers and dates — the same guard as _to_names."""
    for lab in labels:
        # [ \t]* (not \s*) so an empty field ("Sender Name:\nDate: ...") does not
        # let the value spill onto the next line and capture 'Date: ...'.
        m = re.search(lab + r"[ \t]*:?[ \t]*(.+)", body, re.I)
        if not m:
            continue
        v = m.group(1)
        v = v.split("\n", 1)[0]                                  # stop at end of line
        # or at the next KNOWN inline field label (a fixed list, so a multi-word
        # merchant like "SAUDI ELECTRICITY COMP" is not itself read as a field).
        v = re.split(r"(?i)\s+(?:of|on|at|from|to|via|amount|available|due|balance|"
                     r"iban|ref|date|acc|card|sender|receiver|instalment|remaining|for)\b\s*:", v, 1)[0]
        v = v.strip().strip(":").strip()
        # reject empties, bare account numbers, dates, and stray field labels
        if v and not _DIGITS4.match(v) and not _LOOKS_LIKE_DATE.match(v) \
                and not re.match(r"(?i)(date|amount|available|due|ref|iban|acc|via)\b", v):
            return v
    return None


# Reference-style fields worth keeping on the enriched transaction's note: a bill
# number, the SADAD service/biller, a transfer reference/IBAN. Their values are
# often digits, so this deliberately does NOT go through _line_field's name guard.
_NOTE_FIELD_RE = re.compile(
    r"(?im)^\s*(Bill(?:\s*No)?|Number|Invoice|Service|Biller|Ref(?:erence)?|IBAN(?:/Alias)?)"
    r"\b\s*:\s*(.+?)\s*$")
_NOTE_LABELS = {"bill": "Bill", "bill no": "Bill", "number": "Number", "invoice": "Invoice",
                "service": "Service", "biller": "Biller", "ref": "Ref", "reference": "Ref",
                "iban": "IBAN", "iban/alias": "IBAN"}


def extract_sms_note(body: str) -> Optional[str]:
    """A concise note of the reference fields an SMS carries — bill number, SADAD
    service/biller, transfer reference/IBAN — so they survive on the enriched
    transaction. Returns None when the SMS has none (e.g. a plain purchase)."""
    seen = {}
    for m in _NOTE_FIELD_RE.finditer(body or ""):
        label = _NOTE_LABELS.get(m.group(1).lower().strip(), m.group(1).strip())
        val = m.group(2).strip()
        if not val or set(val) <= set("*-xX "):   # masked / blank value
            continue
        seen.setdefault(label, val)
    return " · ".join(f"{k}: {v}" for k, v in seen.items()) or None


def _classify_stc(body: str, first: str):
    """STC Bank message shapes (see the export catalogue). Purchases carry the
    merchant in From:/At:/For; transfers carry the person in To:/From."""
    if re.match(r"^Adding money to account", first, re.I):
        return _MONEY_UNNAMED, "stc_topup", "credit", None
    if re.match(r"^(Inward|Internal incoming) transfer", first, re.I):
        return _MONEY_NAMED, "stc_transfer_in", "credit", _line_field(body, r"From")
    if re.match(r"^Transfer between my accounts", first, re.I):
        return _MONEY_UNNAMED, "own_transfer", "debit", None
    if re.match(r"^(Internal outward transfer|Internal transfer|Transfer via|"
                r"Outcome Transfer|Debit Transfer)", first, re.I):
        return _MONEY_NAMED, "stc_transfer_out", "debit", _line_field(body, r"To")
    if re.match(r"^(Apple Pay Purchase|\*{2,}\d+\s+Purchase)", first, re.I):
        return _MONEY_NAMED, "stc_purchase", "debit", _line_field(body, r"From")
    if re.match(r"^Local Purchase", first, re.I):
        return _MONEY_NAMED, "stc_purchase", "debit", _line_field(body, r"At")
    if re.match(r"^Online Purchase", first, re.I):
        return _MONEY_NAMED, "stc_online", "debit", _line_field(body, r"For")
    if re.match(r"^Bill Payment", first, re.I):
        return _MONEY_UNNAMED, "stc_bill", "debit", None
    return _NOISE, "unknown", None, None


def _classify_jazira(body: str, first: str):
    """Bank Aljazira message shapes. Card purchases put the merchant after 'at :',
    transfers put the person in To:/Sender Name."""
    if re.match(r"^(POS Purchase|Online Purchase Apple Pay)", first, re.I):
        return _MONEY_NAMED, "jazira_purchase", "debit", _line_field(body, r"at\s*:")
    if re.match(r"^شراء\s+(عبر\s+نقاط|عبر\s+الانترنت|عبر\s+الإنترنت)", first):
        return _MONEY_NAMED, "jazira_purchase_ar", "debit", _line_field(body, r"لدى", r"At")
    if re.match(r"^Outgoing Funds Transfer Approved", first, re.I):
        return _MONEY_NAMED, "jazira_transfer_out", "debit", _line_field(body, r"To")
    if re.match(r"^Credit transfer\b", first, re.I):
        return _MONEY_NAMED, "jazira_transfer_in", "credit", _line_field(body, r"Sender Name")
    if re.match(r"^Debit transfer\s*:?\s*Loan Instalment", first, re.I):
        return _MONEY_NAMED, "loan_instalment", "debit", "Loan Instalment"
    if re.match(r"^Debit transfer Between Your Accounts", first, re.I):
        return _MONEY_UNNAMED, "own_transfer", "debit", None
    if re.match(r"^Debit transfer\b", first, re.I):
        return _MONEY_UNNAMED, "jazira_transfer_out", "debit", None
    if re.match(r"^Credit Card\s*:?\s*(Payment|Refund)", first, re.I):
        return _MONEY_UNNAMED, "jazira_card_payment", "debit", None
    return _NOISE, "unknown", None, None


def classify(body: str, sender: Optional[str] = None) -> Tuple[str, str, Optional[str], Optional[str]]:
    """Return (kind, shape, direction, name). Pure function of the body (+ sender).

    Direction/name are only meaningful for money kinds. The counterparty name
    is drawn from a fixed whitelist of fields; an operation-type label (OTP
    'Reason:', Arabic 'نوع العملية:') is deliberately never treated as a name.
    The sender selects the bank dialect — STC and Aljazira use different message
    templates from Al Rajhi (the default).
    """
    first = body.strip().split("\n", 1)[0].strip()

    for rx in _NOISE_RULES:
        if rx.search(body):
            return _NOISE, "noise", None, None

    low_sender = (sender or "").lower()
    if "stc" in low_sender:
        return _classify_stc(body, first)
    if "jazira" in low_sender or "جزيرة" in (sender or ""):
        return _classify_jazira(body, first)

    # --- Al Rajhi (default dialect) ---
    # --- card purchases: counterparty is At: ---
    if re.match(r"^(PoS International(\s+purchase)?)", first, re.I):
        return _MONEY_NAMED, "pos_international", "debit", _first(body, "At")
    if re.match(r"^PoS\b", first, re.I):
        return _MONEY_NAMED, "pos_domestic", "debit", _first(body, "At")
    if re.match(r"^Online Purchase", first, re.I):
        return _MONEY_NAMED, "online_purchase", "debit", _first(body, "At")
    if re.match(r"^شراء\s+(إنترنت|انترنت|عبر)", first):
        return _MONEY_NAMED, "online_purchase_ar", "debit", _first(body, "لدى") or _first(body, "At")

    # --- refunds / reversals: money comes BACK, so direction is credit ---
    if re.match(r"^Refund PoS", first, re.I):
        return _MONEY_NAMED, "refund_pos", "credit", _first(body, "At")
    if re.match(r"^Reverse Transaction", first, re.I):
        return _MONEY_NAMED, "reverse_transaction", "credit", _first(body, "At")
    if re.match(r"^Credit Card Refund", first, re.I):
        return _MONEY_NAMED, "credit_card_refund", "credit", _first(body, "From")
    if re.match(r"^استرجاع\s+عملية", first):
        return _MONEY_NAMED, "reversal_ar", "credit", _first(body, "لدى") or _first(body, "At")

    # --- outgoing transfers: user's account is From:, counterparty in To: ---
    if re.match(r"^Debit Internal Transfer", first, re.I):
        return _MONEY_NAMED, "debit_internal_transfer", "debit", _first(body, "To")
    if re.match(r"^Debit Transfer Local", first, re.I):
        return _MONEY_NAMED, "debit_transfer_local", "debit", _first(body, "To")

    # --- incoming transfers: roles INVERT, counterparty in From: ---
    if re.match(r"^Credit Transfer Local", first, re.I):
        return _MONEY_NAMED, "credit_transfer_local", "credit", _first(body, "From")
    if re.match(r"^Credit Transfer Internal", first, re.I):
        return _MONEY_NAMED, "credit_transfer_internal", "credit", _first(body, "From")

    # --- bills ---
    if re.match(r"^Bill Payment", first, re.I):
        svc = _first(body, "Service")
        return _MONEY_NAMED, "bill_payment", "debit", svc
    if re.match(r"^MOI Payments", first, re.I):
        return _MONEY_NAMED, "moi_payments", "debit", _first(body, "Provider") or _first(body, "Service")

    # --- Arabic core-banking deposit: remitter only present after '.من:' ---
    if "تم ايداع" in body or "تم إيداع" in body:
        m = re.search(r"من\s*:\s*(.+?)\s*$", body, re.MULTILINE)
        name = m.group(1).strip() if m else None
        if name and not _DIGITS4.match(name):
            return _MONEY_NAMED, "ar_credit_deposit", "credit", name
        return _MONEY_UNNAMED, "ar_credit_deposit", "credit", None

    # --- money, but NO usable counterparty (bijection competitors only) ---
    # 'نوع العملية:' is an OPERATION TYPE, never a name — must stay unnamed.
    if "تم سحب" in body:
        return _MONEY_UNNAMED, "ar_debit_operation", "debit", None
    if re.match(r"^Credit Card\s*:?\s*Payment", first, re.I):
        return _MONEY_UNNAMED, "credit_card_payment", "debit", None
    if re.match(r"^بطاقة\s+(فيزا|ائتمانية)\s*:?\s*سداد", first):
        return _MONEY_UNNAMED, "card_payment_ar", "debit", None
    if re.match(r"^Transfer Between Your Accounts", first, re.I):
        return _MONEY_UNNAMED, "own_transfer", "debit", None
    if re.match(r"^Withdrawal\s*:?\s*ATM", first, re.I):
        # 'Place:' is an ATM LOCATION, not a merchant — writing it makes a cash
        # withdrawal render as a purchase there. Money event, but never a name.
        return _MONEY_UNNAMED, "atm_withdrawal", "debit", None
    if re.match(r"^Debit\s*:?\s*Loan Instalment", first, re.I):
        # No counterparty in the body (just "Instalment:", "From:", "Remaining
        # Amount:"), but the type itself is a better label than the statement's
        # cryptic "Debit T & F installments", so it may write its own name — and
        # only ever onto a loan-instalment row (see _candidate/_can_write).
        return _MONEY_NAMED, "loan_instalment", "debit", "Loan Instalment"
    if re.match(r"^MOI Payments", first, re.I):
        return _MONEY_UNNAMED, "moi_payments", "debit", None
    if re.match(r"^Credit Card\s*:?\s*transfer", first, re.I):
        return _MONEY_UNNAMED, "cc_transfer", "debit", None

    return _NOISE, "unknown", None, None


# ---------------------------------------------------------------------------
# Parsing a whole export
# ---------------------------------------------------------------------------

def parse_export(raw: str) -> List[Event]:
    """Parse a bulk SMS text export into a list of Events (any encoding of the
    AlRajhi phone export). Never raises on a malformed record — it is skipped."""
    raw = _clean(raw)
    events: List[Event] = []
    for idx, chunk in enumerate(_RECORD_SEP.split(raw)):
        chunk = chunk.strip("\n")
        if not chunk.strip():
            continue
        hm = _HEADER.search(chunk)
        if not hm:
            continue  # no bank header (incl. the lone outbound "to AlRajhiBank")
        try:
            ts = datetime.strptime(hm.group("ts").replace("T", " "), "%Y-%m-%d %H:%M:%S")
        except ValueError:
            ts = None
        sender = hm.group("sender").strip()
        body = chunk[hm.end():].strip()

        ev = Event(index=idx, timestamp=ts, sender=sender, body=body)
        ev.kind, ev.shape, ev.direction, ev.name = classify(body, sender)
        if ev.kind != _NOISE:
            ev.amount, ev.currency = parse_amount(body)
            ev.is_local = ev.currency in LOCAL_CURRENCIES
            if ev.name:
                ev.name = ev.name.strip()
                if not ev.name or _DIGITS4.match(ev.name):
                    ev.name = None
                    ev.kind = _MONEY_UNNAMED
        events.append(ev)
    return events


def parse_exports(raws: List[str]) -> List[Event]:
    """Parse several exports into one event list, de-duplicated.

    Phone exports overlap heavily (a fresh dump repeats everything an older one
    already had). Duplicates are not merely wasteful — two identical SMS would
    both claim the same transaction, the row would look contested, and the
    bijection would correctly refuse to enrich it. So identical messages
    (same header timestamp + same body) collapse to one.
    """
    seen = set()
    out: List[Event] = []
    for raw in raws:
        for ev in parse_export(raw):
            key = (ev.timestamp, ev.body.strip())
            if key in seen:
                continue
            seen.add(key)
            out.append(ev)
    return out


# ---------------------------------------------------------------------------
# Generic-label gate
# ---------------------------------------------------------------------------

# The statement labels a name-only enrichment is allowed to replace. Anything
# not matching stays untouched, so an already-good name is never degraded.
_GENERIC_PREFIXES = (
    "pos purchase", "online purchase", "point of sale", "purchase ",
    "debit - credit cards", "credit cards transaction",
    "sadad payment", "sadad ", "atm withdrawal", "cash withdrawal",
    "outward ips", "inward ips", "outward credit", "transfer from customer",
    "transfer to customer", "refund purchase", "local transfer",
    "internal transfer", "funds transfer", "e-channel", "quick transfer",
    # STC / Aljazira account-statement transfer labels
    "incoming local transfer", "outgoing local transfer", "through bank",
    "own account transfer", "incoming transfer", "outgoing transfer",
    "instant outgoing transfer", "instant incoming transfer", "instant transfer",
)
_GENERIC_EXACT = {"transfer", "pos", "purchase", "payment", "withdrawal", "deposit"}
# One bare Arabic token (a first name) — the statement's usual counterparty label.
_ARABIC_SINGLE = re.compile(r"^[؀-ۿ]+$")


def is_generic_label(merchant: Optional[str]) -> bool:
    """True if `merchant` is a placeholder the enrichment may overwrite."""
    if merchant is None:
        return True
    m = merchant.strip()
    if not m:
        return True
    low = m.lower()
    if low in _GENERIC_EXACT:
        return True
    if any(low.startswith(p) for p in _GENERIC_PREFIXES):
        return True
    # A single bare Arabic token is a first-name-only statement label.
    if _ARABIC_SINGLE.match(m):
        return True
    # "Debit T & F installments" and friends — a loan-instalment type label.
    if is_loan_label(m):
        return True
    return False


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

@dataclass
class TxRow:
    """The minimal projection of a statement-imported transaction the matcher
    needs. Keeps this module free of SQLAlchemy so it is unit-testable."""
    id: str
    timestamp: datetime
    amount: float
    type: str            # "debit" | "credit"
    merchant: Optional[str]
    bank: Optional[str] = None   # bank_key of the row's statement, for same-bank gating


@dataclass
class Proposal:
    transaction_id: str
    old_merchant: Optional[str]
    new_merchant: str
    amount: float
    direction: str
    tx_timestamp: datetime
    sms_timestamp: datetime
    delta_seconds: float
    shape: str
    truncated: bool          # bank-truncated ~9-char fragment
    raw_sms: str


@dataclass
class MatchResult:
    proposals: List[Proposal] = field(default_factory=list)
    stats: Dict[str, int] = field(default_factory=dict)      # per-message view
    skipped: Dict[str, int] = field(default_factory=dict)    # why messages were dropped
    coverage: Dict = field(default_factory=dict)             # per-transaction view


_DAY_SECONDS = 86400.0


_MIDNIGHT = _time_cls(0, 0, 0)


def _sender_bank(sender: Optional[str]) -> Optional[str]:
    s = (sender or "").lower()
    if "stc" in s:
        return "stc"
    if "jazira" in s:
        return "aljazira"
    if "rajhi" in s:
        return "alrajhi"
    return None


def _candidate(ev: Event, tx: TxRow) -> bool:
    if ev.direction != tx.type or abs(ev.amount - tx.amount) > AMOUNT_EPS:
        return False
    # An SMS is about a transaction at ITS OWN bank, so it must never match another
    # bank's statement row of the same amount. Without this an STC transfer SMS
    # could also match an Al Rajhi purchase of the same amount seconds away, making
    # the SMS ambiguous so it enriches NOTHING. Applies to every window below.
    # (Skipped only when a bank is unknown, so nothing is over-restricted.)
    eb = _sender_bank(ev.sender)
    if tx.bank and eb and tx.bank != eb:
        return False
    # Date-only statement rows (STC, Aljazira) carry no posting time — every row is
    # stamped 00:00:00 — so the 45s window can never reach them. Match on calendar
    # date instead: same date + amount + direction, disambiguated by the bijection
    # (two same-amount rows on a day -> ambiguous -> skipped, never guessed). A real
    # transaction is virtually never stamped exactly midnight, so this does not
    # loosen Al Rajhi, whose rows carry real times.
    if tx.timestamp.time() == _MIDNIGHT:
        return ev.timestamp.date() == tx.timestamp.date()
    signed = (ev.timestamp - tx.timestamp).total_seconds()
    dt = abs(signed)
    if ev.shape == "loan_instalment" and is_loan_label(tx.merchant):
        # Only the loan-labelled row gets the wide window. Against every other
        # row this SMS keeps the normal rule, so it still competes correctly for
        # near-simultaneous events without dragging in same-amount transfers.
        return dt <= LOAN_WINDOW.total_seconds()
    if ev.shape in _INTL_SHAPES and is_international_label(tx.merchant):
        # Settlement lag: the SMS (point of sale) PRECEDES the statement posting
        # by up to a few days. Match on date within the lag, requiring the SMS to
        # be the earlier of the pair (a small +45s slack covers same-instant
        # posts). Only International-labelled rows get this window; against any
        # other row this SMS falls through to the normal rule below.
        return -INTL_WINDOW.total_seconds() <= signed <= TIME_WINDOW.total_seconds()
    if dt <= TIME_WINDOW.total_seconds():
        return True

    # ── The bank's evening posting cutoff ──
    # Anything paid after roughly 20:00 is SMSed immediately but posted to the
    # statement the NEXT day, so the two are ~24h apart while the time-of-day
    # still agrees — often to the second. Measured over the full export: 92 such
    # transactions, every one after 20:00, and in every case the SMS is the
    # EARLIER of the pair. (The loan-instalment rule above was this same effect,
    # special-cased before it was understood as a general property of the bank.)
    #
    # This does NOT loosen the time-of-day tolerance: the same window still has
    # to hold, just measured against one day earlier. Requiring the SMS to be the
    # earlier one keeps a transaction from claiming the NEXT day's message.
    if signed < 0:
        return abs(dt - _DAY_SECONDS) <= TIME_WINDOW.total_seconds()
    return False


def _can_write(ev: Event, tx: TxRow) -> bool:
    """A loan-instalment SMS may only ever name a loan-instalment row; writing
    'Loan Instalment' onto some unrelated same-amount transfer would be wrong."""
    if ev.shape == "loan_instalment":
        return is_loan_label(tx.merchant)
    return True


_OWN_TO_RE = re.compile(r"\bTo\s*:\s*\**\s*(\d{3,})")


def _name_own_transfers(events: List[Event], account_names: Dict[str, str]) -> None:
    """An own-account transfer names only a destination account NUMBER ('To: 5225').
    When that resolves to one of the user's own accounts, name the (debit) side of
    the transfer after the destination — 'Transfer → Auto Lease' — instead of
    leaving it blank. Only fires when the number maps to a known account, so an
    unknown destination stays nameless exactly as before."""
    if not account_names:
        return
    for e in events:
        if e.shape == "own_transfer" and e.kind == _MONEY_UNNAMED:
            m = _OWN_TO_RE.search(e.body)
            if not m:
                continue
            nm = account_names.get(m.group(1)[-4:])
            if nm:
                e.name = f"Transfer → {nm}"
                e.kind = _MONEY_NAMED


def match(events: List[Event], txs: List[TxRow],
          account_names: Optional[Dict[str, str]] = None) -> MatchResult:
    """Core bijection matcher. Proposes a name overwrite for a transaction only
    when exactly one money SMS and exactly one transaction claim each other, the
    SMS is a named-allowlisted kind, and the current label is generic.

    The competitor pool is EVERY matchable money event (named or not): a card
    top-up that funded a purchase must be able to block the purchase's name from
    landing on the top-up row.

    account_names maps a user's account last-4 to its name, letting own-account
    transfers be named after their destination (see _name_own_transfers).
    """
    _name_own_transfers(events, account_names or {})
    pool = [e for e in events if e.matchable]

    # Bidirectional candidate degree over the full pool.
    ev_cands: Dict[int, List[TxRow]] = {id(e): [] for e in pool}
    tx_cands: Dict[str, List[Event]] = {t.id: [] for t in txs}
    for e in pool:
        for t in txs:
            if _candidate(e, t):
                ev_cands[id(e)].append(t)
                tx_cands[t.id].append(e)

    res = MatchResult()
    skipped = {
        "ambiguous_sms": 0,       # SMS matches >1 transaction
        "contested_row": 0,       # transaction matched by >1 money SMS (top-up guard)
        "already_named": 0,       # matched but current label not generic
        "no_match": 0,            # named SMS with zero transactions
    }

    seen_tx = set()
    for e in pool:
        if e.kind != _MONEY_NAMED or not e.name:
            continue
        mine = ev_cands[id(e)]
        if len(mine) == 0:
            skipped["no_match"] += 1
            continue
        if len(mine) > 1:
            skipped["ambiguous_sms"] += 1
            continue
        tx = mine[0]
        # The row must be claimed by this SMS alone — a competing money SMS
        # (named or not) means we cannot tell which event this row is.
        if len(tx_cands[tx.id]) != 1:
            skipped["contested_row"] += 1
            continue
        if not _can_write(e, tx):
            skipped["wrong_row_type"] = skipped.get("wrong_row_type", 0) + 1
            continue
        if not is_generic_label(tx.merchant):
            skipped["already_named"] += 1
            continue
        if tx.id in seen_tx:
            skipped["contested_row"] += 1
            continue

        name = e.name.strip()
        # A proposal that wouldn't change anything is noise — and without this a
        # row we already wrote (e.g. "Loan Instalment", which still reads as a
        # generic loan label) would be re-proposed on every single re-run.
        if (tx.merchant or "").strip().lower() == name.lower():
            skipped["no_change"] = skipped.get("no_change", 0) + 1
            continue

        seen_tx.add(tx.id)
        delta = (e.timestamp - tx.timestamp).total_seconds()
        res.proposals.append(Proposal(
            transaction_id=tx.id,
            old_merchant=tx.merchant,
            new_merchant=name,
            amount=tx.amount,
            direction=tx.type,
            tx_timestamp=tx.timestamp,
            sms_timestamp=e.timestamp,
            delta_seconds=delta,
            shape=e.shape,
            truncated=_is_truncated(name, e.shape),
            raw_sms=e.body,
        ))

    res.skipped = skipped
    res.stats = {
        "records": len(events),
        "noise": sum(1 for e in events if e.kind == _NOISE),
        "money_events": sum(1 for e in events if e.kind in (_MONEY_NAMED, _MONEY_UNNAMED)),
        "matchable_pool": len(pool),
        "named_local": sum(1 for e in pool if e.kind == _MONEY_NAMED and e.name),
        "fx_skipped": sum(1 for e in events
                          if e.kind in (_MONEY_NAMED, _MONEY_UNNAMED) and not e.is_local),
        "proposals": len(res.proposals),
    }

    # ── Coverage, counted from the TRANSACTIONS rather than the SMS ──
    # Every figure above answers "what happened to each message". The question
    # actually asked of this feature is the other way round — "I have N
    # transactions, why did only M get a name?" — so report that side too, and
    # group what is left by its current label, which is what explains the gap
    # (internal transfers and card settlements carry no counterparty in the SMS
    # at all, so they can never be named from one).
    proposed_ids = {p.transaction_id for p in res.proposals}
    already_named = [t for t in txs if not is_generic_label(t.merchant)]
    enrichable = [t for t in txs if is_generic_label(t.merchant)]

    unmatched, contested, unnamed_sms = [], [], []
    for t in enrichable:
        if t.id in proposed_ids:
            continue
        cands = tx_cands.get(t.id, [])
        if not cands:
            unmatched.append(t)
        elif len(cands) > 1:
            contested.append(t)
        else:
            # Exactly one SMS is this transaction, but it carries no counterparty
            # to write — "Transfer Between Your Accounts", "Credit Card:Payment"
            # and the Arabic operation-type messages name no one. Without this
            # bucket these rows vanished from the totals and the figures did not
            # add up to the transaction count.
            unnamed_sms.append(t)

    def _by_label(rows):
        out = {}
        for t in rows:
            label = (t.merchant or "(no label)").strip()
            out[label] = out.get(label, 0) + 1
        return sorted(({"label": k, "count": v} for k, v in out.items()),
                      key=lambda r: r["count"], reverse=True)[:8]

    # The transactions themselves, so the report can show WHICH rows are in each
    # bucket rather than only how many. Capped — these are for review, and a
    # bucket in the hundreds is a pattern to read, not a list to page through.
    _CAP = 300

    def _rows(rows, with_candidates=False):
        out = []
        for t in rows[:_CAP]:
            item = {
                "transaction_id": t.id,
                "timestamp": t.timestamp.isoformat() if t.timestamp else None,
                "amount": t.amount,
                "direction": t.type,
                "label": t.merchant,
            }
            if with_candidates:
                # Which messages competed for this row — this is what makes an
                # ambiguous case resolvable by hand instead of just a number.
                item["candidates"] = [
                    {
                        "name": e.name,
                        "shape": e.shape,
                        "timestamp": e.timestamp.isoformat(),
                        "amount": e.amount,
                        "delta_seconds": round((e.timestamp - t.timestamp).total_seconds(), 1),
                    }
                    for e in tx_cands.get(t.id, [])[:6]
                ]
            out.append(item)
        return out

    reasons = {}
    for t in unmatched:
        label = (t.merchant or "(no label)").strip()
        reasons[label] = reasons.get(label, 0) + 1

    res.coverage = {
        "transactions": len(txs),
        "already_named": len(already_named),
        "enrichable": len(enrichable),
        "will_be_named": len(proposed_ids),
        "no_sms_found": len(unmatched),
        "sms_has_no_name": len(unnamed_sms),
        "contested": len(contested),
        # These five buckets are exhaustive and disjoint — they must sum to
        # `transactions`, so the panel can never quietly lose rows.
        "unmatched_by_label": sorted(
            ({"label": k, "count": v} for k, v in reasons.items()),
            key=lambda r: r["count"], reverse=True,
        )[:8],
        "unnamed_sms_by_label": _by_label(unnamed_sms),
        "details": {
            "contested": _rows(contested, with_candidates=True),
            "no_sms_found": _rows(unmatched),
            "sms_has_no_name": _rows(unnamed_sms),
        },
    }
    return res


# The bank truncates the merchant name on card purchases (the "At:" field) to
# ~9 characters; transfer/bill counterparties are not truncated.
_CARD_SHAPES = {"pos_domestic", "online_purchase", "pos_international",
                "refund_pos", "reverse_transaction"}


def _is_truncated(name: str, shape: str) -> bool:
    """Flag a likely bank-truncated fragment ('HUNGERSTA', 'Al Sultan') so the
    UI can group them — they still beat the generic label, but the user asked to
    see them before approving."""
    return shape in _CARD_SHAPES and len(name.strip()) in (9, 10)
