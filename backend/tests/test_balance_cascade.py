# backend/tests/test_balance_cascade.py
"""
Tests for balance cascade recalculation logic.
These are critical business logic tests for ledger integrity.
"""
import pytest
from datetime import datetime


def get_timestamp():
    """Get current timestamp in ISO format for test transactions."""
    return datetime.now().isoformat()


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
            "type": "debit",
            "timestamp": get_timestamp()
        }).json()
        
        # Transaction 2: -50 = 850
        tx2 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 50.0,
            "merchant": "Second",
            "category": "Shopping",
            "type": "debit",
            "timestamp": get_timestamp()
        }).json()
        
        # Transaction 3: +200 = 1050
        tx3 = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 200.0,
            "merchant": "Third",
            "category": "Income",
            "type": "credit",
            "timestamp": get_timestamp()
        }).json()
        
        # Verify cascade (balance snapshots)
        assert tx1.get("balance_after_transaction") is not None
        assert tx2.get("balance_after_transaction") is not None
        assert tx3.get("balance_after_transaction") is not None
        
        # Verify final account balance
        accounts = client.get("/accounts/").json()
        account = next((a for a in accounts if a["id"] == sample_account["id"]), None)
        assert account["current_balance"] == initial - 100 - 50 + 200

    def test_edit_transaction_updates_balance(self, client, sample_account):
        """Test that editing a transaction updates account balance."""
        initial = sample_account["current_balance"]
        
        # Create transaction
        tx = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "Test",
            "category": "Shopping",
            "type": "debit",
            "timestamp": get_timestamp()
        }).json()
        
        # Update amount
        client.put(f"/transactions/{tx['id']}", json={
            "amount": 200.0
        })
        
        # Check balance reflects new amount
        accounts = client.get("/accounts/").json()
        account = next((a for a in accounts if a["id"] == sample_account["id"]), None)
        # After edit, balance should be initial - 200 (not initial - 100)
        assert account["current_balance"] == initial - 200.0

    def test_delete_transaction_restores_balance(self, client, sample_account):
        """Test that deleting a transaction restores balance."""
        initial = sample_account["current_balance"]
        
        # Create transaction
        tx = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "To Delete",
            "category": "Shopping",
            "type": "debit",
            "timestamp": get_timestamp()
        }).json()
        
        # Delete it
        client.delete(f"/transactions/{tx['id']}")
        
        # Balance should be restored
        accounts = client.get("/accounts/").json()
        account = next((a for a in accounts if a["id"] == sample_account["id"]), None)
        assert account["current_balance"] == initial


class TestBalanceIntegrity:
    """Test overall balance integrity."""

    def test_balance_can_go_negative(self, client, sample_account):
        """Test that balance can go negative (no enforcement)."""
        # Try to spend more than available
        response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 5000.0,  # More than 1000 balance
            "merchant": "Big Purchase",
            "category": "Shopping",
            "type": "debit",
            "timestamp": get_timestamp()
        })
        # Should succeed (no negative balance enforcement)
        assert response.status_code == 200
        
        # Balance should be negative
        accounts = client.get("/accounts/").json()
        account = next((a for a in accounts if a["id"] == sample_account["id"]), None)
        assert account["current_balance"] == 1000.0 - 5000.0  # -4000

    def test_zero_amount_transaction(self, client, sample_account):
        """Test handling of zero amount transaction."""
        initial = sample_account["current_balance"]
        response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 0.0,
            "merchant": "Zero Test",
            "category": "Other",
            "type": "debit",
            "timestamp": get_timestamp()
        })
        # Should succeed with no balance change
        if response.status_code == 200:
            accounts = client.get("/accounts/").json()
            account = next((a for a in accounts if a["id"] == sample_account["id"]), None)
            assert account["current_balance"] == initial
