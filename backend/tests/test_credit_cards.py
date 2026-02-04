# backend/tests/test_credit_cards.py
"""
API Tests for Credit Card endpoints.
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

    def test_credit_card_transaction(self, client, sample_credit_card):
        """Test creating a transaction on credit card."""
        response = client.post("/transactions/", json={
            "credit_card_id": sample_credit_card["id"],
            "amount": 500.0,
            "merchant": "Amazon",
            "category": "Shopping",
            "type": "debit"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["credit_card_id"] == sample_credit_card["id"]
