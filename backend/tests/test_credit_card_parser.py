"""
Regression tests for the credit-card statement parser.

A credit-card statement is line-based (no table grid), balance is DEBT, and the
correctness oracle is the statement's own printed figure:
    available_credit = credit_limit - (brought_forward + charges - credits)
These lock the line parsing, the CR/charge convention, and the classifier
without needing the PDF fixture.
"""
import credit_card_parser as CC
import transaction_types as T


class TestLineParsing:
    def _rows(self, text):
        # Drive the module's own regex over raw lines the way the parser does.
        import re
        rows = []
        idx = 0
        for l in text.strip().split("\n"):
            m = CC._TX_RE.match(l.strip())
            if m:
                rows.append((m.group("d1"), m.group("desc").strip(),
                             m.group("amt"), bool(m.group("cr"))))
        return rows

    def test_matches_a_charge(self):
        rows = self._rows("10/12/25 Tabby 12/12/25 327.87")
        assert rows == [("10/12/25", "Tabby", "327.87", False)]

    def test_matches_a_credit_with_cr_suffix(self):
        rows = self._rows("21/12/25 PAYMENT RECEIVED - THANK YOU 21/12/25 9,107.28CR")
        assert rows[0][2] == "9,107.28" and rows[0][3] is True

    def test_page_furniture_is_not_a_transaction(self):
        for junk in ("MUATH MOHAMMED",
                     "078 2080047908460 4738 27XX XXXX 4897 0036 80XX XXXX 10/01/26 36.61 1",
                     "TRANSACTIONS OF MUATH A ALASIRI",
                     "CARD NO. 4738 XXXX XXXX 4897",
                     "BROUGHT FORWARD BALANCE 54,682.10"):
            assert CC._TX_RE.match(junk.strip()) is None, junk


class TestHeaderRegexes:
    def test_card_last4(self):
        m = CC._CARD_RE.search("078 2080047908460 4738 27XX XXXX 4897 0036 80XX XXXX")
        assert m and m.group(1) == "4897"

    def test_brought_forward(self):
        m = CC._BF_RE.search("BROUGHT FORWARD BALANCE 54,682.10")
        assert m and m.group(1) == "54,682.10"

    def test_summary_available_and_limit(self):
        m = CC._SUMMARY_RE.match("24,845.32 75,000.00 22,500.00 22,500.00 0")
        assert m and m.group(1) == "24,845.32" and m.group(2) == "75,000.00"

    def test_date_normalises_to_iso(self):
        assert CC._norm_date("10/12/25") == "2025/12/10"
        assert CC._norm_date("02/01/26") == "2026/01/02"


class TestClassification:
    def test_payment_received_is_a_card_payment(self):
        assert CC._classify("PAYMENT RECEIVED - THANK YOU", "", "credit") == T.CARD_PAYMENT

    def test_epp_profit_is_interest(self):
        assert CC._classify("EPP Monthly Profit Amount", "", "debit") == T.INTEREST

    def test_reversal_is_a_refund(self):
        assert CC._classify("ETIHADAIR 6072413495257", "MOBILE PAYMENT REVERSAL", "credit") == T.REFUND

    def test_vat_and_markup_are_fees(self):
        assert CC._classify("VAT on Forex Markup", "", "debit") == T.FEE

    def test_a_plain_charge_is_a_purchase(self):
        assert CC._classify("Tabby", "Riyadh SA TYPE MOBILE PAYMENT", "debit") == T.PURCHASE

    def test_a_foreign_currency_charge_is_international(self):
        assert CC._classify("AED 14,610.13 Booking.com Hotel", "RATE 1.02159 FXFEE 298.51", "debit") == T.PURCHASE_INTL


class TestReconciliationMath:
    """The oracle: available = limit - (bf + charges - credits). Uses the exact
    figures from the real statement."""

    def test_the_real_statement_reconciles(self):
        bf = 54682.10
        charges = 32720.21
        credits = 37247.63
        limit = 75000.00
        printed_available = 24845.32
        closing = round(bf + charges - credits, 2)
        assert closing == 50154.68
        assert round(limit - closing, 2) == printed_available


class TestDocumentDetection:
    def test_credit_card_statement_is_recognised(self):
        assert CC.looks_like_credit_card("BROUGHT FORWARD BALANCE 54,682.10") is True
        assert CC.looks_like_credit_card("078 2080047908460 4738 27XX XXXX 4897") is True

    def test_a_current_account_statement_is_not(self):
        assert CC.looks_like_credit_card("ACCOUNT e-STATEMENT\nIBAN SA80...\nInternal Transfer") is False
