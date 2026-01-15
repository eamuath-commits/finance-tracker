from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from models import AccountType

class AccountBase(BaseModel):
    name: str
    account_type: AccountType
    last_4_digits: str
    current_balance: float
    credit_limit: Optional[float] = None

class AccountCreate(AccountBase):
    pass

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[AccountType] = None
    last_4_digits: Optional[str] = None
    current_balance: Optional[float] = None
    credit_limit: Optional[float] = None

class Account(AccountBase):
    id: str
    class Config:
        orm_mode = True

class TransactionBase(BaseModel):
    amount: float
    merchant: str
    category: Optional[str] = None
    raw_sms_content: Optional[str] = None

class TransactionCreate(TransactionBase):
    account_id: str # Needs to be linked manually if not via SMS
    # For SMS parsing, we might not have account_id immediately

class TransactionUpdate(BaseModel):
    account_id: Optional[str] = None
    amount: Optional[float] = None
    merchant: Optional[str] = None
    category: Optional[str] = None
    timestamp: Optional[datetime] = None


class Transaction(TransactionBase):
    id: str
    account_id: str
    timestamp: datetime
    class Config:
        orm_mode = True

class LoanBase(BaseModel):
    name: str
    principal_amount: float
    interest_rate: float
    start_date: datetime
    term_months: int

class LoanCreate(LoanBase):
    pass

class LoanUpdate(BaseModel):
    name: Optional[str] = None
    principal_amount: Optional[float] = None
    interest_rate: Optional[float] = None
    start_date: Optional[datetime] = None
    term_months: Optional[int] = None
    remaining_balance: Optional[float] = None

class Loan(LoanBase):
    id: str
    remaining_balance: float
    class Config:
        orm_mode = True

class ObligationBase(BaseModel):
    name: str
    amount: Optional[float] = None
    due_day: int
    category: Optional[str] = None

class ObligationCreate(ObligationBase):
    pass

class ObligationUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    due_day: Optional[int] = None
    category: Optional[str] = None

class Obligation(ObligationBase):
    id: str
    class Config:
        orm_mode = True

class SMSPayload(BaseModel):
    body: str
    sender: str
    timestamp: Optional[datetime] = None

class PaymentBase(BaseModel):
    payment_date: datetime
    billing_month: Optional[datetime] = None
    amount: float
    note: Optional[str] = None
    status: str = "PAID" # "PAID" or "PENDING"

class PaymentCreate(PaymentBase):
    pass

class PaymentUpdate(BaseModel):
    payment_date: Optional[datetime] = None
    billing_month: Optional[datetime] = None
    amount: Optional[float] = None
    note: Optional[str] = None
    status: Optional[str] = None

class Payment(PaymentBase):
    id: int
    obligation_id: str
    class Config:
        orm_mode = True
