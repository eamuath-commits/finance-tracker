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
