"""
Bank transaction types — what the bank DID, as distinct from what the money was
spent on.

These are two different axes and conflating them is what left 570 of 911
statement rows sitting in the spending category "Other":

    transaction_type   PURCHASE, INTERNAL_TRANSFER, BILL_PAYMENT, FEE ...
                       the operation the bank performed. Derived from the
                       statement's own type_line, so it is fact, not inference.

    category           Groceries, Fuel, Utilities ...
                       what the money was for. A judgement, and meaningless for
                       an internal transfer or a fee.

A ledger needs the first one. Moving 5,000 between your own accounts is not
spending, and a 0.29 transfer charge is not a purchase — but both counted as
expenses while the only axis available was "category".
"""
from typing import Optional

# ── The taxonomy ──
PURCHASE = "PURCHASE"                     # card purchase, domestic
PURCHASE_INTL = "PURCHASE_INTL"           # card purchase, international
CARD_PAYMENT = "CARD_PAYMENT"             # settling a credit card
ATM_WITHDRAWAL = "ATM_WITHDRAWAL"         # cash out
INTERNAL_TRANSFER = "INTERNAL_TRANSFER"   # between the user's OWN accounts
TRANSFER_OUT = "TRANSFER_OUT"             # local transfer to someone else
TRANSFER_IN = "TRANSFER_IN"               # local transfer received
BILL_PAYMENT = "BILL_PAYMENT"             # SADAD and friends
LOAN_INSTALMENT = "LOAN_INSTALMENT"
FEE = "FEE"                               # bank charges, FX markup
REFUND = "REFUND"
OTHER = "OTHER"                           # genuinely unrecognised — see below

ALL_TYPES = [
    PURCHASE, PURCHASE_INTL, CARD_PAYMENT, ATM_WITHDRAWAL, INTERNAL_TRANSFER,
    TRANSFER_OUT, TRANSFER_IN, BILL_PAYMENT, LOAN_INSTALMENT, FEE, REFUND, OTHER,
]

# Types that are NOT spending. Money leaving one of your pockets for another is
# not an expense, and a fee is real but is not a purchase — counting either in
# spending totals overstates them (252 internal transfers did exactly that).
NON_SPENDING_TYPES = {INTERNAL_TRANSFER, FEE}

# Human labels for the UI.
TYPE_LABELS = {
    PURCHASE: "Purchase",
    PURCHASE_INTL: "Purchase (International)",
    CARD_PAYMENT: "Credit Card Payment",
    ATM_WITHDRAWAL: "ATM Withdrawal",
    INTERNAL_TRANSFER: "Internal Transfer",
    TRANSFER_OUT: "Transfer Out",
    TRANSFER_IN: "Transfer In",
    BILL_PAYMENT: "Bill Payment",
    LOAN_INSTALMENT: "Loan Instalment",
    FEE: "Fee",
    REFUND: "Refund",
    OTHER: "Other",
}

# ── Matching rules ──
# The taxonomy above is universal; the WORDING that maps into it is per-bank.
# So the rules are in two sets:
#
#   _UNIVERSAL_RULES  words that mean the same at any bank ("sadad", "purchase",
#                     "outgoing", "loan repayment"). Every statement uses these.
#   _BANK_RULES       words unique to ONE bank, applied ONLY to that bank's
#                     statements. A generic descriptor like "Through Bank
#                     Aljazira" is safe here because it can never touch another
#                     bank's rows.
#
# classify_type_line() checks the statement's own bank rules first (most
# specific), then the universal set, then a direction-based fallback. Adding a
# bank means adding its words here — never a new type.
#
# Ordered within a set: the FIRST needle found in the lowercased type_line wins,
# so specific beats general ("transaction charges" must beat "transfer").
_UNIVERSAL_RULES = [
    # Fees first — several contain the word "transfer" or "payment".
    ("transaction charges", FEE),
    ("payment fees", FEE),
    ("currencies debit card markup", FEE),
    ("markup", FEE),
    ("charges", FEE),
    ("fees", FEE),

    # Refunds before purchases ("POS refund" contains "pos").
    ("refund", REFUND),
    ("reversal", REFUND),

    # Loans. "installment/instalment" is Al Rajhi ("Debit T & F installments");
    # "loan repayment" is Bank Aljazira. Both are bank-neutral words for the same
    # thing, so they live in the universal set.
    ("t & f installment", LOAN_INSTALMENT),
    ("t&f installment", LOAN_INSTALMENT),
    ("instalment", LOAN_INSTALMENT),
    ("installment", LOAN_INSTALMENT),
    ("loan repayment", LOAN_INSTALMENT),
    ("loan payment", LOAN_INSTALMENT),

    # Cards.
    ("credit cards transactions", CARD_PAYMENT),
    ("credit card payment", CARD_PAYMENT),
    ("visa payment", CARD_PAYMENT),

    ("atm", ATM_WITHDRAWAL),

    # Bills.
    ("sadad", BILL_PAYMENT),
    ("bill payment", BILL_PAYMENT),

    # Internal transfers — the user's own accounts.
    ("internal transfer", INTERNAL_TRANSFER),
    ("transfer between", INTERNAL_TRANSFER),
    ("to customer account", INTERNAL_TRANSFER),
    ("from customer account", INTERNAL_TRANSFER),

    # Directed local transfers. The direction is in the wording itself, so the
    # type does not depend on the debit/credit flag: Al Rajhi says
    # "Outward/Inward", Bank Aljazira says "Outgoing/Incoming". Listed before the
    # order/sarie rules so "Inward Local Payment Order" is a receipt.
    ("outward", TRANSFER_OUT),
    ("outgoing", TRANSFER_OUT),
    ("inward", TRANSFER_IN),
    ("incoming", TRANSFER_IN),
    # Sarie is the Saudi instant-payment rail; a "payment order" on it is money
    # being sent.
    ("payment order", TRANSFER_OUT),
    ("sarie", TRANSFER_OUT),
    ("sariee", TRANSFER_OUT),

    # Purchases. International before domestic.
    ("(international)", PURCHASE_INTL),
    ("international", PURCHASE_INTL),
    ("purchase", PURCHASE),
    ("pos ", PURCHASE),
]

# Words unique to one bank, applied ONLY when the statement is from that bank.
# Keyed by bank_key (see bank_detection). Safe to be generic here — these never
# run against another bank's rows.
_BANK_RULES = {
    "aljazira": [
        # The two commodity legs of a murabaha loan settlement print as "Through
        # Bank Aljazira" (confirmed by the account owner as part of the RBG EIR
        # DINAR COMMODITY loan). This is a generic descriptor, so it MUST stay
        # bank-scoped: applied to an Al Rajhi statement it would be wrong.
        ("through bank aljazira", LOAN_INSTALMENT),
    ],
}


def _apply(rules, text):
    for needle, ttype in rules:
        if needle in text:
            return ttype
    return None


def classify_type_line(type_line: Optional[str], direction: Optional[str] = None,
                       bank_key: Optional[str] = None) -> str:
    """Map a statement's own type_line to a universal transaction type.

    bank_key scopes the bank-specific wording: an Aljazira rule only fires for an
    Aljazira statement. `direction` ("debit"/"credit") only breaks the tie for a
    bare "Transfer", which the bank emits without saying which way it went.
    """
    text = (type_line or "").strip().lower()
    if not text:
        return OTHER

    # This bank's own words first (most specific), then the universal set.
    if bank_key:
        hit = _apply(_BANK_RULES.get(bank_key, []), text)
        if hit:
            return hit

    hit = _apply(_UNIVERSAL_RULES, text)
    if hit:
        return hit

    # A bare "Transfer" says nothing about direction; the ledger does.
    if "transfer" in text:
        return TRANSFER_IN if (direction or "").lower() == "credit" else TRANSFER_OUT

    return OTHER


def is_spending(transaction_type: Optional[str], direction: Optional[str] = None) -> bool:
    """True if this should count towards expense totals.

    Only debits can be spending, and internal transfers and fees are excluded
    even though they are debits.
    """
    if (direction or "").lower() != "debit":
        return False
    return (transaction_type or OTHER) not in NON_SPENDING_TYPES
