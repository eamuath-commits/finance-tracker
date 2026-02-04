# backend/tests/conftest.py
"""
Pytest fixtures for Finance Tracker integration tests.
Uses the REAL PostgreSQL database with transaction rollback for safety.
Each test runs in a transaction that is rolled back after completion.
"""
import pytest
import os
import sys
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Base
from database import get_db
from main import app

# Use the REAL database - tests will use transactions that rollback
# This connects to the same DB as the app, inside Docker
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/finance_db")

engine = create_engine(DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """
    Create a database session that rolls back all changes after the test.
    This ensures tests don't affect production data.
    """
    connection = engine.connect()
    transaction = connection.begin()
    
    # Bind session to this connection
    session = TestingSessionLocal(bind=connection)
    
    # Begin a nested transaction (savepoint)
    nested = connection.begin_nested()
    
    # If the application code calls session.commit(), restart the nested transaction
    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(session, trans):
        nonlocal nested
        if trans.nested and not trans._parent.nested:
            nested = connection.begin_nested()
    
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()  # Rollback ALL changes made during test
        connection.close()


@pytest.fixture(scope="function")
def client(db_session):
    """
    Create a test client that uses the rollback session.
    All API calls will use db_session which rolls back after test.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    # Override the dependency
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    # Clean up override
    app.dependency_overrides.clear()


@pytest.fixture
def sample_account(client):
    """Create a sample account for testing - will be rolled back."""
    response = client.post("/accounts/", json={
        "name": "Test Bank Account",
        "account_type": "SAVINGS",
        "last_4_digits": "1234",
        "current_balance": 1000.0,
        "bank_name": "Test Bank"
    })
    assert response.status_code == 200, f"Failed to create account: {response.text}"
    return response.json()


@pytest.fixture
def sample_credit_card(client):
    """Create a sample credit card for testing - will be rolled back.""" 
    response = client.post("/credit-cards/", json={
        "card_name": "Test Visa",
        "bank_name": "Test Bank",
        "last_4_digits": "5678",
        "credit_limit": 10000.0
    })
    assert response.status_code == 200, f"Failed to create credit card: {response.text}"
    return response.json()
