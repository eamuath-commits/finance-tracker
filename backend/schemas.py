from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
import enum


# --- User / Auth Schemas ---
class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    is_active: bool
    telegram_user_id: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserUpdate(BaseModel):
    email: Optional[str] = None
    telegram_user_id: Optional[str] = None

class AdminResetPassword(BaseModel):
    new_password: str

class AdminUserUpdate(BaseModel):
    email: Optional[str] = None
    is_active: Optional[bool] = None
    telegram_user_id: Optional[str] = None

class ChangePassword(BaseModel):
    current_password: str
    new_password: str


# --- Currency Wallet Schemas ---
class CurrencyWalletBase(BaseModel):
    currency_code: str
    balance: float

class CurrencyWalletCreate(CurrencyWalletBase):
    pass

class CurrencyWalletUpdate(BaseModel):
    balance: Optional[float] = None

class CurrencyWallet(CurrencyWalletBase):
    id: str
    account_id: str
    last_updated: datetime

    class Config:
        from_attributes = True

# --- Account Alias Schemas ---
class AccountAliasBase(BaseModel):
    alias_name: str
    last_4_digits: str

class AccountAliasCreate(AccountAliasBase):
    pass

class AccountAlias(AccountAliasBase):
    id: int
    account_id: str

    class Config:
        from_attributes = True

# --- Credit Card Schemas ---
class CreditCardBase(BaseModel):
    name: str
    bank_name: Optional[str] = None
    last_4_digits: Optional[str] = None
    credit_limit: float = 0.0
    statement_day: Optional[int] = None  # Day of month (1-28)
    due_day: Optional[int] = None        # Day of month (1-28)
    apr: Optional[float] = None          # Annual Percentage Rate
    minimum_payment_percent: float = 5.0
    notes: Optional[str] = None

class CreditCardCreate(CreditCardBase):
    pass

class CreditCardUpdate(BaseModel):
    name: Optional[str] = None
    bank_name: Optional[str] = None
    last_4_digits: Optional[str] = None
    current_balance: Optional[float] = None
    credit_limit: Optional[float] = None
    statement_day: Optional[int] = None
    due_day: Optional[int] = None
    apr: Optional[float] = None
    minimum_payment_percent: Optional[float] = None
    notes: Optional[str] = None

class CreditCard(CreditCardBase):
    id: str
    current_balance: float
    available_credit: float  # Calculated property
    utilization_percent: float  # Calculated property
    bank_logo_url: Optional[str] = None
    
    class Config:
        from_attributes = True

# --- Counterparty Schemas ---
class MerchantBase(BaseModel):
    name: str
    display_name: Optional[str] = None
    category: Optional[str] = None
    logo_url: Optional[str] = None
    brand_domain: Optional[str] = None
    aliases: Optional[List[str]] = []
    notes: Optional[str] = None

class MerchantCreate(MerchantBase):
    pass

class MerchantUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    category: Optional[str] = None
    logo_url: Optional[str] = None
    brand_domain: Optional[str] = None
    aliases: Optional[List[str]] = None
    notes: Optional[str] = None

class Merchant(MerchantBase):
    id: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class BeneficiaryBase(BaseModel):
    name: str
    display_name: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    account_last4: Optional[str] = None
    notes: Optional[str] = None

class BeneficiaryCreate(BeneficiaryBase):
    pass

class BeneficiaryUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    account_last4: Optional[str] = None
    notes: Optional[str] = None

class Beneficiary(BeneficiaryBase):
    id: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class BillerBase(BaseModel):
    name: str
    display_name: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None

class BillerCreate(BillerBase):
    pass

class BillerUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None

class Biller(BillerBase):
    id: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Transaction Schemas ---
class TransactionBase(BaseModel):
    amount: float
    merchant: Optional[str] = None
    category: Optional[str] = None
    type: str # "credit" or "debit"
    status: str = "completed"
    notes: Optional[str] = None
    fees: Optional[float] = 0.0
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    logo_url: Optional[str] = None

class TransactionCreate(TransactionBase):
    account_id: Optional[str] = None
    credit_card_id: Optional[str] = None  # NEW: For credit card transactions
    raw_sms_content: Optional[str] = None
    parsed_data: Optional[str] = None  # JSON string of all AI-extracted fields
    timestamp: datetime
    source: Optional[str] = None  # Source: 'telegram', 'webui', 'manual'
    merchant_id: Optional[str] = None
    beneficiary_id: Optional[str] = None
    biller_id: Optional[str] = None
    user_id: Optional[str] = None  # Owner of the transaction

class TransactionUpdate(BaseModel):
    account_id: Optional[str] = None
    credit_card_id: Optional[str] = None
    amount: Optional[float] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    timestamp: Optional[datetime] = None
    fees: Optional[float] = None
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    previous_balance: Optional[float] = None  # If set, recalculate from this balance
    merchant_id: Optional[str] = None
    beneficiary_id: Optional[str] = None
    biller_id: Optional[str] = None

class Transaction(TransactionBase):
    id: str
    account_id: Optional[str] = None
    credit_card_id: Optional[str] = None  # NEW
    timestamp: datetime
    balance_after_transaction: Optional[float] = None
    raw_sms_content: Optional[str] = None  # Include raw SMS in response
    parsed_data: Optional[str] = None  # JSON string of all AI-extracted fields
    source: Optional[str] = None  # Source: 'telegram', 'webui', 'manual'
    merchant_id: Optional[str] = None
    beneficiary_id: Optional[str] = None
    biller_id: Optional[str] = None
    # What the bank did (PURCHASE, INTERNAL_TRANSFER, FEE ...), separate from the
    # spending category.
    transaction_type: Optional[str] = None
    # Both legs of one internal transfer share a group id; the counterpart is the
    # account on the other side, so the pair can render as "Liability -> General".
    transfer_group_id: Optional[str] = None
    transfer_counterpart_account_id: Optional[str] = None
    # SMS name enrichment: the statement's original label and the batch that
    # replaced it, so the UI can show that a name was not typed by the user.
    merchant_original: Optional[str] = None
    enrichment_batch_id: Optional[str] = None
    enriched_at: Optional[datetime] = None
    # Nested counterparty objects (populated from relationships)
    merchant_info: Optional[Merchant] = None
    beneficiary_info: Optional[Beneficiary] = None
    biller_info: Optional[Biller] = None

    class Config:
        from_attributes = True

class BulkDeleteRequest(BaseModel):
    ids: List[str]

class ReorderSchema(BaseModel):
    ordered_ids: List[str]

class BulkDeleteObligationsRequest(BaseModel):
    ids: List[str]

# --- Payment Schemas ---
class PaymentBase(BaseModel):
    amount: float
    payment_date: Optional[datetime] = None
    billing_month: Optional[str] = None
    status: str = "PAID"
    note: Optional[str] = None
    planned_amount: Optional[float] = None
    transaction_id: Optional[str] = None
    source: Optional[str] = None  # None=manual, 'auto'=auto-matched

class PaymentCreate(PaymentBase):
    pass

class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    payment_date: Optional[datetime] = None
    billing_month: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    planned_amount: Optional[float] = None
    transaction_id: Optional[str] = None
    source: Optional[str] = None  # 'auto' = auto-matched, None = manual

class Payment(PaymentBase):
    id: int
    obligation_id: str
    class Config:
        from_attributes = True

# --- Obligation Schemas ---
class ObligationBase(BaseModel):
    name: str
    amount: Optional[float] = None
    due_day: int
    category: Optional[str] = None
    provider: Optional[str] = None
    notes: Optional[str] = None
    status: str = "ACTIVE"
    target_account_id: Optional[str] = None  # Envelope account for salary distribution

class ObligationCreate(ObligationBase):
    pass

class ObligationUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    due_day: Optional[int] = None
    category: Optional[str] = None
    provider: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    display_order: Optional[int] = None
    target_account_id: Optional[str] = None  # Envelope account for salary distribution

class Obligation(ObligationBase):
    id: str
    display_order: int
    target_account_name: Optional[str] = None  # Resolved account name for display
    payments: List[Payment] = []
    
    class Config:
        from_attributes = True

# --- Account Schemas ---
class AccountBase(BaseModel):
    name: str
    account_type: str
    last_4_digits: Optional[str] = None
    current_balance: float = 0.0
    credit_limit: Optional[float] = None
    bank_name: Optional[str] = None
    bank_logo_url: Optional[str] = None
    notes: Optional[str] = None
    is_income: bool = False

class AccountCreate(AccountBase):
    pass

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[str] = None
    last_4_digits: Optional[str] = None
    current_balance: Optional[float] = None
    credit_limit: Optional[float] = None
    bank_name: Optional[str] = None
    notes: Optional[str] = None
    is_income: Optional[bool] = None

class Account(AccountBase):
    id: str
    is_income: bool = False
    aliases: List[AccountAlias] = []
    wallets: List[CurrencyWallet] = []

    class Config:
        from_attributes = True

class RawMessage(BaseModel):
    id: str
    sender: Optional[str]
    body: str
    timestamp: datetime
    status: str
    error_log: Optional[str]

    class Config:
        from_attributes = True

# Schema for direct SMS ingest from iPhone
class SMSIngest(BaseModel):
    sender: str
    body: str

class CategoryBase(BaseModel):
    name: str
    type: Optional[str] = "BOTH"  # OBLIGATION | TRANSACTION | BOTH (matches model default)

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None

class Category(CategoryBase):
    id: str

    class Config:
        from_attributes = True

class SavingsGoalBase(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0.0
    target_date: Optional[date] = None
    icon: Optional[str] = None
    color: Optional[str] = None

class SavingsGoalCreate(SavingsGoalBase):
    pass

class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: Optional[float] = None
    target_date: Optional[date] = None
    icon: Optional[str] = None
    color: Optional[str] = None

class SavingsGoal(SavingsGoalBase):
    id: str
    
    class Config:
        from_attributes = True

class LoanBase(BaseModel):
    name: str
    principal_amount: float
    interest_rate: float
    start_date: date
    term_months: int
    notes: Optional[str] = None
    monthly_payment: Optional[float] = None
    due_day: Optional[int] = None

class LoanCreate(LoanBase):
    pass

class LoanUpdate(BaseModel):
    name: Optional[str] = None
    principal_amount: Optional[float] = None
    interest_rate: Optional[float] = None
    start_date: Optional[date] = None
    term_months: Optional[int] = None
    remaining_balance: Optional[float] = None
    notes: Optional[str] = None
    monthly_payment: Optional[float] = None
    due_day: Optional[int] = None
    display_order: Optional[int] = None

class Loan(LoanBase):
    id: str
    remaining_balance: float
    display_order: int

    class Config:
        from_attributes = True

# --- Allocation Rules Schemas ---
class AllocationRuleBase(BaseModel):
    rule_type: str  # 'CATEGORY' or 'LOAN'
    identifier: str  # Category name or Loan name
    target_account_id: str  # Target envelope account ID

class AllocationRuleCreate(AllocationRuleBase):
    pass

class AllocationRule(AllocationRuleBase):
    id: str

    class Config:
        from_attributes = True

# --- Allocation Preview Schemas ---
class AllocationItem(BaseModel):
    obligation_id: str  # The obligation this allocation is for
    obligation_name: str  # Display name
    category: Optional[str] = None  # Obligation category
    provider: Optional[str] = None  # Obligation provider
    target_account_id: str
    target_account_name: str
    amount: float  # Required amount for this obligation
    already_transferred: float = 0.0  # Amount already distributed this month
    pending_amount: float = 0.0  # Remaining to distribute
    status: str = "pending"  # 'pending', 'transferred', 'partial'
    due_day: Optional[int] = None

class AllocationPreviewResponse(BaseModel):
    billing_month: str  # "2026-03"
    total_required: float
    total_transferred: float  # Already distributed this month
    total_pending: float  # Still needs distribution
    allocations: List[AllocationItem]
    unassigned_items: List[str] = []  # Obligation names with no target account

class AllocationExecuteRequest(BaseModel):
    source_account_id: str
    month_offset: int = 0
    obligation_ids: Optional[List[str]] = None  # Specific obligations, or all if None
    override_amounts: Optional[dict] = None  # {obligation_id: amount} overrides

class AllocationReverseRequest(BaseModel):
    source_account_id: str
    month_offset: int = 0
    obligation_ids: List[str]  # Which obligations to reverse


# --- Audit Schemas ---
class AuditCheckRequest(BaseModel):
    account_id: str
    actual_balance: float

class AuditCheckResponse(BaseModel):
    is_match: bool
    system_balance: float
    actual_balance: float
    discrepancy: float  # actual - system
    last_audit_date: Optional[datetime] = None
    transactions_since_audit: List['Transaction'] = []

class AuditConfirmRequest(BaseModel):
    account_id: str
    actual_balance: float
    notes: Optional[str] = None
    force_confirm: bool = False

class AuditBase(BaseModel):
    account_id: str
    audit_date: datetime
    system_balance: float
    actual_balance: float
    difference: float
    status: str  # "MATCH" or "MISMATCH"
    notes: Optional[str] = None

class Audit(AuditBase):
    id: str

    class Config:
        from_attributes = True

# --- Distribution Schemas ---
class DistributionBase(BaseModel):
    source_account_id: str
    target_account_id: str
    obligation_id: Optional[str] = None  # Which obligation this transfer is for
    amount: float
    billing_month: str
    note: Optional[str] = None
    transaction_id: Optional[str] = None

class DistributionCreate(DistributionBase):
    pass

class DistributionUpdate(BaseModel):
    amount: Optional[float] = None
    note: Optional[str] = None
    transaction_id: Optional[str] = None

class Distribution(DistributionBase):
    id: str
    created_at: datetime
    source_account_name: Optional[str] = None
    target_account_name: Optional[str] = None
    obligation_name: Optional[str] = None  # Display name of the obligation
    linked_transaction: Optional[Transaction] = None
    linked_transactions: List[Transaction] = []
    linked_transactions_count: int = 0

    class Config:
        from_attributes = True


# --- Transaction Linking Schemas ---
class LinkTransactionsRequest(BaseModel):
    """Request to link multiple transactions to a payment or distribution"""
    transaction_ids: List[str]
    link_source: Optional[str] = None  # 'auto' = auto-linked, None = manual


class TransactionSearchParams(BaseModel):
    """Search parameters for transaction search endpoint"""
    query: Optional[str] = None  # Search in merchant/notes
    account_id: Optional[str] = None
    category: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    type: Optional[str] = None  # credit/debit
    limit: int = 50


class TransactionWithLinkInfo(Transaction):
    """Transaction with additional linking info"""
    linked_to_payment_id: Optional[int] = None
    linked_to_distribution_id: Optional[str] = None


# --- Statement Schemas (PDF Import) ---
class StatementResponse(BaseModel):
    id: str
    bank_name: Optional[str] = None
    original_filename: Optional[str] = None
    account_id: Optional[str] = None
    account_number: Optional[str] = None
    statement_period_start: Optional[date] = None
    statement_period_end: Optional[date] = None
    opening_balance: Optional[float] = None
    closing_balance: Optional[float] = None
    transaction_count: int = 0
    reconciliation_status: str = "pending"
    reconciliation_errors: Optional[str] = None
    status: str = "draft"
    pdf_type: Optional[str] = None
    imported_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class StatementListResponse(BaseModel):
    id: str
    bank_name: Optional[str] = None
    original_filename: Optional[str] = None
    account_number: Optional[str] = None
    statement_period_start: Optional[date] = None
    statement_period_end: Optional[date] = None
    transaction_count: int = 0
    reconciliation_status: str = "pending"
    status: str = "draft"
    pdf_type: Optional[str] = None
    imported_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class StatementUpdate(BaseModel):
    bank_name: Optional[str] = None
    account_id: Optional[str] = None
    status: Optional[str] = None
    reconciliation_status: Optional[str] = None


# --- SMS name-enrichment ---
class EnrichItem(BaseModel):
    transaction_id: str
    new_merchant: str
    raw_sms: Optional[str] = None   # source SMS body, for storing its reference fields in notes

class EnrichApplyRequest(BaseModel):
    items: List[EnrichItem]

