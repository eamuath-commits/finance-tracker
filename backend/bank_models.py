"""
Bank connection models for Open Banking integrations.

Stores OAuth tokens, consent details, and maps external bank accounts
to local Account records for syncing.
"""
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from database import Base


class BankConnection(Base):
    """Stores OAuth tokens and consent details for a linked bank account."""
    __tablename__ = "bank_connections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    bank_name = Column(String, nullable=False)           # "alrajhi"
    consent_id = Column(String, nullable=True)           # Al Rajhi consent ID
    access_token = Column(Text, nullable=True)           # OAuth access token
    refresh_token = Column(Text, nullable=True)          # OAuth refresh token
    token_expires = Column(DateTime, nullable=True)      # When access_token expires
    status = Column(String, default="pending")           # pending, active, expired, revoked
    linked_at = Column(DateTime, default=datetime.utcnow)
    last_synced = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", backref="bank_connections")
    bank_accounts = relationship("BankAccount", back_populates="connection", cascade="all, delete-orphan")


class BankAccount(Base):
    """Maps an external bank account (from Open Banking API) to a local Account."""
    __tablename__ = "bank_accounts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connection_id = Column(String, ForeignKey("bank_connections.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String, nullable=False)         # Al Rajhi account ID from API
    account_id = Column(String, ForeignKey("accounts.id"), nullable=True)  # Linked local account
    account_name = Column(String, nullable=True)         # Name from bank API
    account_type = Column(String, nullable=True)         # e.g. "CurrentAccount", "SavingsAccount"
    iban = Column(String, nullable=True)
    currency = Column(String, default="SAR")
    is_synced = Column(Boolean, default=True)            # Whether to include in sync
    last_synced = Column(DateTime, nullable=True)

    # Relationships
    connection = relationship("BankConnection", back_populates="bank_accounts")
    local_account = relationship("Account", backref="bank_account_link")
