# backend/tests/conftest.py
"""
Pytest fixtures for Finance Tracker integration tests.
Uses the REAL PostgreSQL database with transaction rollback for safety.
Each test runs in a transaction that is rolled back after completion.
"""
import pytest
import os
import sys
import uuid
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Base
from database import get_db
from main import app
from rate_limiter import rate_limiter as _rate_limiter

# Use the REAL database - tests will use transactions that rollback
# This connects to the same DB as the app, inside Docker
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/finance_db")

engine = create_engine(DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_unique_digits():
    """Generate unique 4-digit string for test data."""
    return str(uuid.uuid4().int)[:4]


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Clear the in-memory rate limiter before every test.

    Each test registers and logs in a throwaway user, and the whole suite runs
    in well under the limiter's 60-second window — so without this the run trips
    the 200-request general limit partway through and later tests fail setup
    with 429 rather than anything meaningful. Test-only: production state is
    untouched because the app process here is the test process.
    """
    _rate_limiter.requests.clear()
    yield
    _rate_limiter.requests.clear()


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
    Create an AUTHENTICATED test client that uses the rollback session.

    Every non-public route is behind AuthMiddleware + get_current_user, so an
    unauthenticated client gets 401 on essentially everything — which is what
    made this whole suite red. The client registers a throwaway user and logs in
    through the real endpoints (/auth/register and /auth/token are public), so
    the tests exercise the actual auth path rather than bypassing it.

    The user is created through the same rolled-back session as the rest of the
    test, so it never persists. get_current_user resolves its session via the
    same get_db dependency overridden here, and AuthMiddleware only decodes the
    JWT without touching the database, so the transaction-scoped user is visible
    to both.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    # Override the dependency
    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        suffix = uuid.uuid4().hex[:10]
        username = f"testuser_{suffix}"
        password = f"Test!{suffix}"

        reg = test_client.post("/auth/register", json={
            "username": username,
            "password": password,
            "email": f"{username}@example.com",
        })
        assert reg.status_code in (200, 201), f"test user registration failed: {reg.text}"

        tok = test_client.post("/auth/token", data={
            "username": username,
            "password": password,
        })
        assert tok.status_code == 200, f"test user login failed: {tok.text}"

        test_client.headers.update({
            "Authorization": f"Bearer {tok.json()['access_token']}"
        })
        # Handy for tests that need to assert ownership scoping.
        test_client.test_username = username
        test_client.test_user = reg.json() if reg.content else None

        yield test_client

    # Clean up override
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def other_client(db_session):
    """A SECOND authenticated user, for verifying that one user cannot reach
    another's data (the ownership scoping this codebase relies on)."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        suffix = uuid.uuid4().hex[:10]
        username = f"otheruser_{suffix}"
        password = f"Test!{suffix}"
        test_client.post("/auth/register", json={
            "username": username,
            "password": password,
            "email": f"{username}@example.com",
        })
        tok = test_client.post("/auth/token", data={
            "username": username,
            "password": password,
        })
        assert tok.status_code == 200, f"other user login failed: {tok.text}"
        test_client.headers.update({
            "Authorization": f"Bearer {tok.json()['access_token']}"
        })
        test_client.test_username = username
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def sample_account(client):
    """Create a sample account for testing - will be rolled back."""
    unique_digits = get_unique_digits()
    response = client.post("/accounts/", json={
        "name": f"Test Bank Account {unique_digits}",
        "account_type": "SAVINGS",
        "last_4_digits": unique_digits,
        "current_balance": 1000.0,
        "bank_name": "Test Bank"
    })
    assert response.status_code == 200, f"Failed to create account: {response.text}"
    return response.json()


@pytest.fixture
def sample_credit_card(client):
    """Create a sample credit card for testing - will be rolled back."""
    unique_digits = get_unique_digits()
    response = client.post("/credit-cards/", json={
        "name": f"Test Visa {unique_digits}",  # Schema uses 'name' not 'card_name'
        "bank_name": "Test Bank",
        "last_4_digits": unique_digits,
        "credit_limit": 10000.0
    })
    assert response.status_code == 200, f"Failed to create credit card: {response.text}"
    return response.json()
