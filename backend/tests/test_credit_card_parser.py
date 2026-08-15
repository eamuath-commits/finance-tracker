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

    def test_trailing_running_total_column_is_ignored(self):
        # Aljazira "Visa Infinite" prints a running-total column AFTER the amount.
        # The amount is still the figure right after the posting date; the trailing
        # number must not be taken as the amount (or the row silently dropped).
        cases = [
            ("22/12/25 never enough RIY 26/12/25 114.00 57", "114.00"),
            ("22/12/25 SAR59.88 PAYPAL *STARSEKCE8 26/12/25 61.08 104.79", "61.08"),
            ("23/12/25 mintaqat tarikhiat comRIY 25/12/25 6,438.02 8047.52", "6,438.02"),
            ("08/01/26 GBP8.99 Amazon Prime*ZC6576HQ4 10/01/26 46.51 79.8", "46.51"),
        ]
        for line, expected_amt in cases:
            rows = self._rows(line)
            assert rows, f"row was dropped: {line}"
            assert rows[0][2] == expected_amt, f"{line} -> {rows[0][2]}"
            assert rows[0][3] is False  # these are charges, not credits

    def test_amount_at_end_still_parses_without_a_trailing_column(self):
        # The Ajwa layout has no trailing column — must still work.
        rows = self._rows("10/12/25 Tabby 12/12/25 327.87")
        assert rows[0][2] == "327.87"


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


class TestAlRajhiRTL:
    """The newer Al Rajhi (Travel Plus) layout is RTL + multi-currency. Rows are
    reconstructed from word coordinates, so these lock the reversed-column row
    regex and the wallet detection that reconciled all five real statements."""

    def test_matches_a_sar_charge_row(self):
        m = CC._RJ_TX_RE.match("550.79 10.80 Amount: 539.99 539.99 SAR 01/03/26 27/02/26")
        assert m and m.group("cr") is None
        assert m.group("billing") == "550.79" and m.group("fees") == "10.80"
        assert m.group("amt") == "539.99" and m.group("ccy") == "SAR"
        assert m.group("post") == "01/03/26" and m.group("txn") == "27/02/26"

    def test_matches_a_cr_credit_row(self):
        m = CC._RJ_TX_RE.match("CR 146.00 0.00 Advance Payment 2026-03-11 146.00 SAR 11/03/26 11/03/26")
        assert m and m.group("cr") is not None
        assert m.group("billing") == "146.00" and "Advance Payment" in m.group("desc")

    def test_matches_a_foreign_wallet_row(self):
        m = CC._RJ_TX_RE.match("23.00 0.00 23.00 USD 03/04/26 01/04/26")
        assert m and m.group("ccy") == "USD" and m.group("billing") == "23.00"

    def test_a_bare_amount_row_has_empty_desc(self):
        m = CC._RJ_TX_RE.match("102.33 0.00 102.33 SAR 03/03/26 01/03/26")
        assert m and m.group("desc") == "" and m.group("amt") == "102.33"

    def test_wallet_section_maps_to_currency(self):
        assert CC._WALLET_MAP["SAUDI RIYAL"] == "SAR"
        assert CC._WALLET_MAP["US DOLLAR"] == "USD"
        assert CC._RJ_WALLET_RE.search("Transaction Details US DOLLAR Wallet").group(1).upper() == "US DOLLAR"

    def test_looks_like_detects_the_rtl_row(self):
        assert CC._rj_looks_like(["550.79 10.80 Amount: 539.99 539.99 SAR 01/03/26 27/02/26"]) is True
        assert CC._rj_looks_like(["10/12/25 Tabby 12/12/25 327.87"]) is False  # legacy row
