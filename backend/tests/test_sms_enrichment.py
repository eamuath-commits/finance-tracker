"""
Regression tests for SMS -> statement name enrichment.

Pure unit tests: sms_enrichment deliberately has no SQLAlchemy dependency, so
the matcher can be exercised directly. These lock the safety properties — the
ones whose failure silently corrupts a real ledger rather than throwing.
"""
from datetime import datetime, timedelta

import sms_enrichment as E


def _sms(header_ts: str, body: str) -> str:
    return f"----------------------------------------------------\n{header_ts} from AlRajhiBank\n\n{body}\n"


def _tx(tx_id, ts, amount, type_, merchant):
    return E.TxRow(id=tx_id, timestamp=datetime.strptime(ts, "%Y-%m-%d %H:%M:%S"),
                   amount=amount, type=type_, merchant=merchant)


class TestNoiseIsNeverEnriched:
    """Messages where no money moved must never name a transaction."""

    def test_otp_quoting_the_same_amount_does_not_enrich(self):
        # The sharpest trap: an OTP quotes the amount of the transfer that
        # follows seconds later, so amount+time alone would match the real row.
        raw = _sms("2026-03-02 23:48:58", "OTP Code:3201\nReason:Rajhi Transfer - Mobile App\nAmount:150.00 SAR")
        txs = [_tx("t1", "2026-03-02 23:48:58", 150.0, "debit", "معاذ")]
        res = E.match(E.parse_export(raw), txs)
        assert res.proposals == []

    def test_declined_transaction_does_not_enrich(self):
        # Has BOTH an amount and a merchant, but the money never moved.
        raw = _sms("2026-03-04 23:22:48",
                   "Transaction Declined: Insufficient funds.\nTransaction: Online Purchase\n"
                   "Card: 7868\nAmount: SAR 31.29\nAt: ADOBE *8\nDate: 4/3/26 23:22")
        txs = [_tx("t1", "2026-03-04 23:22:48", 31.29, "debit", "معاذ")]
        res = E.match(E.parse_export(raw), txs)
        assert res.proposals == []

    def test_declined_outgoing_transfer_with_a_name_does_not_enrich(self):
        raw = _sms("2026-03-01 22:17:11",
                   "Outgoing Funds Transfer Declined\nFrom: *1505\nTo: أكاديمية فارس رياضية\n"
                   "IBAN: *6000\nAmount: 1100 SAR\nReason: System error [Error DS24]")
        txs = [_tx("t1", "2026-03-01 22:17:11", 1100.0, "debit", "محمد")]
        res = E.match(E.parse_export(raw), txs)
        assert res.proposals == []

    def test_beneficiary_management_does_not_enrich(self):
        raw = _sms("2026-03-07 22:00:21", "Beneficiary added: MD MITHU PRODHAN")
        txs = [_tx("t1", "2026-03-07 22:00:21", 700.0, "debit", "محمد")]
        assert E.match(E.parse_export(raw), txs).proposals == []


class TestRealEventsEnrich:
    def test_purchase_names_the_merchant(self):
        raw = _sms("2026-03-01 02:08:31",
                   "Online Purchase\nBy:9365;mada-Apple Pay\nFrom:1505\nAmount:SAR 88.74\nAt:HUNGERSTA\n1/3/26 02:08")
        txs = [_tx("t1", "2026-03-01 02:08:31", 88.74, "debit", "POS purchase Apple pay (Domestic)")]
        res = E.match(E.parse_export(raw), txs)
        assert len(res.proposals) == 1
        assert res.proposals[0].new_merchant == "HUNGERSTA"

    def test_transfer_names_the_beneficiary_not_the_account_number(self):
        # The shape has TWO "To:" lines — one name, one 4-digit account.
        raw = _sms("2026-03-01 01:19:01",
                   "Debit Internal Transfer\nFrom:1505\nAmount:SAR 440\nTo:MOHAMMED ISLAM\nTo:0477\n26/3/1 01:18")
        txs = [_tx("t1", "2026-03-01 01:19:01", 440.0, "debit", "محمد")]
        res = E.match(E.parse_export(raw), txs)
        assert len(res.proposals) == 1
        assert res.proposals[0].new_merchant == "MOHAMMED ISLAM"


class TestLoanInstalmentRule:
    """The statement posts a loan instalment a DAY after the bank SMSes it, and
    the amount is shared with unrelated transfers — so this class gets a wider
    window that must apply ONLY against loan-labelled rows."""

    LOAN_SMS = _sms("2026-04-24 20:13:55",
                    "Debit: Loan Instalment\nInstalment: SAR 3032.19\nFrom: 5225\n"
                    "Remaining Amount: SAR 213776.32\n24/4/26 20:04")

    def test_enriches_the_loan_row_a_day_later(self):
        txs = [_tx("loan", "2026-04-25 20:04:15", 3032.19, "debit", "Debit T & F installments")]
        res = E.match(E.parse_export(self.LOAN_SMS), txs)
        assert len(res.proposals) == 1
        assert res.proposals[0].new_merchant == "Loan Instalment"

    def test_never_writes_onto_a_same_amount_non_loan_row(self):
        # A transfer of the identical amount on the neighbouring day must be
        # left alone — this is the corruption the label gate exists to prevent.
        txs = [_tx("transfer", "2026-04-24 12:21:52", 3032.19, "debit", "معاذ")]
        res = E.match(E.parse_export(self.LOAN_SMS), txs)
        assert all(p.new_merchant != "Loan Instalment" for p in res.proposals)

    def test_prefers_the_loan_row_when_both_are_present(self):
        txs = [
            _tx("transfer", "2026-04-24 12:21:52", 3032.19, "debit", "معاذ"),
            _tx("loan", "2026-04-25 20:04:15", 3032.19, "debit", "Debit T & F installments"),
        ]
        res = E.match(E.parse_export(self.LOAN_SMS), txs)
        named = {p.transaction_id: p.new_merchant for p in res.proposals}
        assert named.get("loan") == "Loan Instalment"
        assert named.get("transfer") != "Loan Instalment"


class TestInternationalSettlementLag:
    """An international purchase is SMSed at the point of sale but settles onto the
    statement a few days later (reported: SMS 28/6 -> statement 1/7), with a
    different posting time-of-day. Like loans, the wider window applies ONLY
    against International-labelled rows, and the SMS must precede the posting."""

    INTL_SMS = _sms("2026-06-28 20:27:16",
                    "PoS International Purchase\nBy:9365;mada\nAmount:SAR 1199.00\n"
                    "Country:Saudi Arabia\nAt:Darkisa\n28/6/26 20:27")

    def test_enriches_the_international_row_days_later(self):
        txs = [_tx("intl", "2026-07-01 19:04:30", 1199.0, "debit",
                   "Online purchase Apple pay (International)")]
        res = E.match(E.parse_export(self.INTL_SMS), txs)
        assert len(res.proposals) == 1
        assert res.proposals[0].new_merchant == "Darkisa"

    def test_does_not_write_onto_a_non_international_row_days_apart(self):
        # The wide window is gated to International-labelled rows; a generic row
        # three days away must be left alone (the 45s rule can't reach it either).
        txs = [_tx("other", "2026-07-01 19:04:30", 1199.0, "debit",
                   "POS purchase Apple pay (Domestic)")]
        assert E.match(E.parse_export(self.INTL_SMS), txs).proposals == []

    def test_ignores_a_same_amount_international_row_outside_the_window(self):
        # >5 days after the SMS is beyond the settlement lag — not this purchase.
        txs = [_tx("far", "2026-07-10 12:00:00", 1199.0, "debit",
                   "Online purchase Apple pay (International)")]
        assert E.match(E.parse_export(self.INTL_SMS), txs).proposals == []

    def test_does_not_match_a_posting_dated_before_the_sms(self):
        # Settlement only ever runs forward: a row BEFORE the point-of-sale SMS
        # is a different transaction.
        txs = [_tx("before", "2026-06-24 12:00:00", 1199.0, "debit",
                   "Online purchase Apple pay (International)")]
        assert E.match(E.parse_export(self.INTL_SMS), txs).proposals == []

    def test_two_international_rows_in_the_window_are_refused(self):
        # One SMS cannot decide between two equally-plausible International rows.
        txs = [
            _tx("i1", "2026-06-30 10:00:00", 1199.0, "debit", "Online purchase Apple pay (International)"),
            _tx("i2", "2026-07-01 19:04:30", 1199.0, "debit", "Online purchase Apple pay (International)"),
        ]
        res = E.match(E.parse_export(self.INTL_SMS), txs)
        assert len(res.proposals) == 0, "ambiguous same-amount pair must be skipped, not guessed"


class TestAmbiguityIsRefused:
    def test_two_identical_transactions_are_left_alone(self):
        # One SMS cannot decide between two equally-plausible rows.
        raw = _sms("2026-03-20 07:31:50",
                   "Withdrawal:ATM\nBy:9365;mada\nAmount:SAR 50\nPlace:TABADOR SHOWROOM\n20/3/26 07:32")
        base = datetime(2026, 3, 20, 7, 31, 50)
        txs = [
            E.TxRow(id="a", timestamp=base, amount=50.0, type="debit", merchant="معاذ"),
            E.TxRow(id="b", timestamp=base + timedelta(seconds=5), amount=50.0, type="debit", merchant="معاذ"),
        ]
        res = E.match(E.parse_export(raw), txs)
        assert len(res.proposals) <= 1, "a single SMS must not name two different rows"

    def test_no_row_is_ever_named_twice(self):
        raw = _sms("2026-03-01 02:08:31",
                   "Online Purchase\nBy:9365;mada-Apple Pay\nFrom:1505\nAmount:SAR 88.74\nAt:HUNGERSTA\n1/3/26 02:08")
        txs = [_tx("t1", "2026-03-01 02:08:31", 88.74, "debit", "معاذ")]
        res = E.match(E.parse_exports([raw, raw, raw]), txs)
        assert len({p.transaction_id for p in res.proposals}) == len(res.proposals)


class TestDedupeAcrossExports:
    """Phone exports overlap heavily. Without de-duplication two identical SMS
    both claim the same row, it looks contested, and NOTHING is enriched."""

    def test_overlapping_exports_still_enrich(self):
        raw = _sms("2026-03-01 02:08:31",
                   "Online Purchase\nBy:9365;mada-Apple Pay\nFrom:1505\nAmount:SAR 88.74\nAt:HUNGERSTA\n1/3/26 02:08")
        txs = [_tx("t1", "2026-03-01 02:08:31", 88.74, "debit", "POS purchase Apple pay (Domestic)")]
        res = E.match(E.parse_exports([raw, raw]), txs)
        assert len(res.proposals) == 1
        assert res.proposals[0].new_merchant == "HUNGERSTA"

    def test_identical_messages_collapse(self):
        raw = _sms("2026-03-01 02:08:31",
                   "Online Purchase\nBy:9365;mada-Apple Pay\nFrom:1505\nAmount:SAR 88.74\nAt:HUNGERSTA\n1/3/26 02:08")
        assert len(E.parse_exports([raw, raw, raw])) == len(E.parse_export(raw))


class TestIdempotency:
    def test_a_proposal_that_would_change_nothing_is_suppressed(self):
        # Otherwise a re-run keeps re-proposing rows it already wrote — notably
        # "Loan Instalment", which still reads as a generic loan label.
        loan = _sms("2026-04-24 20:13:55",
                    "Debit: Loan Instalment\nInstalment: SAR 3032.19\nFrom: 5225\n24/4/26 20:04")
        txs = [_tx("loan", "2026-04-25 20:04:15", 3032.19, "debit", "Loan Instalment")]
        res = E.match(E.parse_export(loan), txs)
        assert res.proposals == []

    def test_already_named_rows_are_not_overwritten(self):
        raw = _sms("2026-03-01 02:08:31",
                   "Online Purchase\nBy:9365;mada-Apple Pay\nFrom:1505\nAmount:SAR 88.74\nAt:HUNGERSTA\n1/3/26 02:08")
        txs = [_tx("t1", "2026-03-01 02:08:31", 88.74, "debit", "MY OWN CAREFUL NAME")]
        assert E.match(E.parse_export(raw), txs).proposals == []


class TestGenericLabelGate:
    def test_statement_type_labels_are_replaceable(self):
        for label in ("POS purchase Apple pay (Domestic)", "Online purchase (International)",
                      "Debit - Credit Cards Transactions", "Debit T & F installments", "معاذ"):
            assert E.is_generic_label(label), f"{label!r} should be replaceable"

    def test_a_real_name_is_protected(self):
        for label in ("HUNGERSTA", "MOHAMMED ISLAM", "SAUDI ELECTRIC COMPANY"):
            assert not E.is_generic_label(label), f"{label!r} must be protected"

    def test_loan_labels_are_recognised(self):
        assert E.is_loan_label("Debit T & F installments")
        assert E.is_loan_label("Loan Instalment")
        assert not E.is_loan_label("HUNGERSTA")


class TestAmountParsing:
    def test_handles_every_currency_form_in_the_export(self):
        # A SAR-only regex silently dropped 56% of money events.
        for body, expected in [
            ("Amount:SAR 440", 440.0),
            ("Amount:102.33 SAR", 102.33),
            ("Amount: USD 31.29", 31.29),
            ("Amount:92.69 USD", 92.69),
            ("Amount:SR 59629.74", 59629.74),
            ("Amount:1,100.00 SAR", 1100.0),
            ("تم سحب 1000.00 ريال من حسابك", 1000.0),
        ]:
            amount, _ = E.parse_amount(body)
            assert amount == expected, f"{body!r} -> {amount}, expected {expected}"

    def test_foreign_currency_is_flagged_not_silently_taken_as_sar(self):
        _, currency = E.parse_amount("Amount: USD 31.29")
        assert currency == "USD"
