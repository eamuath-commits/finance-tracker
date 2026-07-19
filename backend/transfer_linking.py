"""
Pair the two legs of an internal transfer.

Moving money between your own accounts appears TWICE in the ledger — a debit on
the source account's statement and a credit on the destination's — because both
banks statements record it. The rows stay separate (each is real on its own
account) but they are one movement, and nothing recorded that.

Linking them lets the pair read as "Liability -> General, 1,006.58" instead of
two unrelated rows both labelled with a bare first name, and lets a deletion find
the other leg reliably instead of re-guessing it from amount and timestamp.

The pairing is deliberately conservative — the same discipline as the SMS
matcher. A wrong pair is silent, so anything ambiguous is left alone.
"""
import uuid
from typing import Dict, List, Tuple

# Both statements record the same instant, but the two accounts can post it a
# little apart. Kept tight: a whole day would start pairing unrelated transfers
# of a round amount.
MATCH_WINDOW_SECONDS = 120
AMOUNT_EPS = 0.01

INTERNAL_TRANSFER = "INTERNAL_TRANSFER"


def _candidates(debit, credits) -> List:
    """Credits that could be the other leg of this debit."""
    out = []
    for c in credits:
        if c.account_id == debit.account_id:
            continue                                    # same account is not a transfer
        if abs(float(c.amount or 0) - float(debit.amount or 0)) > AMOUNT_EPS:
            continue
        if not c.timestamp or not debit.timestamp:
            continue
        if abs((c.timestamp - debit.timestamp).total_seconds()) > MATCH_WINDOW_SECONDS:
            continue
        out.append(c)
    return out


def pair_internal_transfers(transactions) -> Tuple[List[Tuple], Dict[str, int]]:
    """Find unambiguous debit/credit pairs among a user's internal transfers.

    Returns (pairs, stats). A pair is only produced when the debit has exactly
    ONE candidate credit AND that credit has exactly one candidate debit — a
    bijection, so a repeated round-number transfer can never be mispaired.

    Takes an already-scoped list: callers must pass ONE user's transactions.
    """
    internals = [t for t in transactions if t.transaction_type == INTERNAL_TRANSFER]
    debits = [t for t in internals if t.type == "debit" and not t.transfer_group_id]
    credits = [t for t in internals if t.type == "credit" and not t.transfer_group_id]

    stats = {
        "internal_transfers": len(internals),
        "debits": len(debits),
        "credits": len(credits),
        "paired": 0,
        "ambiguous": 0,
        "no_counterpart": 0,
    }

    # Forward pass: which credits could each debit be?
    forward = {d.id: _candidates(d, credits) for d in debits}
    # Reverse degree: how many debits claim each credit?
    reverse: Dict[str, int] = {}
    for d_id, cands in forward.items():
        for c in cands:
            reverse[c.id] = reverse.get(c.id, 0) + 1

    pairs = []
    used = set()
    for d in debits:
        cands = forward[d.id]
        if not cands:
            stats["no_counterpart"] += 1
            continue
        if len(cands) > 1:
            stats["ambiguous"] += 1
            continue
        c = cands[0]
        # The credit must be claimed by this debit alone, and not already taken.
        if reverse.get(c.id, 0) != 1 or c.id in used:
            stats["ambiguous"] += 1
            continue
        used.add(c.id)
        pairs.append((d, c))
        stats["paired"] += 1

    return pairs, stats


def apply_pairs(pairs) -> int:
    """Stamp each pair with a shared group id and point each leg at the other's
    account. Does not commit — the caller owns the transaction."""
    for debit, credit in pairs:
        group = uuid.uuid4().hex
        debit.transfer_group_id = group
        credit.transfer_group_id = group
        debit.transfer_counterpart_account_id = credit.account_id
        credit.transfer_counterpart_account_id = debit.account_id
    return len(pairs)
