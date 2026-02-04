# backend/tests/test_api_accounts.py
"""
API Tests for Account endpoints.
Aligned with actual API routes:
- POST /accounts/ - create
- GET /accounts/ - list all
- PUT /accounts/{account_id} - update
- DELETE /accounts/{account_id} - delete
- POST /accounts/{account_id}/recalculate-balance - recalculate
"""
import pytest


class TestAccountsAPI:
    """Test suite for /accounts/ endpoints."""

    def test_create_account(self, client):
        """Test creating a new account."""
        response = client.post("/accounts/", json={
            "name": "Savings Account",
            "account_type": "SAVINGS",
            "last_4_digits": "9999",
            "current_balance": 5000.0,
            "bank_name": "Al Rajhi Bank"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Savings Account"
        assert data["last_4_digits"] == "9999"
        assert data["current_balance"] == 5000.0

    def test_get_accounts(self, client, sample_account):
        """Test getting all accounts."""
        response = client.get("/accounts/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert any(a["id"] == sample_account["id"] for a in data)

    def test_update_account(self, client, sample_account):
        """Test updating an account."""
        response = client.put(f"/accounts/{sample_account['id']}", json={
            "name": "Updated Account Name",
            "current_balance": 7500.0
        })
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Account Name"
        assert data["current_balance"] == 7500.0

    def test_delete_account(self, client, sample_account):
        """Test deleting an account."""
        response = client.delete(f"/accounts/{sample_account['id']}")
        assert response.status_code == 200
        
        # Verify deletion - should not appear in list
        list_response = client.get("/accounts/")
        accounts = list_response.json()
        assert not any(a["id"] == sample_account["id"] for a in accounts)

    def test_create_account_missing_name(self, client):
        """Test creating account without required fields fails."""
        response = client.post("/accounts/", json={
            "account_type": "SAVINGS"
        })
        assert response.status_code == 422  # Validation error


class TestAccountBalance:
    """Test suite for account balance operations."""

    def test_recalculate_balance(self, client, sample_account):
        """Test balance recalculation endpoint."""
        response = client.post(f"/accounts/{sample_account['id']}/recalculate-balance")
        assert response.status_code == 200

    def test_balance_after_transaction(self, client, sample_account):
        """Test that balance updates after transaction."""
        initial_balance = sample_account["current_balance"]
        
        # Create a debit transaction
        tx_response = client.post("/transactions/", json={
            "account_id": sample_account["id"],
            "amount": 100.0,
            "merchant": "Test Store",
            "category": "Shopping",
            "type": "debit"
        })
        assert tx_response.status_code == 200
        
        # Check account balance decreased - get from list
        acc_response = client.get("/accounts/")
        accounts = acc_response.json()
        account = next((a for a in accounts if a["id"] == sample_account["id"]), None)
        assert account is not None
        assert account["current_balance"] == initial_balance - 100.0
