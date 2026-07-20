"""
Regression tests for the bank transaction-type classifier.

The type_lines below are the real ones these statements emit — the previous
mapper was written against types the bank never sends ("Fund Transfer",
"SPAN-Debit Transfer"), which is how 570 of 911 rows ended up as "Other".
"""
import pytest

import transaction_types as T


class TestRealStatementTypes:
    """Every type_line actually present in the statements, with its count."""

    @pytest.mark.parametrize("type_line,expected", [
        ("POS purchase Apple pay (Domestic)", T.PURCHASE),                  # 270
        ("Internal Transfer", T.INTERNAL_TRANSFER),                         # 138
        ("Online purchase Apple pay (Domestic)", T.PURCHASE),               # 115
        ("Internal Transfer between Accounts", T.INTERNAL_TRANSFER),        # 114
        ("Debit - Credit Cards Transactions", T.CARD_PAYMENT),              # 81
        ("Outward IPS Credit Transfer", T.TRANSFER_OUT),                    # 57
        ("Sadad Payments", T.BILL_PAYMENT),                                 # 43
        ("Outward IPS Credit Transaction Charges", T.FEE),                  # 27
        ("Inward IPS Credit Transfer", T.TRANSFER_IN),                      # 19
        ("Online purchase Apple pay (International)", T.PURCHASE_INTL),     # 11
        ("ATM Withdrawal", T.ATM_WITHDRAWAL),                               # 8
        ("Debit T & F installments", T.LOAN_INSTALMENT),                    # 6
        ("Sariee Inward Payments", T.TRANSFER_IN),                          # 6
        ("Sarie Payment Order", T.TRANSFER_OUT),                            # 6
        ("Dynamic Currencies Debit Card Markup", T.FEE),                    # 6
        ("Sadad Payment - Alien Control", T.BILL_PAYMENT),                  # 4
        ("Domestic Sarie Payment Fees", T.FEE),                             # 3
        ("Visa Payment", T.CARD_PAYMENT),                                   # 3
        ("Online purchase (International)", T.PURCHASE_INTL),               # 3
        ("Inward Local Payment Order", T.TRANSFER_IN),                      # 2
        ("Transfer To Customer Account", T.INTERNAL_TRANSFER),              # 1
        ("Transfer From Customer Account", T.INTERNAL_TRANSFER),            # 1
        ("Refund purchase amount", T.REFUND),                               # 1
        ("Reversal POS purchase Apple pay", T.REFUND),                      # 1
    ])
    def test_classifies_every_real_type_line(self, type_line, expected):
        assert T.classify_type_line(type_line) == expected

    def test_nothing_real_falls_through_to_other(self):
        # If a new statement introduces an unknown type it should surface as a
        # gap, not be silently absorbed — but none of the CURRENT ones may.
        real = [
            "POS purchase Apple pay (Domestic)", "Internal Transfer",
            "Online purchase Apple pay (Domestic)", "Internal Transfer between Accounts",
            "Debit - Credit Cards Transactions", "Outward IPS Credit Transfer",
            "Sadad Payments", "Outward IPS Credit Transaction Charges",
            "Inward IPS Credit Transfer", "Online purchase Apple pay (International)",
            "ATM Withdrawal", "Debit T & F installments", "Sariee Inward Payments",
            "Sarie Payment Order", "Dynamic Currencies Debit Card Markup",
            "Sadad Payment - Alien Control", "Domestic Sarie Payment Fees",
            "Visa Payment", "Online purchase (International)",
            "Inward Local Payment Order", "Transfer To Customer Account",
            "Transfer From Customer Account",
        ]
        unclassified = [t for t in real if T.classify_type_line(t) == T.OTHER]
        assert unclassified == []


class TestBankNeutrality:
    """The taxonomy is universal; the wording is per-bank. Two banks describe the
    same operation differently and both must land on the same type. These pin the
    cross-bank behaviour so an Al Rajhi tweak cannot quietly break Aljazira."""

    @pytest.mark.parametrize("alrajhi,aljazira,expected", [
        ("Debit - Credit Cards Transactions", "Credit Card Payment", T.CARD_PAYMENT),
        ("Inward IPS Credit Transfer", "Incoming Local Transfer", T.TRANSFER_IN),
        ("Inward IPS Credit Transfer", "Instant Incoming Transfer", T.TRANSFER_IN),
        ("Outward IPS Credit Transfer", "Instant Outgoing Transfer", T.TRANSFER_OUT),
        ("Outward IPS Credit Transfer", "Outgoing Local Transfer", T.TRANSFER_OUT),
        ("Debit T & F installments", "Loan Repayment", T.LOAN_INSTALMENT),
    ])
    def test_both_banks_map_to_the_same_type(self, alrajhi, aljazira, expected):
        assert T.classify_type_line(alrajhi) == expected
        assert T.classify_type_line(aljazira) == expected

    def test_aljazira_loan_repayment(self):
        assert T.classify_type_line("Loan Repayment", "debit") == T.LOAN_INSTALMENT

    def test_aljazira_commodity_loan_leg(self):
        # "Through Bank Aljazira" — the murabaha commodity legs, per the owner.
        # Now bank-scoped: it classifies only for an Aljazira statement (the
        # scoping itself is covered in TestBankScoping).
        assert T.classify_type_line("Through Bank Aljazira", "debit", bank_key="aljazira") == T.LOAN_INSTALMENT

    def test_aljazira_transfers_both_directions(self):
        assert T.classify_type_line("Incoming Local Transfer", "credit") == T.TRANSFER_IN
        assert T.classify_type_line("Outgoing Local Transfer", "debit") == T.TRANSFER_OUT

    def test_loan_repayment_does_not_leak_into_bill_payment(self):
        # "repayment" contains "payment"; make sure it still classifies as a loan.
        assert T.classify_type_line("Loan Repayment") == T.LOAN_INSTALMENT

    def test_al_rajhi_classification_is_unchanged_by_the_new_rules(self):
        # None of the Aljazira additions may alter an existing Al Rajhi mapping.
        assert T.classify_type_line("POS purchase Apple pay (Domestic)") == T.PURCHASE
        assert T.classify_type_line("Debit T & F installments") == T.LOAN_INSTALMENT
        assert T.classify_type_line("Sadad Payments") == T.BILL_PAYMENT
        assert T.classify_type_line("Outward IPS Credit Transaction Charges") == T.FEE


class TestBankScoping:
    """Bank-specific wording applies ONLY to that bank's statements. The same
    words on another bank must not classify — that is the whole point of scoping
    a generic phrase like 'Through Bank Aljazira'."""

    def test_aljazira_rule_fires_for_aljazira(self):
        assert T.classify_type_line("Through Bank Aljazira", "debit", bank_key="aljazira") == T.LOAN_INSTALMENT

    def test_aljazira_rule_does_not_fire_for_al_rajhi(self):
        assert T.classify_type_line("Through Bank Aljazira", "debit", bank_key="alrajhi") == T.OTHER

    def test_aljazira_rule_does_not_fire_without_a_bank(self):
        assert T.classify_type_line("Through Bank Aljazira", "debit") == T.OTHER

    def test_an_unknown_bank_still_gets_the_universal_rules(self):
        assert T.classify_type_line("Sadad Payments", bank_key="some_new_bank") == T.BILL_PAYMENT
        assert T.classify_type_line("Loan Repayment", bank_key="some_new_bank") == T.LOAN_INSTALMENT

    def test_universal_rules_are_unaffected_by_bank(self):
        for bank in (None, "alrajhi", "aljazira", "unknown"):
            assert T.classify_type_line("POS purchase Apple pay (Domestic)", bank_key=bank) == T.PURCHASE
            assert T.classify_type_line("Incoming Local Transfer", "credit", bank_key=bank) == T.TRANSFER_IN


class TestRuleOrderingMatters:
    """Several fee and refund types contain the words 'transfer' or 'purchase',
    so the specific rules have to beat the general ones."""

    def test_transfer_charges_are_a_fee_not_a_transfer(self):
        assert T.classify_type_line("Outward IPS Credit Transaction Charges") == T.FEE

    def test_payment_fees_are_a_fee_not_a_payment(self):
        assert T.classify_type_line("Domestic Sarie Payment Fees") == T.FEE

    def test_a_reversed_purchase_is_a_refund_not_a_purchase(self):
        assert T.classify_type_line("Reversal POS purchase Apple pay") == T.REFUND

    def test_international_beats_domestic(self):
        assert T.classify_type_line("Online purchase (International)") == T.PURCHASE_INTL

    def test_inward_beats_the_payment_order_rule(self):
        assert T.classify_type_line("Inward Local Payment Order") == T.TRANSFER_IN


class TestDirectionOnlyBreaksTies:
    def test_a_bare_transfer_uses_direction(self):
        assert T.classify_type_line("Transfer", "credit") == T.TRANSFER_IN
        assert T.classify_type_line("Transfer", "debit") == T.TRANSFER_OUT

    def test_direction_does_not_override_an_explicit_type(self):
        # An internal transfer is internal whichever way the money went.
        assert T.classify_type_line("Internal Transfer", "credit") == T.INTERNAL_TRANSFER
        assert T.classify_type_line("Internal Transfer", "debit") == T.INTERNAL_TRANSFER


class TestSpendingExclusion:
    """Moving money between your own accounts is not spending. On this data that
    was 189 debits worth 672,316 — more than the real spend."""

    def test_internal_transfers_are_not_spending(self):
        assert T.is_spending(T.INTERNAL_TRANSFER, "debit") is False

    def test_fees_are_not_spending(self):
        assert T.is_spending(T.FEE, "debit") is False

    def test_purchases_are_spending(self):
        assert T.is_spending(T.PURCHASE, "debit") is True
        assert T.is_spending(T.PURCHASE_INTL, "debit") is True

    def test_bills_and_cash_are_spending(self):
        assert T.is_spending(T.BILL_PAYMENT, "debit") is True
        assert T.is_spending(T.ATM_WITHDRAWAL, "debit") is True

    def test_credits_are_never_spending(self):
        for t in T.ALL_TYPES:
            assert T.is_spending(t, "credit") is False

    def test_an_unclassified_debit_still_counts_as_spending(self):
        # Better to over-report an unknown than to hide money silently.
        assert T.is_spending(T.OTHER, "debit") is True
        assert T.is_spending(None, "debit") is True


class TestEdgeCases:
    def test_empty_and_none_are_other(self):
        assert T.classify_type_line(None) == T.OTHER
        assert T.classify_type_line("") == T.OTHER
        assert T.classify_type_line("   ") == T.OTHER

    def test_matching_is_case_insensitive(self):
        assert T.classify_type_line("INTERNAL TRANSFER") == T.INTERNAL_TRANSFER
        assert T.classify_type_line("sadad payments") == T.BILL_PAYMENT

    def test_every_type_has_a_label(self):
        for t in T.ALL_TYPES:
            assert T.TYPE_LABELS.get(t), f"{t} has no human label"
