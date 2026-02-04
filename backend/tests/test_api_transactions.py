# backend/tests/test_api_transactions.py
"""
API Tests for Transaction endpoints.
"""
import pytest
from datetime import datetime


class TestTransactionsAPI:
    """Test suite for /transactions/ endpoints."""

    def test_create_transaction(self, client, sample_account):
        """Test creating a new transaction."""
        response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 50.0,
            "merchant": "Coffee Shop",
            "category": "Food & Dining",
            "type": "debit"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 50.0
        assert data["merchant"] == "Coffee Shop"
        assert data["type"] == "debit"

    def test_create_credit_transaction(self, client, sample_account):
        """Test creating a credit (income) transaction."""
        response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 500.0,
            "merchant": "Salary",
            "category": "Income",
            "type": "credit"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "credit"

    def test_get_transactions(self, client, sample_account):
        """Test getting all transactions."""
        # Create a transaction first
        client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 25.0,
            "merchant": "Test Merchant",
            "category": "Other",
            "type": "debit"
        })
        
        response = client.get("/transactions/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1

    def test_get_transaction_by_id(self, client, sample_account):
        """Test getting a specific transaction."""
        # Create transaction
        create_response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 75.0,
            "merchant": "Specific Store",
            "category": "Shopping",
            "type": "debit"
        })
        tx_id = create_response.json()["id"]
        
        # Get by ID
        response = client.get(f"/transactions/{tx_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == tx_id
        assert data["merchant"] == "Specific Store"

    def test_update_transaction(self, client, sample_account):
        """Test updating a transaction."""
        # Create transaction
        create_response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "Original Merchant",
            "category": "Shopping",
            "type": "debit"
        })
        tx_id = create_response.json()["id"]
        
        # Update it
        response = client.put(f"/transactions/{tx_id}", json={
            "merchant": "Updated Merchant",
            "amount": 150.0
        })
        assert response.status_code == 200
        data = response.json()
        assert data["merchant"] == "Updated Merchant"
        assert data["amount"] == 150.0

    def test_delete_transaction(self, client, sample_account):
        """Test deleting a transaction."""
        # Create transaction
        create_response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 30.0,
            "merchant": "To Delete",
            "category": "Other",
            "type": "debit"
        })
        tx_id = create_response.json()["id"]
        
        # Delete it
        response = client.delete(f"/transactions/{tx_id}")
        assert response.status_code == 200
        
        # Verify deletion
        get_response = client.get(f"/transactions/{tx_id}")
        assert get_response.status_code == 404

    def test_transaction_updates_account_balance(self, client, sample_account):
        """Test that creating transaction updates account balance."""
        initial_balance = sample_account["current_balance"]
        
        # Create debit
        client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 200.0,
            "merchant": "Big Purchase",
            "category": "Shopping",
            "type": "debit"
        })
        
        # Check balance
        acc = client.get(f"/accounts/{sample_account['id']}").json()
        assert acc["current_balance"] == initial_balance - 200.0

    def test_credit_transaction_increases_balance(self, client, sample_account):
        """Test that credit transaction increases balance."""
        initial_balance = sample_account["current_balance"]
        
        # Create credit
        client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 1000.0,
            "merchant": "Bonus",
            "category": "Income",
            "type": "credit"
        })
        
        # Check balance
        acc = client.get(f"/accounts/{sample_account['id']}").json()
        assert acc["current_balance"] == initial_balance + 1000.0


class TestTransactionFiltering:
    """Test suite for transaction filtering."""

    def test_filter_by_account(self, client, sample_account):
        """Test filtering transactions by account."""
        # Create transaction
        client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 50.0,
            "merchant": "Filter Test",
            "category": "Other",
            "type": "debit"
        })
        
        response = client.get(f"/transactions/?account_id={sample_account['id']}")
        assert response.status_code == 200
        data = response.json()
        assert all(tx["account_id"] == sample_account["id"] for tx in data)

    def test_filter_by_type(self, client, sample_account):
        """Test filtering transactions by type."""
        # Create both types
        client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 50.0,
            "merchant": "Debit Test",
            "category": "Other",
            "type": "debit"
        })
        client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "Credit Test",
            "category": "Income",
            "type": "credit"
        })
        
        # Filter by credit
        response = client.get("/transactions/?type=credit")
        assert response.status_code == 200
        data = response.json()
        assert all(tx["type"] == "credit" for tx in data)
