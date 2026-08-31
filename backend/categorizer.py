"""Transaction categorization — a deterministic rule engine + an optional AI
gap-filler.

Design (see the AI memory): the RULES own everything we can know for certain
(transfers, Sarie, known billers, ATM, salary, subscriptions) at 100% precision;
the AI only ever SUGGESTS a category for the genuinely-unknown merchants, and the
user confirms. Nothing here writes — callers apply on the user's approval.

Pure module (no DB / no network) so it's unit-testable. `categorize_rules`
takes plain fields; the AI path lives in main.py via ai_client.
"""
import re
from typing import Optional, Tuple

# The curated set the whole feature works in. Messy legacy categories map onto
# these; the AI is constrained to exactly this list.
CATEGORIES = [
    "Salary", "Transfer", "Groceries", "Food & Dining", "Transport",
    "Bills & Utilities", "Telecom", "Subscriptions", "Shopping", "Healthcare",
    "Loan/Card Payment", "Cash", "Fees", "Other",
]


def _has(text: str, *terms: str) -> bool:
    return any(t in text for t in terms)


# "STC Bank / STC Pay / STC Wallet" is a bank/digital wallet — NOT the telecom
# operator. A transaction there is categorized by what it actually is, never as
# Telecom. (The operator STC — recharge/postpaid/internet — IS Telecom.)
_STC_WALLET_RE = re.compile(r"stc\s*(bank|pay|wallet)", re.I)


def categorize_rules(merchant: Optional[str], notes: Optional[str] = None,
                     transaction_type: Optional[str] = None,
                     direction: Optional[str] = None) -> Optional[Tuple[str, str]]:
    """Return (category, reason) when a rule fires with confidence, else None.
    Checked most-structural / most-specific first."""
    m = (merchant or "").strip()
    blob = f"{m} {notes or ''}".lower()

    # 1. Transfers — structural signals are the strongest we have.
    tt = (transaction_type or "").upper()
    if tt.startswith("TRANSFER") or m.startswith("Transfer →") or m.startswith("Transfer ←") \
       or _has(blob, "internal transfer", "transfer between", "sarie payment order",
               "own account transfer", "حوالة", "تحويل", "sariee inward"):
        # Payroll arriving via Sarie is Salary, not a plain transfer.
        if _has(blob, "payroll", "salary", "راتب"):
            return ("Salary", "rule:salary")
        return ("Transfer", "rule:transfer")

    # 2. Salary / income.
    if _has(blob, "payroll", "salary", "راتب", "wages"):
        return ("Salary", "rule:salary")

    # 3. Cash / ATM.
    if _has(blob, "atm", "cash withdrawal", "withdrawal", "صراف", "سحب نقدي", "cash in"):
        return ("Cash", "rule:cash")

    # 4. Loan / credit-card settlement.
    if _has(blob, "loan", "installment", "instalment", "قسط",
            "credit card payment", "credit cards transactions", "card payment"):
        return ("Loan/Card Payment", "rule:loan")

    # 5. Bills & Utilities (electricity / water / SADAD billers).
    if _has(blob, "saudi electricity", "sec ", "electricity", "كهرباء",
            "national water", "nwc", "water", "مياه", "utility", "فاتورة", "sadad"):
        return ("Bills & Utilities", "rule:bills")

    # 6. Telecom — the OPERATOR only, never the STC wallet/bank.
    if not _STC_WALLET_RE.search(blob):
        if _has(blob, "mobily", "zain", "lebara", "virgin", "جوال", "اتصالات", "انترنت") \
           or re.search(r"\bstc\b", blob):
            return ("Telecom", "rule:telecom")

    # 7. Subscriptions.
    if _has(blob, "netflix", "spotify", "icloud", "apple.com/bill", "google one",
            "microsoft 365", "youtube premium", "amazon prime", "shahid", "osn",
            "subscription", "اشتراك"):
        return ("Subscriptions", "rule:subscription")

    # 8. Healthcare.
    if _has(blob, "pharmacy", "صيدلية", "nahdi", "al dawaa", "dawaa", "hospital",
            "مستشفى", "clinic", "عيادة", "medical", "طبي"):
        return ("Healthcare", "rule:healthcare")

    # 9. Transport (fuel / ride-hail).
    if _has(blob, "fuel", "petrol", "بنزين", "aldrees", "sasco", "petromin",
            "uber", "careem", "taxi", "parking", "مواقف", "saptco"):
        return ("Transport", "rule:transport")

    # 10. Groceries.
    if _has(blob, "tamimi", "panda", "danube", "carrefour", "lulu", "othaim",
            "bin dawood", "بقالة", "supermarket", "هايبر", "grocery"):
        return ("Groceries", "rule:groceries")

    # 11. Food & Dining (incl. delivery).
    if _has(blob, "restaurant", "cafe", "coffee", "مطعم", "كافيه", "starbucks",
            "mcdonald", "kfc", "herfy", "jahez", "hungerstation", "mrsool", "dining"):
        return ("Food & Dining", "rule:dining")

    # 12. Bank fees.
    if _has(blob, "bank fee", "service fee", "رسوم", "vat", "ضريبة") \
       and not _has(blob, "purchase", "شراء"):
        return ("Fees", "rule:fees")

    return None


# Prompt fragment shared with the AI path so it stays consistent with the rules.
AI_RULES = (
    "STC Bank / STC Pay / STC Wallet = a bank/wallet, NOT Telecom. "
    "Only STC as a mobile/internet operator = Telecom. "
    "Internal transfer / Sarie / حوالة / transfer to an account = Transfer. "
    "ATM / صراف / withdrawal = Cash. Payroll / راتب = Salary."
)
