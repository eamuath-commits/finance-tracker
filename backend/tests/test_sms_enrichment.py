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


def _sms_from(sender, ts, body):
    return f"----------------------------------------------------\n{ts} from {sender}\n\n{body}\n"


class TestSTCDialect:
    """STC Bank uses different message templates from Al Rajhi; the sender selects
    the dialect. Purchases carry the merchant in From:/At:, transfers the person."""

    def test_outward_transfer_names_the_recipient(self):
        body = "Internal outward transfer\nAmount:165.00SAR\nTo:ABDULLAH ALASIRI\nAcc:1048*\nAt:31/10/25 20:23"
        assert E.classify(body, "STC Bank") == (E._MONEY_NAMED, "stc_transfer_out", "debit", "ABDULLAH ALASIRI")

    def test_purchase_names_the_merchant(self):
        body = "Apple Pay Purchase\nVia: *6070\nAmount: 39.91 SAR\nFrom: Absher 2\nAt: 08/07/25 01:21"
        assert E.classify(body, "STC Bank")[1:] == ("stc_purchase", "debit", "Absher 2")

    def test_incoming_transfer_names_the_sender(self):
        body = "Inward transfer (SARIE)\n1.00 SAR\nFrom MUATH ALASIRI\nFrom AL RAJHI BANK\nAccount *863\n31-07-2025 10:43"
        assert E.classify(body, "STC Bank")[1:] == ("stc_transfer_in", "credit", "MUATH ALASIRI")

    def test_topup_is_money_but_unnamed(self):
        k, s, d, n = E.classify("Adding money to account\nAmount: 153.45 SAR\nVia: *XXXX\nAt: 31/05/25 19:52", "STC Bank")
        assert k == E._MONEY_UNNAMED and n is None


class TestJaziraDialect:
    def test_online_purchase_names_the_merchant(self):
        body = ("Online Purchase Apple Pay Credit Card: 4897 at :SAUDI ELECTRICITY COMP of : 1095.43 SAR "
                "on : 2026-01-15 21:58 Available Balance is: 23395.89 SAR")
        assert E.classify(body, "Jazira Bank")[1:] == ("jazira_purchase", "debit", "SAUDI ELECTRICITY COMP")

    def test_pos_purchase_names_the_merchant(self):
        body = "POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :The Cheese Cake Factory R \nof: 355.00 SAR"
        assert E.classify(body, "Jazira Bank")[3] == "The Cheese Cake Factory R"

    def test_outgoing_transfer_names_recipient(self):
        body = "Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 2,500.00\nIBAN/Alias: 7772"
        assert E.classify(body, "Jazira Bank")[1:] == ("jazira_transfer_out", "debit", "MUATH ALAS**")

    def test_credit_transfer_names_the_sender_not_the_dest_account(self):
        body = "Credit transfer Internal \nAmount: SAR 1.00\nTo: 8002\nSender Name: M.ALASIRI\nSender Account No.: 8001\nDate:2026-01-05 15:04"
        assert E.classify(body, "Jazira Bank")[1:] == ("jazira_transfer_in", "credit", "M.ALASIRI")

    def test_empty_sender_name_does_not_capture_the_date_line(self):
        # Regression: the field regex used to cross the newline into 'Date: ...'.
        body = "Credit transfer: Local\nVia: X\nAmount: SAR 5.00\nTo: 8001\nSender Name:\nDate: 2026-03-30 09:38"
        assert (E.classify(body, "Jazira Bank")[3] or "") .find("Date") == -1

    def test_loan_instalment_is_recognised(self):
        body = "Debit transfer: Loan Instalment\nFrom: 8001\nInstalment: SAR 19,099.85\nFor: Personal Loan"
        assert E.classify(body, "Jazira Bank")[1:] == ("loan_instalment", "debit", "Loan Instalment")


class TestDateOnlyStatementMatching:
    """STC / Aljazira statement rows carry no time-of-day (all 00:00:00), so the
    45s window can never reach them. Match on calendar date + amount + direction,
    gated to the same bank and disambiguated by the bijection."""

    def _sms(self, ts):
        return _sms_from("STC Bank", ts, "Internal outward transfer\nAmount:165.00SAR\nTo:ABDULLAH ALASIRI\nAt:x")

    def _row(self, day, bank="stc", tid="r"):
        return E.TxRow(id=tid, timestamp=datetime(2026, 1, day, 0, 0, 0), amount=165.0,
                       type="debit", merchant="Internal transfer", bank=bank)

    def test_same_day_date_only_row_is_named(self):
        res = E.match(E.parse_export(self._sms("2026-01-10 14:30:00")), [self._row(10)])
        assert len(res.proposals) == 1 and res.proposals[0].new_merchant == "ABDULLAH ALASIRI"

    def test_different_day_is_not_matched(self):
        assert E.match(E.parse_export(self._sms("2026-01-10 14:30:00")), [self._row(11)]).proposals == []

    def test_a_different_banks_row_is_never_claimed(self):
        assert E.match(E.parse_export(self._sms("2026-01-10 14:30:00")), [self._row(10, bank="alrajhi")]).proposals == []

    def test_two_same_amount_rows_on_the_day_are_refused(self):
        rows = [self._row(10, tid="a"), self._row(10, tid="b")]
        assert E.match(E.parse_export(self._sms("2026-01-10 14:30:00")), rows).proposals == []


class TestOwnAccountTransferNaming:
    SMS = _sms_from("AlRajhiBank", "2026-04-24 12:21:57",
                    "Transfer Between Your Accounts\nAmount: SR 3032.19\nTo: 5225\n26/4/24 12:21")

    def _row(self):
        return _tx("r", "2026-04-24 12:21:52", 3032.19, "debit", "معاذ")

    def test_names_the_destination_account(self):
        res = E.match(E.parse_export(self.SMS), [self._row()], account_names={"5225": "Auto Lease"})
        assert len(res.proposals) == 1 and res.proposals[0].new_merchant == "Transfer → Auto Lease"

    def test_unknown_destination_stays_nameless(self):
        assert E.match(E.parse_export(self.SMS), [self._row()], account_names={"9999": "X"}).proposals == []

    def test_no_account_map_stays_nameless_as_before(self):
        assert E.match(E.parse_export(self.SMS), [self._row()]).proposals == []


class TestSmsNoteExtraction:
    """When an SMS carries reference fields (bill number, SADAD service, transfer
    ref/IBAN), enrichment keeps them on the transaction's note."""

    def test_al_rajhi_bill_payment_keeps_the_bill_number(self):
        body = "Bill Payment\nFrom:9384\nAmount:SAR 923.11\nBiller:001\nService:STC BILL\nBill:05064478739\nDate:23-11-4 15:04"
        assert E.extract_sms_note(body) == "Biller: 001 · Service: STC BILL · Bill: 05064478739"

    def test_stc_bill_payment_keeps_service_and_number(self):
        body = "Bill Payment (SADAD)\nAmount: 100.00 SAR\nBiller: STC-001\nService: POST\nNumber: 6722162487\nFrom Account: ***0863\nOn: 30/04/26 22:00"
        assert E.extract_sms_note(body) == "Biller: STC-001 · Service: POST · Number: 6722162487"

    def test_transfer_keeps_iban_and_reference(self):
        body = ("Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\n"
                "Amount: SAR 2,500.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2025-12-21 15:50\nRef: 2BTMS11549789947")
        assert E.extract_sms_note(body) == "IBAN: 7772 · Ref: 2BTMS11549789947"

    def test_a_plain_purchase_has_no_note(self):
        body = "Apple Pay Purchase\nVia: *6070\nAmount: 39.91 SAR\nFrom: Absher 2\nAt: 08/07/25 01:21"
        assert E.extract_sms_note(body) is None

    def test_masked_reference_value_is_skipped(self):
        assert E.extract_sms_note("Bill Payment\nNumber: ****\nAmount: 1 SAR") is None

    def test_card_number_line_is_not_taken_as_a_bill_number(self):
        # 'Number' must be a line-start field, not part of 'Card Number:'.
        assert E.extract_sms_note("POS Purchase\nCredit Card Number: 4897\nAmount: 5 SAR") is None
