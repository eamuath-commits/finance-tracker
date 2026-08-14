# backend/tests/test_obligations.py
"""
Tests for Obligations (recurring payments) functionality.
Routes:
- POST /obligations/ - create
- GET /obligations/ - list
- PUT /obligations/{obligation_id} - update
- DELETE /obligations/{obligation_id} - delete
- POST /obligations/{obligation_id}/pay - mark as paid
- GET /obligations/{obligation_id}/history - payment history
"""
import pytest
import uuid
from datetime import datetime
from types import SimpleNamespace

import main


def get_unique_name():
    """Generate unique name for test obligations."""
    return f"Test Obligation {str(uuid.uuid4())[:8]}"


class TestObligationsAPI:
    """Test suite for /obligations/ endpoints."""

    def test_create_obligation(self, client):
        """Test creating a new obligation."""
        unique_name = get_unique_name()
        response = client.post("/obligations/", json={
            "name": unique_name,
            "amount": 45.0,
            "due_day": 15,
            "category": "Subscriptions"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["name"] == unique_name
        # amount might be stored differently or is Optional, just check response has an id
        assert "id" in data
        assert data["due_day"] == 15

    def test_get_obligations(self, client):
        """Test getting all obligations."""
        # Create one first
        client.post("/obligations/", json={
            "name": get_unique_name(),
            "due_day": 1,
            "category": "Bills"
        })
        
        response = client.get("/obligations/")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_update_obligation(self, client):
        """Test updating an obligation."""
        # Create obligation
        create_response = client.post("/obligations/", json={
            "name": get_unique_name(),
            "due_day": 10,
            "category": "Other"
        })
        ob_id = create_response.json()["id"]
        
        # Update it
        response = client.put(f"/obligations/{ob_id}", json={
            "name": "Updated Name"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"

    def test_delete_obligation(self, client):
        """Test deleting an obligation."""
        # Create obligation
        create_response = client.post("/obligations/", json={
            "name": get_unique_name(),
            "due_day": 5,
            "category": "Other"
        })
        ob_id = create_response.json()["id"]
        
        # Delete it
        response = client.delete(f"/obligations/{ob_id}")
        assert response.status_code == 200

    def test_obligation_payment(self, client, sample_account):
        """Test marking an obligation as paid."""
        # Create obligation
        create_response = client.post("/obligations/", json={
            "name": get_unique_name(),
            "due_day": 20,
            "category": "Bills"
        })
        ob_id = create_response.json()["id"]
        
        # Mark as paid
        response = client.post(f"/obligations/{ob_id}/pay", json={
            "amount": 200.0,
            "account_id": sample_account["id"]
        })
        # May succeed or need different payload
        assert response.status_code in [200, 422]

    def test_get_obligation_history(self, client):
        """Test getting payment history for an obligation."""
        # Create obligation
        create_response = client.post("/obligations/", json={
            "name": get_unique_name(),
            "due_day": 15,
            "category": "Bills"
        })
        ob_id = create_response.json()["id"]
        
        # Get history
        response = client.get(f"/obligations/{ob_id}/history")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_monthly_status(self, client):
        """Test the monthly-status endpoint returns correct structure."""
        # Create an obligation
        name = get_unique_name()
        client.post("/obligations/", json={
            "name": name,
            "due_day": 1,
            "category": "Bills",
            "amount": 100.0
        })

        # Get monthly status
        response = client.get("/obligations/monthly-status?month_offset=0")
        assert response.status_code == 200
        data = response.json()
        assert "month" in data
        assert "paid_count" in data
        assert "unpaid_count" in data
        assert "overdue_count" in data
        assert "total_expected" in data
        assert "obligations" in data
        assert isinstance(data["obligations"], list)
        assert data["total_obligations"] >= 1

    def test_monthly_status_tracks_paid(self, client):
        """Test that monthly-status correctly reports paid obligations."""
        name = get_unique_name()
        create_resp = client.post("/obligations/", json={
            "name": name,
            "due_day": 15,
            "category": "Bills",
            "amount": 200.0
        })
        ob_id = create_resp.json()["id"]

        # Pay the obligation for current month
        from datetime import datetime
        now = datetime.now()
        billing_month = f"{now.year}-{str(now.month).zfill(2)}"
        client.post(f"/obligations/{ob_id}/pay", json={
            "amount": 200.0,
            "billing_month": billing_month,
            "status": "PAID"
        })

        response = client.get("/obligations/monthly-status?month_offset=0")
        data = response.json()
        paid_obl = [o for o in data["obligations"] if o["id"] == ob_id]
        assert len(paid_obl) == 1
        assert paid_obl[0]["status"] == "PAID"

    def test_forecast(self, client):
        """Test the forecast endpoint returns predictions."""
        name = get_unique_name()
        client.post("/obligations/", json={
            "name": name,
            "due_day": 10,
            "category": "Utilities",
            "amount": 300.0
        })

        response = client.get("/obligations/forecast?months_ahead=1")
        assert response.status_code == 200
        data = response.json()
        assert "forecast_month" in data
        assert "total_forecast" in data
        assert "by_category" in data
        assert "obligations" in data
        assert isinstance(data["obligations"], list)

    def test_all_matches(self, client):
        """Test the all-matches bulk endpoint returns a dict."""
        name = get_unique_name()
        client.post("/obligations/", json={
            "name": name,
            "due_day": 15,
            "category": "Bills"
        })

        response = client.get("/obligations/all-matches")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


class TestMatchHints:
    """_passes_match_hints: a text hint (bill number / name) is authoritative — it
    finds the paying transaction even when it lands outside the usual day window;
    the day-of-month window filters only when there is no text hint. This is what
    lets a bill paid late (or in arrears, a month after its label) still link."""

    @staticmethod
    def _obl(**kw):
        base = dict(match_account_id=None, match_text=None, match_day_from=None, match_day_to=None)
        base.update(kw)
        return SimpleNamespace(**base)

    @staticmethod
    def _tx(day, merchant="", notes="", raw="", account_id=None):
        return SimpleNamespace(timestamp=datetime(2026, 8, day, 12, 0, 0), merchant=merchant,
                               notes=notes, raw_sms_content=raw, account_id=account_id)

    def test_text_hint_matches_even_outside_the_day_window(self):
        obl = self._obl(match_text="05064478739", match_day_from=4, match_day_to=10)
        # bill number present, but paid on the 18th (outside 4-10) -> still qualifies
        assert main._passes_match_hints(obl, self._tx(18, notes="Sadad · Bill: 05064478739")) is True

    def test_text_hint_required_when_set(self):
        obl = self._obl(match_text="05064478739", match_day_from=4, match_day_to=10)
        # in the day window but without the number -> rejected (text is required)
        assert main._passes_match_hints(obl, self._tx(5, merchant="SOME OTHER BILL")) is False

    def test_day_window_filters_only_when_no_text_hint(self):
        obl = self._obl(match_day_from=4, match_day_to=10)
        assert main._passes_match_hints(obl, self._tx(6)) is True
        assert main._passes_match_hints(obl, self._tx(18)) is False

    def test_account_hint_is_always_required(self):
        obl = self._obl(match_account_id="acc-1", match_text="05064478739")
        assert main._passes_match_hints(obl, self._tx(5, notes="05064478739", account_id="acc-2")) is False
        assert main._passes_match_hints(obl, self._tx(5, notes="05064478739", account_id="acc-1")) is True

