from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from models import AccountType

class AccountBase(BaseModel):
    name: str
    account_type: AccountType
    last_4_digits: str
    current_balance: float

class AccountCreate(AccountBase):
    pass

class Account(AccountBase):
    id: str
    class Config:
        orm_mode = True

class TransactionBase(BaseModel):
    amount: float
    merchant: str
    raw_sms_content: Optional[str] = None

class TransactionCreate(TransactionBase):
    account_id: str # Needs to be linked manually if not via SMS
    # For SMS parsing, we might not have account_id immediately

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

class Loan(LoanBase):
    id: str
    remaining_balance: float
    class Config:
        orm_mode = True

class SMSPayload(BaseModel):
    body: str
    sender: str
    timestamp: Optional[datetime] = None
