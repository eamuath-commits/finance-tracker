from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Enum, Text, Boolean, JSON, UniqueConstraint, Numeric


# Money columns use exact decimal storage but return Python float to the app
# (asdecimal=False) so no Decimal arithmetic ripple is required. Rates
# (interest_rate, apr, exchange_rate, minimum_payment_percent) stay Float.
def Money():
    return Numeric(14, 2, asdecimal=False)
from sqlalchemy.orm import relationship, backref
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from datetime import datetime
from database import Base


class User(Base):
    """User profile for multi-tenant authentication"""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    telegram_user_id = Column(String, unique=True, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AccountType(enum.Enum):
    CHECKING = "Checking"
    SAVINGS = "Savings"
    CREDIT_CARD = "Credit Card"
    LOAN = "Loan"

class Account(Base):
    __tablename__ = "accounts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    account_type = Column(Enum(AccountType), nullable=False)
    first_4_digits = Column(String, nullable=True) # Optional for verification
    account_number = Column(String, nullable=True)  # Full IBAN or account number (from bank statements)
    bank_name = Column(String, nullable=True) # User requested mandatory for new, but keep nullable for legacy/migration safety
    bank_logo_url = Column(String, nullable=True)
    last_4_digits = Column(String, index=True) # Critical for SMS matching (unique per user via __table_args__)
    current_balance = Column(Money(), default=0.0)
    notes = Column(Text, nullable=True)
    credit_limit = Column(Money(), nullable=True) 
    interest_rate = Column(Float, nullable=True) # APR for Credit Cards
    minimum_payment = Column(Money(), nullable=True) # Minimum monthly payment
    is_income = Column(Boolean, default=False)
    last_successful_audit_date = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint('user_id', 'last_4_digits', name='uq_account_user_last4'),)

    user = relationship("User", backref="accounts")
    transactions = relationship("Transaction", back_populates="account")
    aliases = relationship("AccountAlias", back_populates="account", cascade="all, delete-orphan")
    audits = relationship("AccountAudit", back_populates="account", cascade="all, delete-orphan")
    wallets = relationship("CurrencyWallet", back_populates="account", cascade="all, delete-orphan")

class CreditCard(Base):
    """Separate table for Credit Cards with credit-specific features"""
    __tablename__ = "credit_cards"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)           # e.g., "Riyad Bank Visa"
    bank_name = Column(String, nullable=True)
    bank_logo_url = Column(String, nullable=True)
    last_4_digits = Column(String, index=True)  # For SMS matching (unique per user via __table_args__)
    
    # Balance & Limits
    current_balance = Column(Money(), default=0.0)    # What you owe (positive = debt)
    credit_limit = Column(Money(), default=0.0)       # Maximum credit line
    
    # Billing Cycle
    statement_day = Column(Integer, nullable=True)   # Day of month statement closes (1-28)
    due_day = Column(Integer, nullable=True)         # Day of month payment is due (1-28)
    
    # Interest & Payments
    apr = Column(Float, nullable=True)               # Annual Percentage Rate
    minimum_payment_percent = Column(Float, default=5.0)  # Min payment as % of balance
    
    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint('user_id', 'last_4_digits', name='uq_cc_user_last4'),)

    # Relationships
    user = relationship("User", backref="credit_cards")
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
    system_balance = Column(Money(), nullable=False)
    actual_balance = Column(Money(), nullable=False)
    difference = Column(Money(), nullable=False)
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
    balance = Column(Money(), default=0.0)
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
    brand_domain = Column(String, nullable=True)
    aliases = Column(JSON, nullable=True, default=list)  # List of alternative names for matching
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="merchant_ref")

class Beneficiary(Base):
    """People/companies you transfer money to"""
    __tablename__ = "beneficiaries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
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
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=True)  # Nullable for CC transactions
    credit_card_id = Column(String, ForeignKey("credit_cards.id"), nullable=True)  # NEW: For credit card transactions
    amount = Column(Money(), nullable=False)
    merchant = Column(String)
    merchant_original = Column(String, nullable=True)  # statement label before SMS enrichment (for undo)
    enrichment_batch_id = Column(String, nullable=True)  # batch that renamed this row, if any
    enriched_at = Column(DateTime, nullable=True)        # when that batch was applied
    raw_sms_content = Column(Text)
    timestamp = Column(DateTime)
    category = Column(String, nullable=True)              # what it was FOR (Groceries, Fuel)
    type = Column(String, default="debit") # "credit" or "debit"
    # What the BANK did — PURCHASE, INTERNAL_TRANSFER, FEE, BILL_PAYMENT ...
    # A separate axis from `category`: an internal transfer has no spending
    # category, and counting it as one overstated expenses. See transaction_types.
    transaction_type = Column(String, nullable=True, index=True)
    # Both legs of one internal transfer share a transfer_group_id. The rows stay
    # separate — each is real on its own account and its own statement — this only
    # records that they are the same movement of money, so it can be shown as
    # "Liability -> General" and so deleting one leg can find the other reliably
    # instead of re-guessing it from amount+timestamp.
    transfer_group_id = Column(String, nullable=True, index=True)
    # Deliberately NOT a ForeignKey: a second FK from transactions to accounts
    # makes Account.transactions ambiguous to resolve, and it would also give
    # account deletion another NO ACTION reference to trip over. The authoritative
    # link is transfer_group_id; this is a denormalised hint for display.
    transfer_counterpart_account_id = Column(String, nullable=True)
    balance_after_transaction = Column(Money(), nullable=True)
    status = Column(String, default="completed", nullable=False) # pending, completed, pending_action
    notes = Column(Text, nullable=True)
    
    # Financial fields
    original_amount = Column(Money(), nullable=True)
    original_currency = Column(String, nullable=True)
    exchange_rate = Column(Float, nullable=True)
    logo_url = Column(String, nullable=True)
    fees = Column(Money(), default=0.0)
    parsed_data = Column(Text, nullable=True)  # JSON: Full AI-extracted data from SMS
    source = Column(String, nullable=True)  # Source of transaction: 'telegram', 'webui', 'manual', 'statement'
    statement_id = Column(String, ForeignKey("statements.id", ondelete="SET NULL"), nullable=True)  # FK to imported statement
    statement_row_index = Column(Integer, nullable=True)  # PDF print order index (bank processing order)
    
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
    statement = relationship("Statement", back_populates="transactions")

class Loan(Base):
    __tablename__ = "loans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    principal_amount = Column(Money(), nullable=False)
    interest_rate = Column(Float, nullable=False) # Annual percentage
    start_date = Column(Date, nullable=False)
    term_months = Column(Integer, nullable=False)
    remaining_balance = Column(Money(), nullable=False)
    notes = Column(Text, nullable=True)
    monthly_payment = Column(Money(), nullable=True) # Explicit monthly payment amount
    due_day = Column(Integer, nullable=True) # Day of month payment is due
    display_order = Column(Integer, default=0) # For UI ordering

class MonthlyObligation(Base):
    __tablename__ = "obligations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    amount = Column(Money(), nullable=True) # User requested optional amount
    due_day = Column(Integer, nullable=False) # e.g. 1 for 1st of month
    category = Column(String, nullable=True)
    provider = Column(String, nullable=True) # New optional field
    notes = Column(Text, nullable=True)
    display_order = Column(Integer, default=0) # For UI ordering
    target_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)  # Envelope account for salary distribution

    target_account = relationship("Account", foreign_keys=[target_account_id])


class PaymentStatus(enum.Enum):
    # Only two states by design: BUDGET = planned for the month, PAID = actually paid.
    # (PENDING was removed — nothing ever created it and no rows used it.)
    PAID = "PAID"
    BUDGET = "BUDGET"
    # Status Enum Definition

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    obligation_id = Column(String, ForeignKey("obligations.id"))
    amount = Column(Money())
    planned_amount = Column(Money(), nullable=True) # Snapshot of budget at time of payment creation
    payment_date = Column(Date)
    billing_month = Column(String) # YYYY-MM to track monthly payments
    note = Column(String, nullable=True)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.PAID)
    transaction_id = Column(String, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True) # Link to actual transaction
    source = Column(String, nullable=True, default=None)  # None=manual, 'auto'=auto-matched

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
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
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
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    target_amount = Column(Money(), nullable=False)
    current_amount = Column(Money(), default=0.0)
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
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    rule_type = Column(String, nullable=False)  # 'CATEGORY' or 'LOAN'
    identifier = Column(String, nullable=False)  # Category name or Loan name
    target_account_id = Column(String, ForeignKey("accounts.id"), nullable=False)  # Target envelope account

# (AllocationHistory model removed — dead 50/30/20 snapshot table, never written or read)

class Distribution(Base):
    """Track salary distribution records with transaction linking"""
    __tablename__ = "distributions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    source_account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    target_account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    obligation_id = Column(String, ForeignKey("obligations.id"), nullable=True)  # Which obligation this transfer is for
    amount = Column(Money(), nullable=False)
    billing_month = Column(String, nullable=False)  # "2026-01"
    note = Column(String, nullable=True)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=True)  # Linked transaction
    created_at = Column(DateTime, default=datetime.now)
    
    # Relationships
    source_account = relationship("Account", foreign_keys=[source_account_id])
    target_account = relationship("Account", foreign_keys=[target_account_id])
    obligation = relationship("MonthlyObligation", foreign_keys=[obligation_id])
    linked_transaction = relationship("Transaction", foreign_keys=[transaction_id])


# Junction Tables for Many-to-Many Transaction Linking

class PaymentTransaction(Base):
    """Junction table for linking multiple transactions to a payment"""
    __tablename__ = "payment_transactions"
    
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="CASCADE"), primary_key=True)
    transaction_id = Column(String, ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.now)
    link_source = Column(String, nullable=True)  # 'auto' = auto-matched/auto-linked, None = manual
    
    # Relationships
    payment = relationship("Payment", backref=backref("linked_transactions", cascade="all, delete-orphan"))
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


class Statement(Base):
    """Imported bank statement (PDF) with metadata and reconciliation status"""
    __tablename__ = "statements"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=True)  # Resolved after parsing
    # A statement targets EITHER a bank account or a credit card, never both. A
    # card statement is a different document (balance = debt, purchases increase
    # it, payments reduce it), so its posting/reconciliation is handled apart
    # from the account flow.
    credit_card_id = Column(String, ForeignKey("credit_cards.id"), nullable=True)
    bank_name = Column(String, nullable=True)  # e.g. "Al Rajhi" (display)
    bank_key = Column(String, nullable=True)   # canonical issuer id, scopes type rules
    original_filename = Column(String, nullable=True)
    file_path = Column(String, nullable=True)  # Server path to stored PDF
    statement_period_start = Column(Date, nullable=True)
    statement_period_end = Column(Date, nullable=True)
    opening_balance = Column(Money(), nullable=True)
    closing_balance = Column(Money(), nullable=True)
    account_number = Column(String, nullable=True)  # Full account number from statement header
    transaction_count = Column(Integer, default=0)
    reconciliation_status = Column(String, default="pending")  # pending / reconciled / flagged
    reconciliation_errors = Column(Text, nullable=True)  # JSON: details of mismatches
    status = Column(String, default="draft")  # draft / approved / rejected
    pdf_type = Column(String, nullable=True)  # text / scanned
    notes = Column(Text, nullable=True)  # User-added notes/tags
    imported_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="statements")
    account = relationship("Account", backref="statements")
    transactions = relationship("Transaction", back_populates="statement")


class StatementLine(Base):
    """
    A single parsed row from a bank statement PDF (persisted once at parse time).

    This is the source of truth the reconciler works against, so the PDF is
    parsed once instead of re-parsed on every request. A line is matched against
    an existing ledger transaction (matched_transaction_id) or posted as a new
    one (posted_transaction_id) during reconciliation.
    """
    __tablename__ = "statement_lines"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    statement_id = Column(String, ForeignKey("statements.id"), nullable=False, index=True)
    row_index = Column(Integer, nullable=False)  # print order within the statement

    # Parsed values
    txn_date = Column(Date, nullable=True)
    txn_time = Column(String, nullable=True)      # HH:MM:SS from the PDF
    type_line = Column(String, nullable=True)     # e.g. "Internal Transfer between Accounts"
    note = Column(Text, nullable=True)
    debit = Column(Money(), default=0.0)
    credit = Column(Money(), default=0.0)
    balance = Column(Money(), nullable=True)        # running balance printed on the row
    direction = Column(String, nullable=True)     # 'debit' | 'credit'
    amount = Column(Money(), default=0.0)           # the non-zero side
    category = Column(String, nullable=True)

    # Reconciliation signals extracted from the note
    counterparty_account = Column(String, nullable=True)
    counterparty_name = Column(String, nullable=True)
    reference = Column(String, nullable=True)
    is_fee = Column(Boolean, default=False)       # e.g. "... Transaction Charges"

    # Reconciliation state (populated in later phases)
    match_status = Column(String, default="pending")  # pending|matched|new|excluded|posted
    matched_transaction_id = Column(String, ForeignKey("transactions.id"), nullable=True)
    posted_transaction_id = Column(String, ForeignKey("transactions.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    statement = relationship("Statement", backref="lines")

    __table_args__ = (
        UniqueConstraint("statement_id", "row_index", name="uq_statement_line_row"),
    )


class UserSettings(Base):
    """App-wide settings stored as key-value pairs"""
    __tablename__ = "user_settings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    key = Column(String, nullable=False, index=True)
    value = Column(String, nullable=False, default="")
    label = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint('user_id', 'key', name='uq_settings_user_key'),)
