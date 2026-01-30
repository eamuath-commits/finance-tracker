from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
import enum

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

class TransactionUpdate(BaseModel):
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

class Transaction(TransactionBase):
    id: str
    account_id: Optional[str] = None
    credit_card_id: Optional[str] = None  # NEW
    timestamp: datetime
    balance_after_transaction: Optional[float] = None
    raw_sms_content: Optional[str] = None  # Include raw SMS in response
    parsed_data: Optional[str] = None  # JSON string of all AI-extracted fields

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

class Obligation(ObligationBase):
    id: str
    display_order: int
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
    type: str

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

class AllocationHistoryBase(BaseModel):
    month: str
    income: float
    needs_planned: float
    needs_actual: float
    wants_planned: float
    wants_actual: float
    savings_planned: float
    savings_actual: float

class AllocationHistory(AllocationHistoryBase):
    id: str

    class Config:
        from_attributes = True
        
# --- Allocation Preview Schemas ---
class AllocationItem(BaseModel):
    identifier: str  # Category name or Loan name
    name: str  # Display name
    rule_type: str  # 'CATEGORY' or 'LOAN'
    target_account_id: str
    target_account_name: str
    amount: float  # Calculated amount based on obligations
    required_amount: Optional[float] = None  # Full required if source is short
    status: str = "pending"  # 'pending', 'allocated', 'no_history'

class AllocationPreviewResponse(BaseModel):
    total_required: float
    total_amount: float  # What can actually be transferred (min of required, source)
    allocations: List[AllocationItem]
    fulfilled_items: List[str] = []  # Items already covered by existing balance
    skipped_items: List[str] = []  # Items with no rule matched

class AllocationExecuteRequest(BaseModel):
    source_account_id: str
    month_offset: int = 0
    target_account_id: Optional[str] = None  # Specific target, or all if None
    override_amount: Optional[float] = None  # Override transfer amount


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
    linked_transaction: Optional[Transaction] = None
    linked_transactions: List[Transaction] = []
    linked_transactions_count: int = 0

    class Config:
        from_attributes = True


# --- Transaction Linking Schemas ---
class LinkTransactionsRequest(BaseModel):
    """Request to link multiple transactions to a payment or distribution"""
    transaction_ids: List[str]


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
