"""Deterministic categorization rules — the confident layer that owns transfers,
billers, ATM, salary, subscriptions, and the STC Bank vs STC-telecom distinction."""
import categorizer as C


def cat(merchant, notes=None, ttype=None, direction=None):
    r = C.categorize_rules(merchant, notes, ttype, direction)
    return r[0] if r else None


class TestRules:
    def test_stc_operator_is_telecom(self):
        assert cat("STC", "mobile recharge") == "Telecom"
        assert cat("Mobily", "postpaid bill") == "Telecom"

    def test_stc_bank_wallet_is_NOT_telecom(self):
        # The bank/wallet must never be Telecom — a purchase there is categorized
        # by what it is, so the rule declines (falls through to AI/other).
        assert cat("STC Bank", "Online purchase Apple pay (Domestic)") is None
        assert cat("STC Pay", "purchase") is None
        assert cat("STC Wallet", "transfer in") is None

    def test_transfers(self):
        assert cat("Transfer → Expense", "Counterparty: معاذ", "TRANSFER_OUT") == "Transfer"
        assert cat("GBOUEO", "Sarie Payment Order W - ER-", "TRANSFER_OUT") == "Transfer"
        assert cat("x", "Internal Transfer between Accounts") == "Transfer"

    def test_payroll_beats_transfer(self):
        assert cat("Payroll", "Sariee Inward Payments PAYROLL DELL", "TRANSFER_IN") == "Salary"

    def test_bills_and_card_and_cash(self):
        assert cat("SAUDI ELECTRICITY COMP", "SAUDI ELECTRICITY COMP") == "Bills & Utilities"
        assert cat("Debit - Credit Cards Transactions") == "Loan/Card Payment"
        assert cat("Cash in", "Cash in") == "Cash"

    def test_subscriptions_and_healthcare_and_transport(self):
        assert cat("Netflix", "Netflix subscription") == "Subscriptions"
        assert cat("Al Nahdi Pharmacy") == "Healthcare"
        assert cat("Careem", "ride") == "Transport"

    def test_unknown_merchant_declines(self):
        assert cat("Amazon SA", "Amazon SA") is None      # -> falls to AI/user
        assert cat("MOONYCOZY* MOONY-29332") is None

    def test_curated_list_is_stable(self):
        assert "Telecom" in C.CATEGORIES and "Transfer" in C.CATEGORIES
        assert len(C.CATEGORIES) == 14


class TestMerchantKey:
    def test_normalizes_variants_together(self):
        assert C.merchant_key("Amazon SA  ") == "amazon sa"
        assert C.merchant_key("MOONYCOZY* MOONY-29332") == "moonycozy"
        assert C.merchant_key("STARBUCKS #1234") == "starbucks"
        assert C.merchant_key(None) == ""
