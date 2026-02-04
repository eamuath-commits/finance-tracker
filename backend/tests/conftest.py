# backend/tests/conftest.py
"""
Pytest fixtures for Finance Tracker tests.
Uses a separate test database to avoid affecting production data.
"""
import pytest
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Base
from database import get_db
from main import app

# Test database URL - uses SQLite file in /tmp
TEST_DATABASE_URL = "sqlite:///./test_finance.db"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override the get_db dependency to use test database."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Override app dependency BEFORE creating the client
app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test."""
    # Create all tables
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Drop tables after test
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client."""
    # Tables already created by db_session fixture
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sample_account(client):
    """Create a sample account for testing."""
    response = client.post("/accounts/", json={
        "name": "Test Bank Account",
        "account_type": "SAVINGS",
        "last_4_digits": "1234",
        "current_balance": 1000.0,
        "bank_name": "Test Bank"
    })
    assert response.status_code == 200, f"Failed to create account: {response.json()}"
    return response.json()


@pytest.fixture
def sample_credit_card(client):
    """Create a sample credit card for testing."""
    response = client.post("/credit-cards/", json={
        "card_name": "Test Visa",
        "bank_name": "Test Bank",
        "last_4_digits": "5678",
        "credit_limit": 10000.0
    })
    assert response.status_code == 200, f"Failed to create credit card: {response.json()}"
    return response.json()
