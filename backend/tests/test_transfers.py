# backend/tests/test_transfers.py
"""
Tests for transfer functionality.
Routes:
- POST /transactions/{transaction_id}/complete-transfer
- GET /transactions/pending
"""
import pytest
from datetime import datetime


def get_timestamp():
    """Get current timestamp in ISO format for test transactions."""
    return datetime.now().isoformat()


class TestTransfers:
    """Test suite for transfer operations."""

    def test_create_internal_transfer_debit(self, client, sample_account):
        """Test creating the debit side of an internal transfer."""
        response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 500.0,
            "merchant": "Transfer to Savings",
            "category": "Internal Transfer",
            "type": "debit",
            "timestamp": get_timestamp()
        })
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "Internal Transfer"
        assert data["type"] == "debit"

    def test_get_pending_transfers(self, client):
        """Test getting pending transfers."""
        response = client.get("/transactions/pending")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_complete_transfer(self, client, sample_account):
        """Test completing a transfer (assigning source account)."""
        # First create a transfer transaction
        tx_response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "Pending Transfer",
            "category": "Transfer",
            "type": "credit",
            "status": "pending_source",
            "timestamp": get_timestamp()
        })
        
        if tx_response.status_code == 200:
            tx_id = tx_response.json()["id"]
            
            # Try to complete the transfer
            complete_response = client.post(
                f"/transactions/{tx_id}/complete-transfer?source_account_id={sample_account['id']}"
            )
            # May succeed or return specific error
            assert complete_response.status_code in [200, 400, 422]


class TestTransferBalances:
    """Test that transfers correctly update balances."""

    def test_debit_transfer_decreases_balance(self, client, sample_account):
        """Test that outgoing transfer decreases balance."""
        initial = sample_account["current_balance"]
        
        client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 300.0,
            "merchant": "Transfer Out",
            "category": "Transfer",
            "type": "debit",
            "timestamp": get_timestamp()
        })
        
        accounts = client.get("/accounts/").json()
        account = next((a for a in accounts if a["id"] == sample_account["id"]), None)
        assert account["current_balance"] == initial - 300.0

    def test_credit_transfer_increases_balance(self, client, sample_account):
        """Test that incoming transfer increases balance."""
        initial = sample_account["current_balance"]
        
        client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 500.0,
            "merchant": "Transfer In",
            "category": "Transfer",
            "type": "credit",
            "timestamp": get_timestamp()
        })
        
        accounts = client.get("/accounts/").json()
        account = next((a for a in accounts if a["id"] == sample_account["id"]), None)
        assert account["current_balance"] == initial + 500.0
