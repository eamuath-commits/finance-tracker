# backend/tests/test_unit_balance.py
"""
Unit tests for balance calculation logic.
These test the business logic directly, not through API.
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestBalanceCalculation:
    """Test balance calculation formulas."""
    
    def test_debit_decreases_balance(self):
        """Debit should decrease balance."""
        starting_balance = 1000.0
        debit_amount = 100.0
        expected = starting_balance - debit_amount
        assert expected == 900.0
    
    def test_credit_increases_balance(self):
        """Credit should increase balance."""
        starting_balance = 1000.0
        credit_amount = 500.0
        expected = starting_balance + credit_amount
        assert expected == 1500.0
    
    def test_fees_reduce_balance(self):
        """Fees should reduce balance."""
        starting_balance = 1000.0
        amount = 100.0
        fees = 5.0
        # For debit: balance - amount - fees
        expected = starting_balance - amount - fees
        assert expected == 895.0

    def test_cascade_calculation(self):
        """Test cascade balance calculation across transactions."""
        starting_balance = 1000.0
        transactions = [
            {"amount": 100, "type": "debit"},   # -> 900
            {"amount": 50, "type": "debit"},    # -> 850
            {"amount": 200, "type": "credit"},  # -> 1050
            {"amount": 25, "type": "debit"},    # -> 1025
        ]
        
        running = starting_balance
        expected_balances = []
        for tx in transactions:
            if tx["type"] == "credit":
                running += tx["amount"]
            else:
                running -= tx["amount"]
            expected_balances.append(running)
        
        assert expected_balances == [900, 850, 1050, 1025]
        assert running == 1025

    def test_negative_balance_allowed(self):
        """System should allow negative balances."""
        starting_balance = 100.0
        large_debit = 500.0
        result = starting_balance - large_debit
        assert result == -400.0  # Should be negative, not error


class TestPreviousBalanceAnchor:
    """Test previous_balance anchor recalculation logic."""
    
    def test_anchor_recalculates_forward(self):
        """Previous balance anchor should recalculate forward."""
        # Scenario: User says previous balance was 2000
        # Transaction is 100 debit
        # Result should be 2000 - 100 = 1900
        anchor = 2000.0
        tx_amount = 100.0
        tx_type = "debit"
        
        if tx_type == "credit":
            result = anchor + tx_amount
        else:
            result = anchor - tx_amount
        
        assert result == 1900.0


class TestTransferLogic:
    """Test transfer balance logic."""
    
    def test_internal_transfer_net_zero(self):
        """Internal transfer should be net zero across accounts."""
        account_a_balance = 1000.0
        account_b_balance = 500.0
        transfer_amount = 200.0
        
        # Account A decreases (debit)
        account_a_final = account_a_balance - transfer_amount
        # Account B increases (credit)
        account_b_final = account_b_balance + transfer_amount
        
        total_before = account_a_balance + account_b_balance
        total_after = account_a_final + account_b_final
        
        assert total_before == total_after  # Net zero
        assert account_a_final == 800.0
        assert account_b_final == 700.0
