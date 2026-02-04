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

from database import Base
from main import app, get_db

# Test database URL - uses SQLite in memory
TEST_DATABASE_URL = "sqlite:///./test_finance.db"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with dependency override."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


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
    return response.json()
