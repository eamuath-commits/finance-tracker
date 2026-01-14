from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from datetime import datetime
from .database import Base

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
    last_4_digits = Column(String, unique=True, index=True) # Critical for SMS matching
    current_balance = Column(Float, default=0.0)
    
    transactions = relationship("Transaction", back_populates="account")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"))
    amount = Column(Float, nullable=False)
    merchant = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    raw_sms_content = Column(Text, nullable=True)
    
    account = relationship("Account", back_populates="transactions")

class Loan(Base):
    __tablename__ = "loans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    principal_amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False) # Annual percentage
    start_date = Column(Date, nullable=False)
    term_months = Column(Integer, nullable=False)
    remaining_balance = Column(Float, nullable=False)
