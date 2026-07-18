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
