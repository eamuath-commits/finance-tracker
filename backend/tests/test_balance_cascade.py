# backend/tests/test_balance_cascade.py
"""
Tests for balance cascade recalculation logic.
These are critical business logic tests for ledger integrity.
"""
import pytest


class TestBalanceCascade:
    """Test that balance_after_transaction cascades correctly."""

    def test_sequential_transactions_balance(self, client, sample_account):
        """Test that sequential transactions have correct running balance."""
        initial = sample_account["current_balance"]  # 1000.0
        
        # Transaction 1: -100 = 900
        tx1 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "First",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        # Transaction 2: -50 = 850
        tx2 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 50.0,
            "merchant": "Second",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        # Transaction 3: +200 = 1050
        tx3 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 200.0,
            "merchant": "Third",
            "category": "Income",
            "type": "credit"
        }).json()
        
        # Verify cascade
        assert tx1["balance_after_transaction"] == initial - 100
        assert tx2["balance_after_transaction"] == initial - 100 - 50
        assert tx3["balance_after_transaction"] == initial - 100 - 50 + 200
        
        # Verify final account balance
        acc = client.get(f"/accounts/{sample_account['id']}").json()
        assert acc["current_balance"] == initial - 100 - 50 + 200

    def test_edit_middle_transaction_cascades(self, client, sample_account):
        """Test that editing a transaction cascades to subsequent transactions."""
        initial = sample_account["current_balance"]  # 1000
        
        # Create 3 transactions
        tx1 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "First",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        tx2 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 50.0,
            "merchant": "Second",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        tx3 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 25.0,
            "merchant": "Third",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        # Edit middle transaction (change 50 to 150)
        client.put(f"/transactions/{tx2['id']}", json={
            "amount": 150.0
        })
        
        # Get updated transactions
        tx3_updated = client.get(f"/transactions/{tx3['id']}").json()
        acc = client.get(f"/accounts/{sample_account['id']}").json()
        
        # tx3 should now reflect the change: 1000 - 100 - 150 - 25 = 725
        assert tx3_updated["balance_after_transaction"] == 725
        assert acc["current_balance"] == 725

    def test_delete_transaction_recalculates(self, client, sample_account):
        """Test that deleting a transaction recalculates subsequent balances."""
        initial = sample_account["current_balance"]
        
        # Create transactions
        tx1 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "First",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        tx2 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 200.0,
            "merchant": "To Delete",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        tx3 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 50.0,
            "merchant": "Third",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        # Delete middle transaction
        client.delete(f"/transactions/{tx2['id']}")
        
        # Check final balance: 1000 - 100 - 50 = 850 (no 200 deduction)
        acc = client.get(f"/accounts/{sample_account['id']}").json()
        assert acc["current_balance"] == 850


class TestPreviousBalanceAnchor:
    """Test the previous_balance anchor feature."""

    def test_previous_balance_recalculates_forward(self, client, sample_account):
        """Test that setting previous_balance recalculates forward."""
        # Create transaction
        tx = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "Test",
            "category": "Shopping",
            "type": "debit"
        }).json()
        
        # Update with previous_balance anchor
        # If we say previous balance was 2000, after -100 debit it should be 1900
        response = client.put(f"/transactions/{tx['id']}", json={
            "previous_balance": 2000.0
        })
        
        if response.status_code == 200:
            updated_tx = client.get(f"/transactions/{tx['id']}").json()
            assert updated_tx["balance_after_transaction"] == 1900.0


class TestBalanceIntegrity:
    """Test overall balance integrity."""

    def test_balance_never_negative_allowed(self, client, sample_account):
        """Test that balance can go negative (no enforcement)."""
        # Try to spend more than available
        response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 5000.0,  # More than 1000 balance
            "merchant": "Big Purchase",
            "category": "Shopping",
            "type": "debit"
        })
        # Should succeed (no negative balance enforcement)
        assert response.status_code == 200
        
        # Balance should be negative
        acc = client.get(f"/accounts/{sample_account['id']}").json()
        assert acc["current_balance"] == 1000.0 - 5000.0  # -4000

    def test_zero_amount_transaction(self, client, sample_account):
        """Test handling of zero amount transaction."""
        response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 0.0,
            "merchant": "Zero Test",
            "category": "Other",
            "type": "debit"
        })
        # Either rejected or accepted with no balance change
        if response.status_code == 200:
            acc = client.get(f"/accounts/{sample_account['id']}").json()
            assert acc["current_balance"] == sample_account["current_balance"]
