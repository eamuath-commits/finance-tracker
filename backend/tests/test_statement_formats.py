"""
Regression tests for multi-bank statement layout handling.

Al Rajhi and Bank Aljazira lay the transaction grid out differently. Reading one
with the other's map does not fail loudly — it reads the wrong COLUMN as the
amount, which is worse than parsing nothing. These lock the layout detection and
date normalisation without needing a PDF fixture.
"""
import statement_parser as SP


class TestDateNormalisation:
    def test_al_rajhi_dates_pass_through(self):
        assert SP.normalize_date_cell("2026/01/25") == "2026/01/25"

    def test_aljazira_dates_are_read_day_first(self):
        # 26/01/26 is 26 January 2026 — the Saudi convention, and the statement
        # period confirms it. Read month-first this would become 1 Feb 2026.
        assert SP.normalize_date_cell("26/01/26") == "2026/01/26"
        assert SP.normalize_date_cell("02/06/26") == "2026/06/02"

    def test_normalises_to_one_shape_so_downstream_is_unchanged(self):
        assert SP.normalize_date_cell("26/01/26").count("/") == 2
        assert len(SP.normalize_date_cell("26/01/26").split("/")[0]) == 4

    def test_non_dates_are_rejected(self):
        for value in ("Date", "", None, "Withdrawal (Dr)", "Balance", "1,234.56"):
            assert SP.normalize_date_cell(value) is None, f"{value!r} should not parse as a date"


class TestSummaryReconciliation:
    """A statement summary's four figures are over-determined; Bank Aljazira
    sometimes prints the Previous Balance as the balance after the first
    transaction, which must be corrected from the corroborated New + totals."""

    def test_consistent_summary_is_left_alone(self):
        # Al Rajhi / a clean Aljazira: prev - wd + dep == new.
        assert SP.corrected_opening(284343.77, 387401.09, 322996.14, 219938.82) == 284343.77

    def test_anomalous_previous_balance_is_corrected(self):
        # The real case: printed prev 216,962.69 is off by the first txn (2,976.13);
        # the true opening 219,938.82 = new + withdrawals - deposits.
        assert SP.corrected_opening(216962.69, 73881.21, 0.0, 146057.61) == 219938.82

    def test_derived_opening_makes_the_chain_close(self):
        prev = SP.corrected_opening(216962.69, 73881.21, 0.0, 146057.61)
        assert abs((prev - 73881.21 + 0.0) - 146057.61) < 0.01

    def test_missing_figures_return_prev_unchanged(self):
        assert SP.corrected_opening(None, 1.0, 2.0, 3.0) is None
        assert SP.corrected_opening(100.0, None, 0.0, 100.0) == 100.0


class TestBankDetection:
    """The issuing bank is identified by the account's own IBAN bank code, which
    a counterparty bank named in a transaction line cannot spoof."""

    def test_al_rajhi_by_iban_code_80(self):
        key, name = SP.detect_bank("", "SA5880000501608011777772")
        assert key == "alrajhi"

    def test_aljazira_by_iban_code_60(self):
        key, name = SP.detect_bank("", "SA1460100003680047908001")
        assert key == "aljazira"

    def test_iban_wins_over_a_transaction_naming_another_bank(self):
        # The real trap: an Aljazira statement quotes "From ALRAJHI BANK" as a
        # remitter. The account's own IBAN (code 60) must still win.
        text = "Bank Aljazira statement\nIncoming Local Transfer From ALRAJHI BANK"
        key, _ = SP.detect_bank(text, "SA1460100003680047908001")
        assert key == "aljazira"

    def test_falls_back_to_letterhead_when_no_iban(self):
        key, _ = SP.detect_bank("Bank Aljazira — Account e-Statement", None)
        assert key == "aljazira"

    def test_letterhead_fallback_is_scored_not_first_hit(self):
        # One "alrajhi" mention (a transaction) must not beat many "aljazira".
        text = ("aljazira bank statement aljazira aljazira aljazira "
                "incoming transfer from alrajhi bank")
        key, _ = SP.detect_bank(text, None)
        assert key == "aljazira"

    def test_unknown_bank_is_none(self):
        assert SP.detect_bank("Some Other Bank", "SA9910000000000000000000") == (None, None)
        assert SP.detect_bank("", None) == (None, None)


class TestColumnDetection:
    ALJAZIRA_HEADER = ["Date", "Description", "Value Date", "Withdrawal (Dr)", "Deposit (Cr)", "Balance"]

    def test_detects_aljazira_layout(self):
        cols = SP._detect_columns(self.ALJAZIRA_HEADER)
        assert cols is not None
        assert cols["date"] == 0
        assert cols["details"] == 1
        assert cols["debit"] == 3      # NOT 2 — column 2 is Value Date
        assert cols["credit"] == 4
        assert cols["balance"] == 5

    def test_value_date_is_never_mistaken_for_the_amount(self):
        # The whole point: mapping debit to column 2 would read a DATE as money.
        cols = SP._detect_columns(self.ALJAZIRA_HEADER)
        assert 2 not in (cols["debit"], cols["credit"]), "Value Date must not be read as an amount"

    def test_a_data_row_is_not_treated_as_a_header(self):
        # Al Rajhi's grid has NO header row — its first row is already data, so
        # detection must decline and let the positional fallback apply.
        al_rajhi_first_row = ["2026/01/25", "Inward IPS Credit", "0.00 SAR", "2,000.00 SAR", "2,000.00 SAR"]
        assert SP._detect_columns(al_rajhi_first_row) is None

    def test_aljazira_data_row_is_not_treated_as_a_header(self):
        row = ["26/01/26", "Incoming Local Transfer", "26/01/26", "", "58,430.24", "342,774.01"]
        assert SP._detect_columns(row) is None

    def test_partial_headers_are_declined(self):
        assert SP._detect_columns(["Date", "Description"]) is None
        assert SP._detect_columns([]) is None
        assert SP._detect_columns(["", "", ""]) is None

    def test_legacy_map_matches_al_rajhi_layout(self):
        cols = SP._LEGACY_COLUMNS
        assert (cols["date"], cols["details"], cols["debit"], cols["credit"], cols["balance"]) == (0, 1, 2, 3, 4)


class TestAmountParsing:
    def test_handles_both_banks_amount_styles(self):
        assert SP.parse_amount("2,000.00 SAR") == 2000.0   # Al Rajhi
        assert SP.parse_amount("58,430.24") == 58430.24    # Aljazira
        assert SP.parse_amount("0.00 SAR") == 0.0

    def test_blank_amount_column_is_none_not_zero(self):
        # Aljazira leaves the unused side of the row empty; treating that as 0.0
        # is fine for summing but it must not look like a parsed value.
        assert SP.parse_amount("") is None
        assert SP.parse_amount(None) is None


class TestTransactionTime:
    def test_extracts_both_bank_time_formats(self):
        assert SP._extract_time("blah Time:14:38:22 rest") == "14:38:22"   # Al Rajhi colons
        assert SP._extract_time("Date 19-02-1448(H) Time 02.26.40") == "02:26:40"  # Aljazira dots
        assert SP._extract_time("Time 2.05.09") == "02:05:09"              # single-digit hour
        assert SP._extract_time("no time on this line") is None

    def test_recovers_aljazira_time_from_page_text_by_balance(self):
        # Aljazira puts the per-row time on a continuation line the table drops;
        # the running balance (unique per row) ties it back to the transaction.
        page = (
            "02/08/26 Credit Card Payment 02/08/26 25,210.78 120,846.83\n"
            "Card 124674897\n"
            "Through Bank Aljazira\n"
            "ONLINE BANKING -Jeddah\n"
            "Date 19-02-1448(H) Time 02.26.40\n"
            "02/08/26 Credit Card Payment 02/08/26 1,560.74 119,286.09\n"
            "Date 19-02-1448(H) Time 02.26.59\n"
            "120,846.83 26,771.52 0.00 119,286.09\n"   # summary row: not a header
        )
        m = SP._time_by_balance(page)
        assert m[SP._bal_cents(120846.83)] == "02:26:40"
        assert m[SP._bal_cents(119286.09)] == "02:26:59"

    def test_period_line_without_a_balance_does_not_capture_a_time(self):
        # A date-led line that carries no money token must not claim the next time.
        page = "01/07/26 to 31/07/26 Statement Period\nTime 09.09.09\n"
        assert SP._time_by_balance(page) == {}


class TestCreditCardStatement:
    """A card statement is a different document: no transaction table, and the
    balance is DEBT — a charge raises it, a CR line (payment) lowers it. These
    lock the text-line parsing and the debt reconciliation without a PDF fixture.
    Figures mirror the real Al Rajhi card statement (opening 54,682.10)."""

    # Representative page text: brought-forward opening, a payment (CR), two
    # charges (one with a wrapped location line), and trailing summary noise.
    LINES = [
        "TRANSACTIONS OF CARD NO 1234",
        "BROUGHT FORWARD BALANCE 54,682.10",
        "21/12/25 PAYMENT RECEIVED - THANK YOU 21/12/25 9,107.28CR",
        "10/12/25 Tabby Riyadh SA 12/12/25 327.87",
        "10/12/25 ETIHADAIR 6072413495257 WWW.ETIHAD 12/12/25 2,241.00",
        "MOBILE PAYMENT",
        "10/01/26 EPP Monthly Profit Amount 10/01/26 24.29",
        "CREDIT LIMIT 75,000.00",
        "MINIMUM PAYMENT DUE 22/07/25 100.00",
    ]

    def result(self):
        return SP._parse_cc_lines(self.LINES)

    def test_extracts_every_transaction_line(self):
        rows = self.result()["rows"]
        assert len(rows) == 4  # payment + 3 charges; summary lines are not rows

    def test_cr_suffix_is_a_credit_that_reduces_debt(self):
        pay = self.result()["rows"][0]
        assert pay["direction"] == "credit"
        assert pay["credit"] == 9107.28 and pay["debit"] == 0.0

    def test_charge_is_a_debit_that_raises_debt(self):
        charge = self.result()["rows"][1]
        assert charge["direction"] == "debit"
        assert charge["debit"] == 327.87 and charge["credit"] == 0.0

    def test_wrapped_location_folds_into_description(self):
        # "MOBILE PAYMENT" wraps under the Etihad charge — it must not be dropped
        # or become a phantom row.
        etihad = self.result()["rows"][2]
        assert etihad["type_line"].endswith("MOBILE PAYMENT")

    def test_summary_lines_are_not_folded_into_the_last_charge(self):
        # CREDIT LIMIT / MINIMUM PAYMENT are section boundaries, not description.
        last = self.result()["rows"][-1]
        assert "CREDIT LIMIT" not in last["type_line"]
        assert "MINIMUM" not in last["type_line"]

    def test_dates_are_iso_day_first(self):
        assert self.result()["rows"][0]["txn_date"] == "2025-12-21"

    def test_opening_is_the_brought_forward_balance(self):
        assert self.result()["header"]["opening_balance"] == 54682.10

    def test_closing_debt_reconciles_opening_plus_charges_minus_payments(self):
        h = self.result()["header"]
        expected = round(54682.10 + h["total_withdrawals"] - h["total_deposits"], 2)
        assert h["closing_balance"] == expected

    def test_flagged_as_credit_card(self):
        assert self.result()["header"]["is_credit_card"] is True


class TestSTCLayout:
    """STC current-account statements are a third layout: bilingual (Arabic+
    English) column headers, ISO YYYY-MM-DD dates, and a right-to-left grid with
    a varying number of empty spacer columns — so the money columns land at
    different indices on different pages. These lock the handling that makes the
    real statement reconcile (opening 13.04, 133 rows) without a PDF fixture."""

    # Page-1 header row: money columns at even indices, blank spacers between.
    HEADER = ["الرصيد\nBalance", "", "دائن\nCredit", "", "مدين\nDebit", "",
              "تفاصيل العملية\nTransaction details", "التاريخ\nDate"]
    # A deposit as it comes off page 1 (spacers at 1/3/5)...
    ROW_P1 = ["4,813.04", "", "4,800.00", "", "-", "", "Incoming Local Transfer", "2026-01-25"]
    # ...and the SAME shape shifted one column right on a later page (spacer first).
    ROW_P2 = ["", "5,213.04", "", "400.00", "", "-", "Deposit - Apple Pay", "2026-01-27"]

    def test_iso_dates_are_normalised_to_slash_shape(self):
        assert SP.normalize_date_cell("2026-01-25") == "2026/01/25"
        assert SP.normalize_date_cell("2026-08-03") == "2026/08/03"

    def test_stc_detected_by_iban_code_78(self):
        key, name = SP.detect_bank("", "SA1478000000001049410863")
        assert (key, name) == ("stc", "STC Bank")

    def test_bilingual_header_is_detected(self):
        cols = SP._detect_columns(self.HEADER)
        assert cols is not None
        assert cols["date"] == 7 and cols["details"] == 6
        assert cols["balance"] == 0 and cols["credit"] == 2 and cols["debit"] == 4

    def test_spacer_columns_collapse_to_one_order_across_pages(self):
        # Both the page-1 and the shifted page-2 row must read the SAME way once
        # the blank spacers are dropped: balance, credit, debit, details, date.
        for row in (self.ROW_P1, self.ROW_P2):
            cells, cmap, bcol = SP._row_view(row, True, None, None)
            assert cells[cmap["balance"]].startswith(("4,813", "5,213"))
            assert cells[cmap["credit"]] in ("4,800.00", "400.00")  # the deposit
            assert cells[cmap["debit"]] == "-"                       # unused side kept
            assert SP._row_date(cells, cmap, True) in ("2026/01/25", "2026/01/27")

    def test_dash_placeholder_is_kept_so_direction_survives(self):
        # Dropping "-" would lose which of debit/credit is the used column.
        cells, cmap, _ = SP._row_view(self.ROW_P1, True, None, None)
        assert len(cells) == 5

    def test_non_stc_rows_are_left_untouched(self):
        cols = {"date": 0, "details": 1, "debit": 2, "credit": 3, "balance": 4}
        cells, cmap, bcol = SP._row_view(["2026/01/25", "x", "1.00", "", "2.00"], False, cols, 4)
        assert cmap is cols and len(cells) == 5

    def test_watermark_date_is_recovered_from_a_later_line(self):
        # The "Scan QR to Validate" watermark bleeds a fragment ahead of the date.
        assert SP._date_any_line("R to Validate\n2026-02-01") == "2026/02/01"

    def test_watermark_is_stripped_from_the_description(self):
        assert SP._row_type_line("Scan QR to Validate\nMusaned", True) == "Musaned"
        # A clean description is unchanged.
        assert SP._row_type_line("Incoming Local Transfer", True) == "Incoming Local Transfer"
