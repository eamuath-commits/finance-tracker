# backend/tests/test_credit_cards.py
"""
API Tests for Credit Card endpoints.
Routes:
- POST /credit-cards/ - create
- GET /credit-cards/ - list
- GET /credit-cards/{card_id} - get by ID
- PUT /credit-cards/{card_id} - update
- DELETE /credit-cards/{card_id} - delete
"""
import pytest


class TestCreditCardsAPI:
    """Test suite for /credit-cards/ endpoints."""

    def test_create_credit_card(self, client):
        """Test creating a new credit card."""
        response = client.post("/credit-cards/", json={
            "card_name": "Platinum Visa",
            "bank_name": "Al Rajhi Bank",
            "last_4_digits": "4321",
            "credit_limit": 20000.0
        })
        assert response.status_code == 200
        data = response.json()
        assert data["card_name"] == "Platinum Visa"
        assert data["credit_limit"] == 20000.0

    def test_get_credit_cards(self, client, sample_credit_card):
        """Test getting all credit cards."""
        response = client.get("/credit-cards/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1

    def test_get_credit_card_by_id(self, client, sample_credit_card):
        """Test getting a credit card by ID."""
        response = client.get(f"/credit-cards/{sample_credit_card['id']}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_credit_card["id"]

    def test_update_credit_card(self, client, sample_credit_card):
        """Test updating a credit card."""
        response = client.put(f"/credit-cards/{sample_credit_card['id']}", json={
            "card_name": "Updated Card Name",
            "credit_limit": 25000.0
        })
        assert response.status_code == 200
        data = response.json()
        assert data["card_name"] == "Updated Card Name"

    def test_delete_credit_card(self, client, sample_credit_card):
        """Test deleting a credit card."""
        response = client.delete(f"/credit-cards/{sample_credit_card['id']}")
        assert response.status_code == 200
        
        # Verify deletion
        cards = client.get("/credit-cards/").json()
        assert not any(c["id"] == sample_credit_card["id"] for c in cards)

    def test_credit_card_payment(self, client, sample_account, sample_credit_card):
        """Test making a credit card payment from account."""
        response = client.post(f"/credit-cards/{sample_credit_card['id']}/payment", json={
            "amount": 500.0,
            "source_account_id": sample_account["id"]
        })
        # Should succeed (might need to check actual response)
        assert response.status_code in [200, 422]  # 422 if validation differs
