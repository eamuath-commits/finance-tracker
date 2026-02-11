from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Enum, Text, Boolean
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
    bank_name = Column(String, nullable=True) # User requested mandatory for new, but keep nullable for legacy/migration safety
    bank_logo_url = Column(String, nullable=True)
    last_4_digits = Column(String, unique=True, index=True) # Critical for SMS matching
    current_balance = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    credit_limit = Column(Float, nullable=True) 
    interest_rate = Column(Float, nullable=True) # APR for Credit Cards
    minimum_payment = Column(Float, nullable=True) # Minimum monthly payment
    is_income = Column(Boolean, default=False)
    last_successful_audit_date = Column(DateTime, nullable=True)
    
    transactions = relationship("Transaction", back_populates="account")
    aliases = relationship("AccountAlias", back_populates="account", cascade="all, delete-orphan")
    audits = relationship("AccountAudit", back_populates="account", cascade="all, delete-orphan")
    wallets = relationship("CurrencyWallet", back_populates="account", cascade="all, delete-orphan")

class CreditCard(Base):
    """Separate table for Credit Cards with credit-specific features"""
    __tablename__ = "credit_cards"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)           # e.g., "Riyad Bank Visa"
    bank_name = Column(String, nullable=True)
    bank_logo_url = Column(String, nullable=True)
    last_4_digits = Column(String, unique=True, index=True)  # For SMS matching
    
    # Balance & Limits
    current_balance = Column(Float, default=0.0)    # What you owe (positive = debt)
    credit_limit = Column(Float, default=0.0)       # Maximum credit line
    
    # Billing Cycle
    statement_day = Column(Integer, nullable=True)   # Day of month statement closes (1-28)
    due_day = Column(Integer, nullable=True)         # Day of month payment is due (1-28)
    
    # Interest & Payments
    apr = Column(Float, nullable=True)               # Annual Percentage Rate
    minimum_payment_percent = Column(Float, default=5.0)  # Min payment as % of balance
    
    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    transactions = relationship("Transaction", back_populates="credit_card")
    
    @property
    def available_credit(self):
        """Calculate available credit (limit - balance)"""
        return max(0, (self.credit_limit or 0) - (self.current_balance or 0))
    
    @property
    def utilization_percent(self):
        """Calculate credit utilization percentage"""
        if not self.credit_limit or self.credit_limit == 0:
            return 0
        return round((self.current_balance or 0) / self.credit_limit * 100, 1)

class AccountAudit(Base):
    __tablename__ = "account_audits"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    audit_date = Column(DateTime, default=datetime.utcnow)
    system_balance = Column(Float, nullable=False)
    actual_balance = Column(Float, nullable=False)
    difference = Column(Float, nullable=False)
    status = Column(String, nullable=False) # "MATCH" or "MISMATCH"
    notes = Column(Text, nullable=True)

    account = relationship("Account", back_populates="audits")

class AccountAlias(Base):
    __tablename__ = "account_aliases"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    alias_name = Column(String, nullable=False) # e.g. "Debit Card", "Apple Pay"
    last_4_digits = Column(String, nullable=False) # The fallback/linked number

    account = relationship("Account", back_populates="aliases")

class CurrencyWallet(Base):
    __tablename__ = "currency_wallets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    currency_code = Column(String, nullable=False) # USD, EUR, etc.
    balance = Column(Float, default=0.0)
    last_updated = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="wallets")


# --- Counterparty Reference Tables ---

class Merchant(Base):
    """Stores/shops for POS and online purchases"""
    __tablename__ = "merchants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)  # Canonical name
    display_name = Column(String, nullable=True)         # User-friendly override
    category = Column(String, nullable=True)             # Default category
    logo_url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="merchant_ref")

class Beneficiary(Base):
    """People/companies you transfer money to"""
    __tablename__ = "beneficiaries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)                # Full name from SMS
    display_name = Column(String, nullable=True)         # Nickname e.g. "Dad"
    bank_name = Column(String, nullable=True)            # e.g. "AlRajhi"
    iban = Column(String, nullable=True)                 # Full IBAN if available
    account_last4 = Column(String, nullable=True)        # For matching
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="beneficiary_ref")

class Biller(Base):
    """Service providers for bill payments (telecom, utilities, government)"""
    __tablename__ = "billers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)   # e.g. "STC", "NWC"
    display_name = Column(String, nullable=True)
    category = Column(String, nullable=True)             # e.g. "Telecom", "Water"
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="biller_ref")


class TransactionType(enum.Enum):
    DEBIT = "debit"
    CREDIT = "credit"

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String, ForeignKey("accounts.id"), nullable=True)  # Nullable for CC transactions
    credit_card_id = Column(String, ForeignKey("credit_cards.id"), nullable=True)  # NEW: For credit card transactions
    amount = Column(Float, nullable=False)
    merchant = Column(String)
    raw_sms_content = Column(Text)
    timestamp = Column(DateTime)
    category = Column(String, nullable=True)
    type = Column(String, default="debit") # "credit" or "debit"
    balance_after_transaction = Column(Float, nullable=True)
    status = Column(String, default="completed", nullable=False) # pending, completed, pending_action
    notes = Column(Text, nullable=True)
    
    # Financial fields
    original_amount = Column(Float, nullable=True)
    original_currency = Column(String, nullable=True)
    exchange_rate = Column(Float, nullable=True)
    logo_url = Column(String, nullable=True)
    fees = Column(Float, default=0.0)
    parsed_data = Column(Text, nullable=True)  # JSON: Full AI-extracted data from SMS
    source = Column(String, nullable=True)  # Source of transaction: 'telegram', 'webui', 'manual'
    
    # Counterparty references (only ONE should be set per transaction)
    merchant_id = Column(String, ForeignKey("merchants.id"), nullable=True)
    beneficiary_id = Column(String, ForeignKey("beneficiaries.id"), nullable=True)
    biller_id = Column(String, ForeignKey("billers.id"), nullable=True)
    
    # Relationships
    account = relationship("Account", back_populates="transactions")
    credit_card = relationship("CreditCard", back_populates="transactions")  # NEW
    merchant_ref = relationship("Merchant", back_populates="transactions")
    beneficiary_ref = relationship("Beneficiary", back_populates="transactions")
    biller_ref = relationship("Biller", back_populates="transactions")
    payments = relationship("Payment", back_populates="transaction")

class Loan(Base):
    __tablename__ = "loans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    principal_amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False) # Annual percentage
    start_date = Column(Date, nullable=False)
    term_months = Column(Integer, nullable=False)
    remaining_balance = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    monthly_payment = Column(Float, nullable=True) # Explicit monthly payment amount
    due_day = Column(Integer, nullable=True) # Day of month payment is due
    display_order = Column(Integer, default=0) # For UI ordering

class MonthlyObligation(Base):
    __tablename__ = "obligations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    amount = Column(Float, nullable=True) # User requested optional amount
    due_day = Column(Integer, nullable=False) # e.g. 1 for 1st of month
    category = Column(String, nullable=True)
    provider = Column(String, nullable=True) # New optional field
    notes = Column(Text, nullable=True)
    display_order = Column(Integer, default=0) # For UI ordering


class PaymentStatus(enum.Enum):
    PAID = "PAID"
    BUDGET = "BUDGET"
    PENDING = "PENDING"
    # Status Enum Definition

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    obligation_id = Column(String, ForeignKey("obligations.id"))
    amount = Column(Float)
    planned_amount = Column(Float, nullable=True) # Snapshot of budget at time of payment creation
    payment_date = Column(Date)
    billing_month = Column(String) # YYYY-MM to track monthly payments
    note = Column(String, nullable=True)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.PAID)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=True) # Link to actual transaction

    obligation = relationship("MonthlyObligation") # Removed back_populates to avoid circular dependency conflict if needed, or add back
    transaction = relationship("Transaction", back_populates="payments")

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
    timestamp = Column(DateTime, default=datetime.now)
    status = Column(Enum(MessageStatus), default=MessageStatus.PENDING)
    error_log = Column(Text, nullable=True) # To store why it failed

class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)
    type = Column(String, default="BOTH") # OBLIGATION, TRANSACTION, BOTH

class SavingsGoal(Base):
    __tablename__ = "savings_goals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0.0)
    target_date = Column(Date, nullable=True)
    icon = Column(String, nullable=True) # e.g. "Plane", "Car"
    color = Column(String, nullable=True) # Hex color

class TrainingExample(Base):
    __tablename__ = "training_examples"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    raw_text = Column(String, nullable=False)
    parsed_json = Column(Text, nullable=False) # JSON string
    created_at = Column(DateTime, default=datetime.now)

class AllocationRule(Base):
    __tablename__ = "allocation_rules"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_type = Column(String, nullable=False)  # 'CATEGORY' or 'LOAN'
    identifier = Column(String, nullable=False)  # Category name or Loan name
    target_account_id = Column(String, ForeignKey("accounts.id"), nullable=False)  # Target envelope account

class AllocationHistory(Base):
    __tablename__ = "allocation_history"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    month = Column(String, nullable=False) # YYYY-MM
    income = Column(Float, default=0.0)
    needs_planned = Column(Float, default=0.0)
    needs_actual = Column(Float, default=0.0)
    wants_planned = Column(Float, default=0.0)
    wants_actual = Column(Float, default=0.0)
    savings_planned = Column(Float, default=0.0)
    savings_actual = Column(Float, default=0.0)

class Distribution(Base):
    """Track salary distribution records with transaction linking"""
    __tablename__ = "distributions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    target_account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    amount = Column(Float, nullable=False)
    billing_month = Column(String, nullable=False)  # "2026-01"
    note = Column(String, nullable=True)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=True)  # Linked transaction
    created_at = Column(DateTime, default=datetime.now)
    
    # Relationships
    source_account = relationship("Account", foreign_keys=[source_account_id])
    target_account = relationship("Account", foreign_keys=[target_account_id])
    linked_transaction = relationship("Transaction", foreign_keys=[transaction_id])


# Junction Tables for Many-to-Many Transaction Linking

class PaymentTransaction(Base):
    """Junction table for linking multiple transactions to a payment"""
    __tablename__ = "payment_transactions"
    
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="CASCADE"), primary_key=True)
    transaction_id = Column(String, ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.now)
    
    # Relationships
    payment = relationship("Payment", backref="linked_transactions")
    transaction = relationship("Transaction", backref="payment_links")


class DistributionTransaction(Base):
    """Junction table for linking multiple transactions to a distribution"""
    __tablename__ = "distribution_transactions"
    
    distribution_id = Column(String, ForeignKey("distributions.id", ondelete="CASCADE"), primary_key=True)
    transaction_id = Column(String, ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.now)
    
    # Relationships
    distribution = relationship("Distribution", backref="linked_transactions")
    transaction = relationship("Transaction", backref="distribution_links")


class QueueStatus(enum.Enum):
    QUEUED = "queued"      # Waiting to be processed
    BLOCKED = "blocked"    # Blocked by pending item
    PROCESSED = "processed"  # Balance has been updated


class TransactionQueue(Base):
    """Queue for transaction processing to ensure balance consistency"""
    __tablename__ = "transaction_queue"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    transaction_id = Column(String, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=True)
    credit_card_id = Column(String, ForeignKey("credit_cards.id"), nullable=True)
    status = Column(String, default="queued")  # queued, blocked, processed
    queued_at = Column(DateTime, default=datetime.now)
    processed_at = Column(DateTime, nullable=True)
    blocked_reason = Column(String, nullable=True)
    
    # Relationships
    transaction = relationship("Transaction", backref="queue_entry")
    account = relationship("Account")
    credit_card = relationship("CreditCard")

