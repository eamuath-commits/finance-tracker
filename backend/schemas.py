from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from models import AccountType, TransactionType

class AccountBase(BaseModel):
    name: str
    account_type: AccountType
    last_4_digits: str
    current_balance: float
    credit_limit: Optional[float] = None
    interest_rate: Optional[float] = None
    minimum_payment: Optional[float] = None
    bank_name: Optional[str] = None
    bank_logo_url: Optional[str] = None
    is_income: Optional[bool] = False

class AccountCreate(AccountBase):
    pass

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[AccountType] = None
    last_4_digits: Optional[str] = None
    current_balance: Optional[float] = None
    credit_limit: Optional[float] = None
    interest_rate: Optional[float] = None
    minimum_payment: Optional[float] = None
    bank_name: Optional[str] = None
    bank_logo_url: Optional[str] = None
    is_income: Optional[bool] = None

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

class Account(AccountBase):
    id: str
    aliases: List[AccountAlias] = []
    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    amount: float
    merchant: str
    category: Optional[str] = None
    # Changed from TransactionType to str to avoid Pydantic casting it back to Enum object which fails in DB
    type: Optional[str] = "debit"
    raw_sms_content: Optional[str] = None
    timestamp: Optional[datetime] = None
    status: Optional[str] = "completed"
    logo_url: Optional[str] = None

class TransactionCreate(TransactionBase):
    account_id: Optional[str] = None
    # ...

class TransactionUpdate(BaseModel):
    account_id: Optional[str] = None
    amount: Optional[float] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    timestamp: Optional[datetime] = None
    logo_url: Optional[str] = None


class Transaction(TransactionBase):
    id: str
    account_id: str
    timestamp: datetime
    balance_after_transaction: Optional[float] = None
    logo_url: Optional[str] = None
    class Config:
        from_attributes = True

class LoanBase(BaseModel):
    name: str
    principal_amount: float
    interest_rate: float
    start_date: datetime
    term_months: int
    monthly_payment: Optional[float] = None
    due_day: Optional[int] = None

class LoanCreate(LoanBase):
    pass

class LoanUpdate(BaseModel):
    name: Optional[str] = None
    principal_amount: Optional[float] = None
    interest_rate: Optional[float] = None
    start_date: Optional[datetime] = None
    term_months: Optional[int] = None
    remaining_balance: Optional[float] = None
    monthly_payment: Optional[float] = None
    due_day: Optional[int] = None

class Loan(LoanBase):
    id: str
    remaining_balance: float
    monthly_payment: Optional[float] = None
    due_day: Optional[int] = None
    display_order: int = 0
    class Config:
        from_attributes = True

class ObligationBase(BaseModel):
    name: str
    due_day: int
    category: str = "Other"

class ObligationCreate(ObligationBase):
    pass

class ObligationUpdate(ObligationBase):
    name: Optional[str] = None
    due_day: Optional[int] = None
    category: Optional[str] = None

class Obligation(ObligationBase):
    id: str
    class Config:
        from_attributes = True

class SMSPayload(BaseModel):
    body: str
    sender: str
    timestamp: Optional[datetime] = None

class PaymentBase(BaseModel):
    payment_date: datetime
    billing_month: Optional[datetime] = None
    amount: float
    note: Optional[str] = None
    status: str = "PAID" # "PAID" or "BUDGET"

class PaymentCreate(PaymentBase):
    pass

class PaymentUpdate(BaseModel):
    payment_date: Optional[datetime] = None
    billing_month: Optional[datetime] = None
    amount: Optional[float] = None
    note: Optional[str] = None
    status: Optional[str] = None

class Payment(PaymentBase):
    obligation_id: str
    class Config:
        from_attributes = True

class ReorderSchema(BaseModel):
    ordered_ids: List[str]

class RawMessageBase(BaseModel):
    sender: Optional[str] = None
    body: str
    status: str
    error_log: Optional[str] = None
    timestamp: datetime

class RawMessage(RawMessageBase):
    id: str
    class Config:
        from_attributes = True

class SavingsGoalBase(BaseModel):
    name: str
    target_amount: float
    current_amount: Optional[float] = 0.0
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

class AllocationRuleBase(BaseModel):
    rule_type: str # "CATEGORY" or "LOAN"
    identifier: str
    target_account_id: str

class AllocationRuleCreate(AllocationRuleBase):
    pass

class AllocationRule(AllocationRuleBase):
    id: str
    class Config:
        from_attributes = True

class AllocationPreviewItem(BaseModel):
    rule_type: str
    identifier: str
    name: str 
    amount: float
    required_amount: float = 0.0
    target_account_id: str
    target_account_name: str

class AllocationPreviewResponse(BaseModel):
    total_amount: float
    total_required: float = 0.0
    surplus: float = 0.0
    allocations: List[AllocationPreviewItem]
    skipped_items: List[str] = []
    fulfilled_items: List[str] = []

class AllocationExecuteRequest(BaseModel):
    source_account_id: str
    month_offset: Optional[int] = 0
    target_account_id: Optional[str] = None
    override_amount: Optional[float] = None

class CategoryBase(BaseModel):
    name: str

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: str
    class Config:
        from_attributes = True


class CategoryUpdate(BaseModel):
    name: str

class BulkDeleteRequest(BaseModel):
    ids: List[str]
