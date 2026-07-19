"""
Regression tests for internal-transfer leg pairing.

A wrong pair is silent — two unrelated transfers joined together, and a deletion
that then removes the wrong row — so the tests are weighted towards the cases
where it must REFUSE.
"""
from datetime import datetime, timedelta

import transfer_linking as TL


class _Tx:
    """Minimal stand-in; pair_internal_transfers only reads these attributes."""
    def __init__(self, tid, account_id, amount, type_, ts, ttype=TL.INTERNAL_TRANSFER):
        self.id = tid
        self.account_id = account_id
        self.amount = amount
        self.type = type_
        self.timestamp = ts
        self.transaction_type = ttype
        self.transfer_group_id = None
        self.transfer_counterpart_account_id = None


BASE = datetime(2026, 3, 31, 2, 39, 32)


def _pair(txs):
    return TL.pair_internal_transfers(txs)


class TestPairing:
    def test_pairs_a_debit_with_its_credit_on_another_account(self):
        txs = [
            _Tx("d", "liability", 1006.58, "debit", BASE),
            _Tx("c", "general", 1006.58, "credit", BASE),
        ]
        pairs, stats = _pair(txs)
        assert stats["paired"] == 1
        assert (pairs[0][0].id, pairs[0][1].id) == ("d", "c")

    def test_apply_stamps_both_legs_with_one_group(self):
        txs = [
            _Tx("d", "liability", 1006.58, "debit", BASE),
            _Tx("c", "general", 1006.58, "credit", BASE),
        ]
        pairs, _ = _pair(txs)
        TL.apply_pairs(pairs)
        d, c = txs
        assert d.transfer_group_id and d.transfer_group_id == c.transfer_group_id
        assert d.transfer_counterpart_account_id == "general"
        assert c.transfer_counterpart_account_id == "liability"

    def test_a_small_posting_gap_still_pairs(self):
        txs = [
            _Tx("d", "liability", 500.0, "debit", BASE),
            _Tx("c", "general", 500.0, "credit", BASE + timedelta(seconds=45)),
        ]
        assert _pair(txs)[1]["paired"] == 1


class TestItRefusesWhenUnsure:
    def test_two_possible_credits_are_not_guessed(self):
        # The same amount arriving on two accounts moments apart — unresolvable.
        txs = [
            _Tx("d", "liability", 500.0, "debit", BASE),
            _Tx("c1", "general", 500.0, "credit", BASE),
            _Tx("c2", "expense", 500.0, "credit", BASE + timedelta(seconds=10)),
        ]
        pairs, stats = _pair(txs)
        assert stats["paired"] == 0
        assert stats["ambiguous"] == 1

    def test_two_debits_competing_for_one_credit_are_not_guessed(self):
        txs = [
            _Tx("d1", "liability", 500.0, "debit", BASE),
            _Tx("d2", "payroll", 500.0, "debit", BASE + timedelta(seconds=5)),
            _Tx("c", "general", 500.0, "credit", BASE),
        ]
        pairs, stats = _pair(txs)
        assert stats["paired"] == 0, "one credit cannot be the counterpart of two debits"

    def test_a_credit_is_never_used_twice(self):
        txs = [
            _Tx("d1", "liability", 500.0, "debit", BASE),
            _Tx("d2", "payroll", 500.0, "debit", BASE),
            _Tx("c", "general", 500.0, "credit", BASE),
        ]
        pairs, _ = _pair(txs)
        used = [c.id for _, c in pairs]
        assert len(used) == len(set(used))

    def test_far_apart_in_time_does_not_pair(self):
        txs = [
            _Tx("d", "liability", 500.0, "debit", BASE),
            _Tx("c", "general", 500.0, "credit", BASE + timedelta(hours=6)),
        ]
        assert _pair(txs)[1]["paired"] == 0

    def test_different_amounts_do_not_pair(self):
        txs = [
            _Tx("d", "liability", 500.0, "debit", BASE),
            _Tx("c", "general", 500.50, "credit", BASE),
        ]
        assert _pair(txs)[1]["paired"] == 0

    def test_same_account_is_not_a_transfer(self):
        txs = [
            _Tx("d", "liability", 500.0, "debit", BASE),
            _Tx("c", "liability", 500.0, "credit", BASE),
        ]
        assert _pair(txs)[1]["paired"] == 0

    def test_only_internal_transfers_are_considered(self):
        txs = [
            _Tx("d", "liability", 500.0, "debit", BASE, ttype="PURCHASE"),
            _Tx("c", "general", 500.0, "credit", BASE, ttype="PURCHASE"),
        ]
        assert _pair(txs)[1]["paired"] == 0

    def test_already_linked_legs_are_left_alone(self):
        d = _Tx("d", "liability", 500.0, "debit", BASE)
        c = _Tx("c", "general", 500.0, "credit", BASE)
        d.transfer_group_id = c.transfer_group_id = "existing"
        assert _pair([d, c])[1]["paired"] == 0


class TestReporting:
    def test_a_debit_with_no_counterpart_is_counted_not_paired(self):
        # Money sent to an account whose statement is not imported — most of
        # this user's outgoing transfers look like this.
        txs = [_Tx("d", "liability", 500.0, "debit", BASE)]
        pairs, stats = _pair(txs)
        assert stats["paired"] == 0
        assert stats["no_counterpart"] == 1

    def test_stats_account_for_every_debit(self):
        txs = [
            _Tx("d1", "liability", 500.0, "debit", BASE),                       # pairs
            _Tx("c1", "general", 500.0, "credit", BASE),
            _Tx("d2", "payroll", 900.0, "debit", BASE),                         # no counterpart
            _Tx("d3", "expense", 700.0, "debit", BASE),                         # ambiguous
            _Tx("c2", "general", 700.0, "credit", BASE),
            _Tx("c3", "house", 700.0, "credit", BASE + timedelta(seconds=5)),
        ]
        _, s = _pair(txs)
        assert s["paired"] + s["ambiguous"] + s["no_counterpart"] == s["debits"]
