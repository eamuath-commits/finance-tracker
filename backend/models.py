from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from datetime import datetime
from database import Base

class AccountType(enum.Enum):
    CHECKING = "Checking"
    SAVINGS = "Savings"
    CREDIT_CARD = "Credit Card"
    LOAN = "Loan"

class Account(Base):
    __tablename__ = "accounts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    account_type = Column(Enum(AccountType), nullable=False)
    first_4_digits = Column(String, nullable=True) # Optional for verification
    last_4_digits = Column(String, unique=True, index=True) # Critical for SMS matching
    current_balance = Column(Float, default=0.0)
    credit_limit = Column(Float, nullable=True) 
    interest_rate = Column(Float, nullable=True) # APR for Credit Cards
    minimum_payment = Column(Float, nullable=True) # Minimum monthly payment
    
    transactions = relationship("Transaction", back_populates="account")
    aliases = relationship("AccountAlias", back_populates="account", cascade="all, delete-orphan")

class AccountAlias(Base):
    __tablename__ = "account_aliases"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    alias_name = Column(String, nullable=False) # e.g. "Debit Card", "Apple Pay"
    last_4_digits = Column(String, nullable=False) # The fallback/linked number

    account = relationship("Account", back_populates="aliases")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"))
    amount = Column(Float, nullable=False)
    merchant = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    category = Column(String, nullable=True)
    raw_sms_content = Column(Text, nullable=True)
    balance_after_transaction = Column(Float, nullable=True)
    
    account = relationship("Account", back_populates="transactions")

class Loan(Base):
    __tablename__ = "loans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    principal_amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False) # Annual percentage
    start_date = Column(Date, nullable=False)
    term_months = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    term_months = Column(Integer, nullable=False)
    remaining_balance = Column(Float, nullable=False)
    monthly_payment = Column(Float, nullable=True) # Explicit monthly payment amount

class MonthlyObligation(Base):
    __tablename__ = "obligations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    amount = Column(Float, nullable=True) # User requested optional amount
    due_day = Column(Integer, nullable=False) # e.g. 1 for 1st of month
    category = Column(String, nullable=True)

class PaymentStatus(enum.Enum):
    PAID = "PAID"
    PENDING = "PENDING"
    # Status Enum Definition

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    obligation_id = Column(String, ForeignKey("obligations.id"), nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow)
    billing_month = Column(Date, nullable=True) # First day of the cycle month
    amount = Column(Float, nullable=False)
    note = Column(String, nullable=True)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.PAID)

    obligation = relationship("MonthlyObligation")

class MessageStatus(enum.Enum):
    PENDING = "PENDING"
    PARSED = "PARSED"
    FAILED = "FAILED"
    IGNORED = "IGNORED"

class RawMessage(Base):
    __tablename__ = "raw_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    sender = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(MessageStatus), default=MessageStatus.PENDING)
    error_log = Column(Text, nullable=True) # To store why it failed
