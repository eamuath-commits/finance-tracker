# backend/tests/test_queue.py
"""
Tests for SMS Queue/Processing functionality.
Routes:
- GET /queue/status
- GET /queue/blocked
- POST /queue/process
"""
import pytest


class TestQueueAPI:
    """Test suite for /queue/ endpoints."""

    def test_get_queue_status(self, client):
        """Test getting queue status."""
        response = client.get("/queue/status")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_get_blocked_items(self, client):
        """Test getting blocked queue items."""
        response = client.get("/queue/blocked")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_process_queue(self, client):
        """Test triggering queue processing."""
        response = client.post("/queue/process")
        # May succeed or error if no items
        assert response.status_code in [200, 404, 422]
