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
        orm_mode = True

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
        orm_mode = True

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
    account_id: str
    raw_sms_content: Optional[str] = None
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
    account_id: str
    timestamp: datetime
    balance_after_transaction: Optional[float] = None

    class Config:
        orm_mode = True

class BulkDeleteRequest(BaseModel):
    ids: List[str]

class BulkDeleteObligationsRequest(BaseModel):
    ids: List[str]

# --- Payment Schemas ---
class PaymentBase(BaseModel):
    amount: float
    planned_amount: Optional[float] = None
    payment_date: date
    billing_month: str
    note: Optional[str] = None
    status: str = "PAID"

class PaymentCreate(PaymentBase):
    transaction_id: Optional[str] = None

class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    payment_date: Optional[date] = None
    billing_month: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    transaction_id: Optional[str] = None

class Payment(PaymentBase):
    id: int
    obligation_id: str
    transaction_id: Optional[str] = None
    transaction: Optional[Transaction] = None

    class Config:
        orm_mode = True

class ObligationBase(BaseModel):
    name: str
    amount: Optional[float] = None
    due_day: int
    category: Optional[str] = None
    provider: Optional[str] = None
    notes: Optional[str] = None
    display_order: int = 0

class ObligationCreate(ObligationBase):
    pass

class ObligationUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    due_day: Optional[int] = None
    category: Optional[str] = None
    provider: Optional[str] = None
    notes: Optional[str] = None
    display_order: Optional[int] = None

class MonthlyObligation(ObligationBase):
    id: str
    payments: List[Payment] = []

    class Config:
        orm_mode = True

class AccountBase(BaseModel):
    name: str
    account_type: str
    last_4_digits: Optional[str] = None
    current_balance: float = 0.0
    credit_limit: Optional[float] = None
    bank_name: Optional[str] = None
    bank_logo_url: Optional[str] = None
    notes: Optional[str] = None

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

class Account(AccountBase):
    id: str
    aliases: List[AccountAlias] = []
    wallets: List[CurrencyWallet] = []

    class Config:
        orm_mode = True

class RawMessage(BaseModel):
    id: str
    sender: Optional[str]
    body: str
    timestamp: datetime
    status: str
    error_log: Optional[str]

    class Config:
        orm_mode = True

class CategoryBase(BaseModel):
    name: str
    type: str

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: str

    class Config:
        orm_mode = True

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
        orm_mode = True

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
        orm_mode = True

# --- Allocation Rules Schemas ---
class AllocationRuleBase(BaseModel):
    keyword: str
    field: str = "merchant"
    percentage: float
    category_group: str

class AllocationRuleCreate(AllocationRuleBase):
    pass

class AllocationRule(AllocationRuleBase):
    id: str

    class Config:
        orm_mode = True

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
        orm_mode = True
