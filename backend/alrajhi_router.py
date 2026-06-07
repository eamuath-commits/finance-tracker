"""
Al Rajhi Bank Open Banking API integration router.

Handles the OAuth2 Authorization Code flow, account/transaction fetching,
and synchronization with local database records.

Endpoints:
    POST /api/bank/alrajhi/consent    — Initiate consent + get auth URL
    GET  /api/bank/callback           — OAuth callback (receives auth code)
    GET  /api/bank/alrajhi/accounts   — Fetch accounts from Al Rajhi
    GET  /api/bank/alrajhi/transactions — Fetch transactions
    POST /api/bank/alrajhi/sync       — Full sync: accounts + balances + transactions
    GET  /api/bank/alrajhi/status     — Connection status
    DELETE /api/bank/alrajhi/connection — Disconnect bank
"""
import os
import uuid
import logging
import hashlib
import base64
import secrets
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
import models
from bank_models import BankConnection, BankAccount

logger = logging.getLogger("alrajhi_bank")

router = APIRouter(prefix="/api/bank", tags=["Bank Integration"])

# --- Configuration from environment ---
ALRAJHI_API_KEY = os.getenv("ALRAJHI_API_KEY", "")
ALRAJHI_API_SECRET = os.getenv("ALRAJHI_API_SECRET", "")
ALRAJHI_REDIRECT_URI = os.getenv("ALRAJHI_REDIRECT_URI", "https://qayd.io/api/bank/callback")

# Al Rajhi Open Banking endpoints (SAMA standard)
# Update these with exact URLs from the Al Rajhi Developer Portal
ALRAJHI_BASE_URL = os.getenv("ALRAJHI_API_BASE", "https://developer.alrajhibank.com.sa/open-banking")
ALRAJHI_AUTH_URL = os.getenv("ALRAJHI_AUTH_URL", f"{ALRAJHI_BASE_URL}/authorize")
ALRAJHI_TOKEN_URL = os.getenv("ALRAJHI_TOKEN_URL", f"{ALRAJHI_BASE_URL}/token")
ALRAJHI_API_URL = os.getenv("ALRAJHI_API_ENDPOINT", f"{ALRAJHI_BASE_URL}/v1")

# Frontend URL for redirecting after callback
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://qayd.io")

# PKCE code verifier storage (in-memory for simplicity; use Redis in production)
_pkce_store: dict[str, str] = {}


def _generate_pkce():
    """Generate PKCE code_verifier and code_challenge (S256)."""
    code_verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


def _get_auth_headers(access_token: str = None):
    """Build headers for Al Rajhi API calls."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-ibm-client-id": ALRAJHI_API_KEY,
        "x-ibm-client-secret": ALRAJHI_API_SECRET,
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


async def _refresh_token_if_needed(connection: BankConnection, db: Session) -> str:
    """Check if access token is expired and refresh if needed. Returns valid access_token."""
    if connection.token_expires and connection.token_expires > datetime.utcnow():
        return connection.access_token

    if not connection.refresh_token:
        connection.status = "expired"
        db.commit()
        raise HTTPException(status_code=401, detail="Bank connection expired. Please reconnect.")

    logger.info(f"Refreshing token for connection {connection.id}")
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            ALRAJHI_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": connection.refresh_token,
                "client_id": ALRAJHI_API_KEY,
                "client_secret": ALRAJHI_API_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        logger.error(f"Token refresh failed: {response.status_code} - {response.text}")
        connection.status = "expired"
        db.commit()
        raise HTTPException(status_code=401, detail="Failed to refresh bank token. Please reconnect.")

    token_data = response.json()
    connection.access_token = token_data["access_token"]
    connection.refresh_token = token_data.get("refresh_token", connection.refresh_token)
    expires_in = token_data.get("expires_in", 3600)
    connection.token_expires = datetime.utcnow() + timedelta(seconds=expires_in)
    connection.status = "active"
    db.commit()

    return connection.access_token


def _get_active_connection(db: Session, bank_name: str = "alrajhi") -> BankConnection:
    """Get the active bank connection or raise 404."""
    connection = db.query(BankConnection).filter(
        BankConnection.bank_name == bank_name,
        BankConnection.status.in_(["active", "expired"]),
    ).first()
    if not connection:
        raise HTTPException(status_code=404, detail="No active Al Rajhi bank connection found. Please connect first.")
    return connection


# ============================================================
# 1. CONSENT — Initiate the Open Banking consent flow
# ============================================================

@router.post("/alrajhi/consent")
async def create_consent(db: Session = Depends(get_db)):
    """
    Create an account-access-consent with Al Rajhi and return the authorization URL.
    The frontend should redirect the user to this URL to authorize access.
    """
    # Generate PKCE pair
    code_verifier, code_challenge = _generate_pkce()

    # Create consent request to Al Rajhi (SAMA standard)
    consent_payload = {
        "Data": {
            "Permissions": [
                "ReadAccountsBasic",
                "ReadAccountsDetail",
                "ReadBalances",
                "ReadTransactionsBasic",
                "ReadTransactionsDetail",
                "ReadTransactionsCredits",
                "ReadTransactionsDebits",
                "ReadBeneficiariesBasic",
                "ReadBeneficiariesDetail",
            ],
            "ExpirationDateTime": (datetime.utcnow() + timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
            "TransactionFromDateTime": (datetime.utcnow() - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
            "TransactionToDateTime": (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{ALRAJHI_API_URL}/account-access-consents",
            json=consent_payload,
            headers=_get_auth_headers(),
        )

    if response.status_code not in (200, 201):
        logger.error(f"Consent creation failed: {response.status_code} - {response.text}")
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Failed to create bank consent: {response.text}",
        )

    consent_data = response.json()
    consent_id = consent_data.get("Data", {}).get("ConsentId", str(uuid.uuid4()))

    # Store PKCE verifier keyed by consent_id
    _pkce_store[consent_id] = code_verifier

    # Create pending connection in DB
    connection = BankConnection(
        id=str(uuid.uuid4()),
        bank_name="alrajhi",
        consent_id=consent_id,
        status="pending",
    )
    db.add(connection)
    db.commit()

    # Build authorization URL
    state = f"{connection.id}|{consent_id}"
    auth_url = (
        f"{ALRAJHI_AUTH_URL}"
        f"?response_type=code"
        f"&client_id={ALRAJHI_API_KEY}"
        f"&redirect_uri={ALRAJHI_REDIRECT_URI}"
        f"&scope=accounts"
        f"&state={state}"
        f"&consent_id={consent_id}"
        f"&code_challenge={code_challenge}"
        f"&code_challenge_method=S256"
    )

    return {
        "authorization_url": auth_url,
        "consent_id": consent_id,
        "connection_id": connection.id,
    }


# ============================================================
# 2. CALLBACK — Handle OAuth redirect from Al Rajhi
# ============================================================

@router.get("/callback")
async def oauth_callback(
    code: str = Query(..., description="Authorization code from Al Rajhi"),
    state: str = Query("", description="State parameter containing connection_id|consent_id"),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    OAuth2 callback endpoint. Al Rajhi redirects here after the user authorizes.
    Exchanges the authorization code for access + refresh tokens.
    """
    if error:
        logger.error(f"OAuth callback error: {error} - {error_description}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/settings?bank_error={error_description or error}",
        )

    # Parse state
    parts = state.split("|", 1)
    connection_id = parts[0] if parts else ""
    consent_id = parts[1] if len(parts) > 1 else ""

    # Find the pending connection
    connection = db.query(BankConnection).filter(
        BankConnection.id == connection_id,
        BankConnection.status == "pending",
    ).first()

    if not connection:
        return RedirectResponse(
            url=f"{FRONTEND_URL}/settings?bank_error=Connection+not+found",
        )

    # Get PKCE code_verifier
    code_verifier = _pkce_store.pop(consent_id, None)

    # Exchange authorization code for tokens
    token_payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": ALRAJHI_REDIRECT_URI,
        "client_id": ALRAJHI_API_KEY,
        "client_secret": ALRAJHI_API_SECRET,
    }
    if code_verifier:
        token_payload["code_verifier"] = code_verifier

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            ALRAJHI_TOKEN_URL,
            data=token_payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        logger.error(f"Token exchange failed: {response.status_code} - {response.text}")
        connection.status = "revoked"
        db.commit()
        return RedirectResponse(
            url=f"{FRONTEND_URL}/settings?bank_error=Token+exchange+failed",
        )

    token_data = response.json()
    connection.access_token = token_data["access_token"]
    connection.refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    connection.token_expires = datetime.utcnow() + timedelta(seconds=expires_in)
    connection.status = "active"
    connection.linked_at = datetime.utcnow()
    db.commit()

    logger.info(f"Al Rajhi bank connected successfully: {connection.id}")

    return RedirectResponse(
        url=f"{FRONTEND_URL}/settings?bank_connected=true",
    )


# ============================================================
# 3. ACCOUNTS — Fetch linked bank accounts
# ============================================================

@router.get("/alrajhi/accounts")
async def get_bank_accounts(db: Session = Depends(get_db)):
    """Fetch accounts from Al Rajhi Open Banking API."""
    connection = _get_active_connection(db)
    access_token = await _refresh_token_if_needed(connection, db)

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{ALRAJHI_API_URL}/accounts",
            headers=_get_auth_headers(access_token),
        )

    if response.status_code != 200:
        logger.error(f"Fetch accounts failed: {response.status_code} - {response.text}")
        raise HTTPException(status_code=response.status_code, detail="Failed to fetch bank accounts")

    data = response.json()
    accounts = data.get("Data", {}).get("Account", [])

    return {
        "connection_id": connection.id,
        "accounts": accounts,
        "count": len(accounts),
    }


# ============================================================
# 4. TRANSACTIONS — Fetch transactions for a bank account
# ============================================================

@router.get("/alrajhi/transactions")
async def get_bank_transactions(
    account_id: str = Query(..., description="Al Rajhi account ID"),
    from_date: Optional[str] = Query(None, description="From date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="To date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Fetch transactions from Al Rajhi for a specific account."""
    connection = _get_active_connection(db)
    access_token = await _refresh_token_if_needed(connection, db)

    params = {}
    if from_date:
        params["fromBookingDateTime"] = f"{from_date}T00:00:00+00:00"
    if to_date:
        params["toBookingDateTime"] = f"{to_date}T23:59:59+00:00"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{ALRAJHI_API_URL}/accounts/{account_id}/transactions",
            headers=_get_auth_headers(access_token),
            params=params,
        )

    if response.status_code != 200:
        logger.error(f"Fetch transactions failed: {response.status_code} - {response.text}")
        raise HTTPException(status_code=response.status_code, detail="Failed to fetch bank transactions")

    data = response.json()
    transactions = data.get("Data", {}).get("Transaction", [])

    return {
        "account_id": account_id,
        "transactions": transactions,
        "count": len(transactions),
    }


# ============================================================
# 5. BALANCES — Fetch balances for a bank account
# ============================================================

@router.get("/alrajhi/balances")
async def get_bank_balances(
    account_id: str = Query(..., description="Al Rajhi account ID"),
    db: Session = Depends(get_db),
):
    """Fetch current balance from Al Rajhi for a specific account."""
    connection = _get_active_connection(db)
    access_token = await _refresh_token_if_needed(connection, db)

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{ALRAJHI_API_URL}/accounts/{account_id}/balances",
            headers=_get_auth_headers(access_token),
        )

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail="Failed to fetch account balance")

    data = response.json()
    balances = data.get("Data", {}).get("Balance", [])

    return {
        "account_id": account_id,
        "balances": balances,
    }


# ============================================================
# 6. SYNC — Full sync: accounts + balances + transactions
# ============================================================

@router.post("/alrajhi/sync")
async def sync_bank_data(db: Session = Depends(get_db)):
    """
    Full synchronization: fetch all accounts, balances, and recent transactions
    from Al Rajhi and create/update local records.
    """
    connection = _get_active_connection(db)
    access_token = await _refresh_token_if_needed(connection, db)

    sync_results = {
        "accounts_found": 0,
        "accounts_created": 0,
        "accounts_updated": 0,
        "transactions_found": 0,
        "transactions_created": 0,
        "transactions_skipped": 0,
        "errors": [],
    }

    headers = _get_auth_headers(access_token)

    async with httpx.AsyncClient(timeout=60) as client:
        # --- Step 1: Fetch accounts ---
        try:
            acc_response = await client.get(f"{ALRAJHI_API_URL}/accounts", headers=headers)
            if acc_response.status_code != 200:
                sync_results["errors"].append(f"Failed to fetch accounts: {acc_response.status_code}")
                return sync_results

            api_accounts = acc_response.json().get("Data", {}).get("Account", [])
            sync_results["accounts_found"] = len(api_accounts)
        except Exception as e:
            sync_results["errors"].append(f"Account fetch error: {str(e)}")
            return sync_results

        # --- Step 2: Process each account ---
        for api_acc in api_accounts:
            ext_id = api_acc.get("AccountId", "")
            acc_name = api_acc.get("Nickname") or api_acc.get("Description") or "Al Rajhi Account"
            acc_type = api_acc.get("AccountType", "CurrentAccount")
            iban = ""
            # Extract IBAN from Account identifiers
            for identifier in api_acc.get("Account", []):
                if identifier.get("SchemeName") == "IBAN":
                    iban = identifier.get("Identification", "")
                    break
            currency = api_acc.get("Currency", "SAR")

            # Check if we already have this bank account mapped
            bank_account = db.query(BankAccount).filter(
                BankAccount.connection_id == connection.id,
                BankAccount.external_id == ext_id,
            ).first()

            if not bank_account:
                # Auto-match to local account by IBAN last4 or create new
                last4 = iban[-4:] if len(iban) >= 4 else ""
                local_account = None
                if last4:
                    local_account = db.query(models.Account).filter(
                        models.Account.last_4_digits == last4,
                    ).first()

                if not local_account:
                    # Create a new local account
                    local_account = models.Account(
                        id=str(uuid.uuid4()),
                        name=acc_name,
                        account_type=models.AccountType.CHECKING if "Current" in acc_type else models.AccountType.SAVINGS,
                        bank_name="Al Rajhi",
                        last_4_digits=last4 or ext_id[-4:],
                        current_balance=0.0,
                        notes=f"Auto-created from Al Rajhi Open Banking. IBAN: {iban}",
                    )
                    db.add(local_account)
                    db.flush()
                    sync_results["accounts_created"] += 1

                bank_account = BankAccount(
                    id=str(uuid.uuid4()),
                    connection_id=connection.id,
                    external_id=ext_id,
                    account_id=local_account.id if local_account else None,
                    account_name=acc_name,
                    account_type=acc_type,
                    iban=iban,
                    currency=currency,
                )
                db.add(bank_account)
                db.flush()
            else:
                sync_results["accounts_updated"] += 1

            # --- Step 3: Fetch balance for this account ---
            try:
                bal_response = await client.get(
                    f"{ALRAJHI_API_URL}/accounts/{ext_id}/balances",
                    headers=headers,
                )
                if bal_response.status_code == 200:
                    balances = bal_response.json().get("Data", {}).get("Balance", [])
                    for bal in balances:
                        if bal.get("Type") == "ClosingAvailable" or bal.get("Type") == "InterimAvailable":
                            amount_str = bal.get("Amount", {}).get("Amount", "0")
                            try:
                                balance_amount = float(amount_str)
                                if bank_account.account_id:
                                    local_acc = db.query(models.Account).filter(
                                        models.Account.id == bank_account.account_id
                                    ).first()
                                    if local_acc:
                                        local_acc.current_balance = balance_amount
                            except (ValueError, TypeError):
                                pass
                            break
            except Exception as e:
                sync_results["errors"].append(f"Balance fetch error for {ext_id}: {str(e)}")

            # --- Step 4: Fetch transactions for this account ---
            try:
                # Fetch last 30 days
                from_date = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00+00:00")
                tx_response = await client.get(
                    f"{ALRAJHI_API_URL}/accounts/{ext_id}/transactions",
                    headers=headers,
                    params={"fromBookingDateTime": from_date},
                )

                if tx_response.status_code == 200:
                    api_transactions = tx_response.json().get("Data", {}).get("Transaction", [])
                    sync_results["transactions_found"] += len(api_transactions)

                    for api_tx in api_transactions:
                        # Parse transaction data
                        tx_amount = float(api_tx.get("Amount", {}).get("Amount", 0))
                        tx_currency = api_tx.get("Amount", {}).get("Currency", "SAR")
                        tx_type_raw = api_tx.get("CreditDebitIndicator", "Debit")
                        tx_type = "credit" if tx_type_raw == "Credit" else "debit"
                        tx_status = api_tx.get("Status", "Booked")
                        tx_merchant = (
                            api_tx.get("MerchantDetails", {}).get("MerchantName")
                            or api_tx.get("TransactionInformation")
                            or "Al Rajhi Transaction"
                        )
                        tx_timestamp_str = api_tx.get("BookingDateTime") or api_tx.get("ValueDateTime")
                        tx_timestamp = None
                        if tx_timestamp_str:
                            try:
                                tx_timestamp = datetime.fromisoformat(tx_timestamp_str.replace("Z", "+00:00"))
                            except (ValueError, TypeError):
                                tx_timestamp = datetime.utcnow()

                        # Balance after transaction
                        balance_after = None
                        bal_data = api_tx.get("Balance", {})
                        if bal_data:
                            try:
                                balance_after = float(bal_data.get("Amount", {}).get("Amount", 0))
                            except (ValueError, TypeError):
                                pass

                        # Deduplication: check if a similar transaction already exists
                        # Match on: account_id + amount + timestamp (within 1 minute) + type
                        existing = None
                        if bank_account.account_id and tx_timestamp:
                            time_window_start = tx_timestamp - timedelta(minutes=1)
                            time_window_end = tx_timestamp + timedelta(minutes=1)
                            existing = db.query(models.Transaction).filter(
                                models.Transaction.account_id == bank_account.account_id,
                                models.Transaction.amount == tx_amount,
                                models.Transaction.type == tx_type,
                                models.Transaction.timestamp >= time_window_start,
                                models.Transaction.timestamp <= time_window_end,
                            ).first()

                        if existing:
                            sync_results["transactions_skipped"] += 1
                            continue

                        # Create local transaction
                        new_tx = models.Transaction(
                            id=str(uuid.uuid4()),
                            account_id=bank_account.account_id,
                            amount=tx_amount,
                            merchant=tx_merchant,
                            type=tx_type,
                            status="completed" if tx_status == "Booked" else "pending",
                            timestamp=tx_timestamp or datetime.utcnow(),
                            balance_after_transaction=balance_after,
                            source="alrajhi_api",
                            notes=f"Synced from Al Rajhi Open Banking",
                            original_currency=tx_currency if tx_currency != "SAR" else None,
                        )
                        db.add(new_tx)
                        sync_results["transactions_created"] += 1

            except Exception as e:
                sync_results["errors"].append(f"Transaction fetch error for {ext_id}: {str(e)}")

            bank_account.last_synced = datetime.utcnow()

        # Update connection last sync time
        connection.last_synced = datetime.utcnow()
        db.commit()

    return sync_results


# ============================================================
# 7. STATUS — Check connection status
# ============================================================

@router.get("/alrajhi/status")
async def get_connection_status(db: Session = Depends(get_db)):
    """Get the current Al Rajhi bank connection status."""
    connection = db.query(BankConnection).filter(
        BankConnection.bank_name == "alrajhi",
        BankConnection.status.in_(["active", "pending", "expired"]),
    ).order_by(BankConnection.linked_at.desc()).first()

    if not connection:
        return {
            "connected": False,
            "status": "not_connected",
            "message": "No Al Rajhi bank connection found",
        }

    # Count linked bank accounts
    bank_accounts = db.query(BankAccount).filter(
        BankAccount.connection_id == connection.id,
    ).all()

    is_token_valid = (
        connection.token_expires is not None
        and connection.token_expires > datetime.utcnow()
    )

    return {
        "connected": connection.status == "active",
        "connection_id": connection.id,
        "status": connection.status,
        "linked_at": connection.linked_at.isoformat() if connection.linked_at else None,
        "last_synced": connection.last_synced.isoformat() if connection.last_synced else None,
        "token_valid": is_token_valid,
        "token_expires": connection.token_expires.isoformat() if connection.token_expires else None,
        "accounts_linked": len(bank_accounts),
        "accounts": [
            {
                "id": ba.id,
                "name": ba.account_name,
                "type": ba.account_type,
                "iban": ba.iban,
                "local_account_id": ba.account_id,
                "last_synced": ba.last_synced.isoformat() if ba.last_synced else None,
            }
            for ba in bank_accounts
        ],
    }


# ============================================================
# 8. DISCONNECT — Revoke consent and remove connection
# ============================================================

@router.delete("/alrajhi/connection")
async def disconnect_bank(db: Session = Depends(get_db)):
    """Revoke the Al Rajhi bank consent and remove the connection."""
    connection = db.query(BankConnection).filter(
        BankConnection.bank_name == "alrajhi",
        BankConnection.status.in_(["active", "pending", "expired"]),
    ).first()

    if not connection:
        raise HTTPException(status_code=404, detail="No active bank connection to disconnect")

    # Attempt to revoke consent at Al Rajhi (best-effort)
    if connection.access_token and connection.consent_id:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.delete(
                    f"{ALRAJHI_API_URL}/account-access-consents/{connection.consent_id}",
                    headers=_get_auth_headers(connection.access_token),
                )
        except Exception as e:
            logger.warning(f"Failed to revoke consent at Al Rajhi: {e}")

    # Mark as revoked locally
    connection.status = "revoked"
    connection.access_token = None
    connection.refresh_token = None
    db.commit()

    return {"message": "Al Rajhi bank connection disconnected", "connection_id": connection.id}
