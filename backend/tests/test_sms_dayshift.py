"""
Regression tests for the bank's evening posting cutoff.

Anything paid after roughly 20:00 is SMSed immediately but posted to the
statement the NEXT day, so the pair sits ~24h apart while the time-of-day still
agrees — often to the second. Measured over the full export: 92 such
transactions, every one after 20:00, and in every case the SMS is the earlier of
the two. These lock the rule and, more importantly, the guards around it.
"""
from datetime import datetime

import sms_enrichment as E


def _sms(ts, body):
    return "----------------------------------------------------\n%s from AlRajhiBank\n\n%s\n" % (ts, body)


POS = "PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 152.30\nAt:ADAM PHAR\n26/1/26 23:26"
OTP = "OTP Code:3201\nReason:Rajhi Transfer - Mobile App\nAmount:152.30 SAR"


def _tx(ts, amount=152.30, merchant="POS purchase Apple pay (Domestic)", type_="debit", tid="t1"):
    return E.TxRow(id=tid, timestamp=datetime.strptime(ts, "%Y-%m-%d %H:%M:%S"),
                   amount=amount, type=type_, merchant=merchant)


def _match(sms_ts, tx_ts, body=POS, **kw):
    return E.match(E.parse_export(_sms(sms_ts, body)), [_tx(tx_ts, **kw)])


class TestEveningCutoff:
    def test_purchase_posted_the_next_day_matches(self):
        res = _match("2026-01-25 23:26:37", "2026-01-26 23:26:37")
        assert len(res.proposals) == 1
        assert res.proposals[0].new_merchant == "ADAM PHAR"

    def test_same_day_matching_is_unchanged(self):
        assert len(_match("2026-01-26 23:26:40", "2026-01-26 23:26:37").proposals) == 1


class TestTheRuleIsNotALoosening:
    """The day-shift moves the reference point by 24h; it must NOT widen the
    time-of-day tolerance, or it would start pairing unrelated evenings."""

    def test_time_of_day_must_still_agree(self):
        assert _match("2026-01-25 23:26:37", "2026-01-26 23:27:59").proposals == []

    def test_within_the_normal_window_is_accepted(self):
        assert len(_match("2026-01-25 23:26:37", "2026-01-26 23:27:15").proposals) == 1

    def test_a_transaction_cannot_claim_the_next_days_sms(self):
        # The cutoff only ever posts LATER, so the SMS must be the earlier one.
        assert _match("2026-01-27 23:26:37", "2026-01-26 23:26:37").proposals == []

    def test_two_days_apart_is_a_different_transaction(self):
        assert _match("2026-01-24 23:26:37", "2026-01-26 23:26:37").proposals == []


class TestGuardsStillHold:
    def test_repeats_on_consecutive_evenings_are_not_mispaired(self):
        export = _sms("2026-01-25 23:26:37", POS) + _sms("2026-01-26 23:26:37", POS)
        res = E.match(E.parse_exports([export]),
                      [_tx("2026-01-26 23:26:37", tid="a"), _tx("2026-01-27 23:26:37", tid="b")])
        names = {p.transaction_id: p.new_merchant for p in res.proposals}
        assert all(v == "ADAM PHAR" for v in names.values())
        assert len(names) == len(res.proposals), "a row was named twice"

    def test_an_already_named_row_is_left_alone(self):
        assert _match("2026-01-25 23:26:37", "2026-01-26 23:26:37",
                      merchant="ADAM PHARMACY LTD").proposals == []

    def test_direction_must_agree(self):
        assert _match("2026-01-25 23:26:37", "2026-01-26 23:26:37", type_="credit").proposals == []

    def test_amount_must_agree(self):
        assert _match("2026-01-25 23:26:37", "2026-01-26 23:26:37", amount=152.99).proposals == []

    def test_noise_gains_no_day_shift_path(self):
        assert _match("2026-01-25 23:26:37", "2026-01-26 23:26:37", body=OTP).proposals == []
