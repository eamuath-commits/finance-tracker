from sqlalchemy.orm import Session
from sqlalchemy import func
import models
import schemas
from typing import List, Optional
from datetime import datetime, timedelta
import re

def get_account_by_last_4(db: Session, last_4: str):
    # 1. Try matching main account last_4
    account = db.query(models.Account).filter(models.Account.last_4_digits == last_4).first()
    if account:
        return account
    
    # 2. Try matching aliases
    alias = db.query(models.AccountAlias).filter(models.AccountAlias.last_4_digits == last_4).first()
    if alias:
        return alias.account
        
    return None

# --- Credit Card CRUD ---
def get_credit_card_by_last4(db: Session, last_4: str):
    """Find a credit card by last 4 digits"""
    return db.query(models.CreditCard).filter(models.CreditCard.last_4_digits == last_4).first()

def get_credit_cards(db: Session, skip: int = 0, limit: int = 100):
    """Get all credit cards"""
    return db.query(models.CreditCard).offset(skip).limit(limit).all()

def get_credit_card(db: Session, card_id: str):
    """Get a single credit card by ID"""
    return db.query(models.CreditCard).filter(models.CreditCard.id == card_id).first()

def create_credit_card(db: Session, card: schemas.CreditCardCreate):
    """Create a new credit card"""
    import uuid
    db_card = models.CreditCard(
        id=str(uuid.uuid4()),
        name=card.name,
        bank_name=card.bank_name,
        last_4_digits=card.last_4_digits,
        credit_limit=card.credit_limit,
        statement_day=card.statement_day,
        due_day=card.due_day,
        apr=card.apr,
        minimum_payment_percent=card.minimum_payment_percent,
        notes=card.notes,
        current_balance=0.0
    )
    db.add(db_card)
    db.commit()
    db.refresh(db_card)
    return db_card

def update_credit_card(db: Session, card_id: str, card_update: schemas.CreditCardUpdate):
    """Update a credit card"""
    db_card = db.query(models.CreditCard).filter(models.CreditCard.id == card_id).first()
    if not db_card:
        return None
    
    update_data = card_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_card, field, value)
    
    db.commit()
    db.refresh(db_card)
    return db_card

def delete_credit_card(db: Session, card_id: str):
    """Delete a credit card"""
    db_card = db.query(models.CreditCard).filter(models.CreditCard.id == card_id).first()
    if not db_card:
        return False
    db.delete(db_card)
    db.commit()
    return True

def get_account_by_name(db: Session, name: str):
    # Try case-insensitive matching if possible, otherwise exact
    return db.query(models.Account).filter(models.Account.name == name).first()

def get_account(db: Session, account_id: str):
    return db.query(models.Account).filter(models.Account.id == account_id).first()

def create_account(db: Session, account: schemas.AccountCreate):
    # Convert account_type string to enum
    account_type_enum = account.account_type
    if isinstance(account.account_type, str):
        type_mapping = {
            'Checking': models.AccountType.CHECKING,
            'Savings': models.AccountType.SAVINGS,
            'Credit Card': models.AccountType.CREDIT_CARD,
            'Loan': models.AccountType.LOAN,
            'CHECKING': models.AccountType.CHECKING,
            'SAVINGS': models.AccountType.SAVINGS,
            'CREDIT_CARD': models.AccountType.CREDIT_CARD,
            'LOAN': models.AccountType.LOAN,
        }
        account_type_enum = type_mapping.get(account.account_type, models.AccountType.CHECKING)
    
    db_account = models.Account(
        name=account.name,
        account_type=account_type_enum,
        last_4_digits=account.last_4_digits,
        current_balance=account.current_balance,
        credit_limit=account.credit_limit
    )
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

def create_account_alias(db: Session, account_id: str, alias: schemas.AccountAliasCreate):
    db_alias = models.AccountAlias(
        account_id=account_id,
        alias_name=alias.alias_name,
        last_4_digits=alias.last_4_digits
    )
    db.add(db_alias)
    db.commit()
    db.refresh(db_alias)
    return db_alias

def delete_account(db: Session, account_id: str):
    db_account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if db_account:
        db.delete(db_account)
        db.commit()
    return db_account

def delete_account_alias(db: Session, alias_id: int):
    db_alias = db.query(models.AccountAlias).filter(models.AccountAlias.id == alias_id).first()
    if db_alias:
        db.delete(db_alias)
        db.commit()
    return db_alias

def get_accounts(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Account).offset(skip).limit(limit).all()

def update_account(db: Session, account_id: str, account_update: schemas.AccountUpdate):
    db_account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not db_account:
        return None
    
    update_data = account_update.dict(exclude_unset=True)
    
    # Convert account_type string to enum if present
    if 'account_type' in update_data and update_data['account_type']:
        type_str = update_data['account_type']
        # Map display values to enum members
        type_mapping = {
            'Checking': models.AccountType.CHECKING,
            'Savings': models.AccountType.SAVINGS,
            'Credit Card': models.AccountType.CREDIT_CARD,
            'Loan': models.AccountType.LOAN,
            # Also accept uppercase enum names
            'CHECKING': models.AccountType.CHECKING,
            'SAVINGS': models.AccountType.SAVINGS,
            'CREDIT_CARD': models.AccountType.CREDIT_CARD,
            'LOAN': models.AccountType.LOAN,
        }
        if type_str in type_mapping:
            update_data['account_type'] = type_mapping[type_str]
    
    for key, value in update_data.items():
        setattr(db_account, key, value)
    
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

def find_potential_duplicate(db: Session, account_id: str, amount: float, tx_type: str, timestamp: datetime):
    # Window: +/- 24 hours to account for SMS delays or date parsing ambiguities (YY/MM/DD vs DD/MM/YY)
    window_min = timestamp - timedelta(hours=24)
    window_max = timestamp + timedelta(hours=24)
    
    # DEBUG: Log what we are looking for
    # print(f"DEBUG: Searching for Duplicate: Acc={account_id}, Amt={amount}, Type={tx_type}, Time={timestamp} (Window: {window_min} - {window_max})")

    potential = db.query(models.Transaction).filter(
        models.Transaction.account_id == account_id,
        models.Transaction.amount == amount, # Exact match expected for same-currency transfers
        models.Transaction.type == tx_type,
        models.Transaction.timestamp >= window_min,
        models.Transaction.timestamp <= window_max
    ).first()

    if potential:
        print(f"DEBUG: Found Duplicate/Match: {potential.id} (Date: {potential.timestamp})")
    
    return potential

def create_transaction(db: Session, transaction: schemas.TransactionCreate):
    # Update Account Balance FIRST so we can record it
    account = None
    credit_card = None
    new_balance = 0.0
    
    if transaction.account_id:
        account = db.query(models.Account).filter(models.Account.id == transaction.account_id).first()
    
    if transaction.credit_card_id:
        credit_card = db.query(models.CreditCard).filter(models.CreditCard.id == transaction.credit_card_id).first()
    
    # Handle Account Balance Update
    # Note: pending_transfer also affects balance (debit happened, waiting for credit confirmation)
    if account and transaction.status in ["completed", "pending_transfer"]:
        try:
             is_credit = transaction.type == "credit" or transaction.type == models.TransactionType.CREDIT
        except:
             is_credit = str(transaction.type).lower() == "credit"

        if is_credit:
             account.current_balance += transaction.amount
        else:
             account.current_balance -= transaction.amount
        
        if transaction.fees:
            account.current_balance -= transaction.fees
        
        new_balance = account.current_balance
        db.add(account)

        # Handle Multi-Currency Wallet
        if transaction.original_currency and transaction.original_currency.upper() != "SAR":
            curr = transaction.original_currency.upper()
            wallet = db.query(models.CurrencyWallet).filter(
                models.CurrencyWallet.account_id == account.id,
                models.CurrencyWallet.currency_code == curr
            ).first()
            if not wallet:
                import uuid
                wallet = models.CurrencyWallet(
                    id=str(uuid.uuid4()),
                    account_id=account.id,
                    currency_code=curr,
                    balance=0.0
                )
                db.add(wallet)
            
            if is_credit:
                wallet.balance += (transaction.original_amount or 0.0)
            else:
                wallet.balance -= (transaction.original_amount or 0.0)
            wallet.last_updated = datetime.utcnow()
            db.add(wallet)
    
    # Handle Credit Card Balance Update
    elif credit_card and transaction.status == "completed":
        try:
             is_credit = transaction.type == "credit" or transaction.type == models.TransactionType.CREDIT
        except:
             is_credit = str(transaction.type).lower() == "credit"
        
        # For credit cards: Credit = payment (reduces balance), Debit = purchase (increases balance)
        if is_credit:
            credit_card.current_balance -= transaction.amount  # Payment reduces debt
        else:
            credit_card.current_balance += transaction.amount  # Purchase increases debt
        
        if transaction.fees:
            credit_card.current_balance += transaction.fees
        
        new_balance = credit_card.current_balance
        db.add(credit_card)

    db_transaction = models.Transaction(
        account_id=transaction.account_id,
        credit_card_id=transaction.credit_card_id,  # NEW: Support credit card
        amount=transaction.amount,
        merchant=transaction.merchant,
        raw_sms_content=transaction.raw_sms_content,
        parsed_data=transaction.parsed_data,
        timestamp=transaction.timestamp,
        category=transaction.category,
        type=transaction.type,
        balance_after_transaction=new_balance if (account or credit_card) and transaction.status in ["completed", "pending_transfer"] else None,
        status=transaction.status,
        fees=transaction.fees,
        original_amount=transaction.original_amount,
        original_currency=transaction.original_currency,
        exchange_rate=transaction.exchange_rate
    )
    db.add(db_transaction)

    db.commit()
    db.refresh(db_transaction)
    return db_transaction

def get_transaction(db: Session, transaction_id: str):
    return db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()

def find_pending_transfer(db: Session, source_last4: str, dest_last4: str, amount: float):
    """
    Find a pending transfer that matches the source account, destination account, and amount.
    Used to link cross-bank transfers (Debit from Bank A → Credit to Bank B).
    """
    if not source_last4 or not dest_last4:
        return None
    
    # Find pending_transfer transactions with matching criteria
    # We need to search in parsed_data JSON for account info
    pending_txs = db.query(models.Transaction).filter(
        models.Transaction.status == "pending_transfer",
        models.Transaction.amount == amount,
        models.Transaction.type == "debit"
    ).all()
    
    import json
    for tx in pending_txs:
        if tx.parsed_data:
            try:
                parsed = json.loads(tx.parsed_data)
                tx_source = parsed.get('source_account_last4')
                tx_dest = parsed.get('destination_account_last4')
                
                # Match: Debit's source = Credit's source, Debit's dest = Credit's dest
                if str(tx_source) == str(source_last4) and str(tx_dest) == str(dest_last4):
                    return tx
            except:
                continue
    
    return None

def confirm_pending_transfer(db: Session, transaction_id: str):
    """Mark a pending transfer as confirmed after the credit SMS arrives"""
    tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if tx and tx.status == "pending_transfer":
        tx.status = "confirmed"
        db.commit()
        db.refresh(tx)
    return tx


def confirm_transaction(db: Session, transaction_id: str):
    tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not tx or tx.status == "completed":
        return tx
    
    tx.status = "completed"
    
    # Update Balance
    account = db.query(models.Account).filter(models.Account.id == tx.account_id).first()
    if account:
        if tx.type == "credit":
             account.current_balance += tx.amount
        else:
             # DEBIT
             account.current_balance -= tx.amount
        
        # Update balance snapshot on the transaction too? 
        # Usually snapshots are taken at creation. If we confirm later, the 'balance_after' is tricky.
        # But 'current_balance' is the source of truth.
        tx.balance_after_transaction = account.current_balance
        db.add(account)

        # Update Wallet if multi-currency
        if tx.original_currency and tx.original_currency.upper() != "SAR":
            curr = tx.original_currency.upper()
            wallet = db.query(models.CurrencyWallet).filter(
                models.CurrencyWallet.account_id == account.id,
                models.CurrencyWallet.currency_code == curr
            ).first()
            if not wallet:
                import uuid
                wallet = models.CurrencyWallet(
                    id=str(uuid.uuid4()),
                    account_id=account.id,
                    currency_code=curr,
                    balance=0.0
                )
                db.add(wallet)
            
            is_credit = str(tx.type).lower() == "credit"
            if is_credit:
                wallet.balance += (tx.original_amount or 0.0)
            else:
                wallet.balance -= (tx.original_amount or 0.0)
            wallet.last_updated = datetime.utcnow()
            db.add(wallet)
    
    db.commit()
    db.refresh(tx)
    return tx

def assign_account_to_transaction(db: Session, transaction_id: str, account_id: str):
    tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    
    if not tx or not account:
        raise ValueError("Transaction or Account not found")
        
    tx.account_id = account_id
    
    # If transaction should be completed now, update balance
    if tx.status == "pending_action":
        tx.status = "completed"
        
        is_credit = str(tx.type).lower() == "credit"
        if is_credit:
            account.current_balance += tx.amount
        else:
            account.current_balance -= tx.amount
            
        tx.balance_after_transaction = account.current_balance
        db.add(account)
        
        # INTERNAL TRANSFER LOGIC (Delayed)
        # If this was a transfer, we need to create the Credit Leg now that we know the Source
        if tx.category == "Transfer" and tx.merchant.endswith(" Account"):
            potential_acc_name = tx.merchant.replace(" Account", "")
            print(f"DEBUG: Attempting to resolve transfer destination. Potential Name: '{potential_acc_name}'")
            
            # Case-insensitive lookup
            dest_acc = db.query(models.Account).filter(models.Account.name.ilike(potential_acc_name)).first()
            
            if dest_acc:
                print(f"DEBUG: Found destination account: {dest_acc.name} (ID: {dest_acc.id})")
            else:
                print(f"DEBUG: Destination account '{potential_acc_name}' NOT FOUND queries.")
            
            if dest_acc and dest_acc.id != account_id:
                # Check if bank names match for instant completion
                is_same_bank = (
                    account.bank_name and dest_acc.bank_name and 
                    account.bank_name.strip().lower() == dest_acc.bank_name.strip().lower()
                )
                
                # Check if we already have this credit leg (avoid duplicates)
                existing_credit = db.query(models.Transaction).filter(
                     models.Transaction.account_id == dest_acc.id,
                     models.Transaction.amount == tx.amount,
                     models.Transaction.type == "credit",
                     models.Transaction.timestamp == tx.timestamp
                ).first()
                
                if existing_credit:
                    # UPDATE EXISTING CREDIT LEG
                    print(f"DEBUG: Found existing credit leg. Updating merchant to '{account.name} Account'")
                    existing_credit.merchant = f"{account.name} Account"
                    db.add(existing_credit)
                else:
                    # Create Credit Leg (Fallback if not created earlier)
                    print(f"DEBUG: No existing credit leg found. Creating new one.")
                    credit_tx = models.Transaction(
                        account_id=dest_acc.id,
                        amount=tx.amount,
                        merchant=f"{account.name} Account", # From the now-known source
                        category="Transfer",
                        type="credit",
                        balance_after_transaction=dest_acc.current_balance + tx.amount if is_same_bank else None,
                        status="completed" if is_same_bank else "pending",
                        timestamp=tx.timestamp,
                        raw_sms_content=tx.raw_sms_content
                    )
                    
                    if is_same_bank:
                        dest_acc.current_balance += tx.amount
                        db.add(dest_acc)
                    
                    db.add(credit_tx)
        
    db.commit()
    db.refresh(tx)
    return tx

def create_loan(db: Session, loan: schemas.LoanCreate):
    # Initial remaining balance = principal
    db_loan = models.Loan(
        name=loan.name,
        principal_amount=loan.principal_amount,
        interest_rate=loan.interest_rate,
        start_date=loan.start_date,
        term_months=loan.term_months,
        remaining_balance=loan.principal_amount 
    )
    db.add(db_loan)
    db.commit()
    db.refresh(db_loan)
    return db_loan

def get_loans(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Loan).order_by(models.Loan.display_order.asc(), models.Loan.name.asc()).offset(skip).limit(limit).all()

def reorder_loans(db: Session, ordered_ids: list[str]):
    for index, loan_id in enumerate(ordered_ids):
        # We can optimize this by doing bulk updates if needed, but for <50 loans loop is fine
        db.query(models.Loan).filter(models.Loan.id == loan_id).update({"display_order": index})
    db.commit()

def update_loan(db: Session, loan_id: str, loan_update: schemas.LoanUpdate):
    db_loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not db_loan:
        return None
    
    update_data = loan_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_loan, key, value)
        
    db.add(db_loan)
    db.commit()
    db.refresh(db_loan)
    return db_loan

def delete_loan(db: Session, loan_id: str):
    db_loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if db_loan:
        db.delete(db_loan)
        db.commit()
    return db_loan

def get_obligation(db: Session, obligation_id: str):
    return db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()

def create_obligation(db: Session, obligation: schemas.ObligationCreate):
    db_obj = models.MonthlyObligation(
        name=obligation.name,
        due_day=obligation.due_day,
        category=obligation.category,
        provider=obligation.provider,
        notes=obligation.notes
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def get_obligations(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.MonthlyObligation).order_by(models.MonthlyObligation.display_order.asc(), models.MonthlyObligation.due_day.asc()).offset(skip).limit(limit).all()

def reorder_obligations(db: Session, ordered_ids: list[str]):
    for index, obj_id in enumerate(ordered_ids):
        db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obj_id).update({"display_order": index})
    db.commit()

def update_obligation(db: Session, obligation_id: str, obligation_update: schemas.ObligationUpdate):
    db_obj = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
    if not db_obj:
        return None
        
    update_data = obligation_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_obj, key, value)
        
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_obligation(db: Session, obligation_id: str):
    # Delete associated payments first to prevent Foreign Key errors
    db.query(models.Payment).filter(models.Payment.obligation_id == obligation_id).delete()
    
    db_obj = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
    if db_obj:
        db.delete(db_obj)
        db.commit()
    return db_obj

def get_transactions(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Transaction).order_by(models.Transaction.timestamp.desc()).offset(skip).limit(limit).all()

def update_transaction(db: Session, transaction_id: str, transaction_update: schemas.TransactionUpdate):
    db_tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not db_tx:
        return None
    
    # 1. Capture Old State for Balance Reversal
    old_amount = db_tx.amount
    old_type = db_tx.type
    old_account_id = db_tx.account_id
    old_status = db_tx.status
    old_fees = db_tx.fees if db_tx.fees else 0.0
    old_orig_amt = db_tx.original_amount
    old_orig_curr = db_tx.original_currency
    
    # 2. Apply Updates
    update_data = transaction_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_tx, key, value)
    
    # 3. Handle Balance Adjustment if critical fields changed
    # Only if transaction was/is completed
    if old_status == "completed" or db_tx.status == "completed":
        account = db.query(models.Account).filter(models.Account.id == db_tx.account_id).first()
        if account:
            # Revert Old Effect (if it was completed)
            if old_status == "completed":
                 is_old_credit = str(old_type).lower() == "credit" or old_type == models.TransactionType.CREDIT
                 if is_old_credit:
                     account.current_balance -= old_amount
                 else:
                     account.current_balance += old_amount
                 
                 # Revert old fee (add it back)
                 if old_fees:
                     account.current_balance += old_fees

                 # Revert Old Wallet Effect
                 if old_status == "completed" and old_orig_curr and old_orig_curr.upper() != "SAR":
                     wallet = db.query(models.CurrencyWallet).filter(
                         models.CurrencyWallet.account_id == old_account_id,
                         models.CurrencyWallet.currency_code == old_orig_curr.upper()
                     ).first()
                     if wallet:
                         is_old_credit = str(old_type).lower() == "credit"
                         if is_old_credit:
                             wallet.balance -= (old_orig_amt or 0.0)
                         else:
                             wallet.balance += (old_orig_amt or 0.0)
                         db.add(wallet)

            # Apply New Effect (if it is completed)
            if db_tx.status == "completed":
                 is_new_credit = str(db_tx.type).lower() == "credit" or db_tx.type == models.TransactionType.CREDIT
                 if is_new_credit:
                     account.current_balance += db_tx.amount
                 else:
                     account.current_balance -= db_tx.amount
                
                 # Deduct new fee
                 if db_tx.fees:
                     account.current_balance -= db_tx.fees

                 # Apply New Wallet Effect
                 if db_tx.status == "completed" and db_tx.original_currency and db_tx.original_currency.upper() != "SAR":
                    curr = db_tx.original_currency.upper()
                    wallet = db.query(models.CurrencyWallet).filter(
                        models.CurrencyWallet.account_id == db_tx.account_id,
                        models.CurrencyWallet.currency_code == curr
                    ).first()
                    if not wallet:
                        import uuid
                        wallet = models.CurrencyWallet(
                            id=str(uuid.uuid4()),
                            account_id=db_tx.account_id,
                            currency_code=curr,
                            balance=0.0
                        )
                    
                    if is_new_credit:
                        wallet.balance += (db_tx.original_amount or 0.0)
                    else:
                        wallet.balance -= (db_tx.original_amount or 0.0)
                    wallet.last_updated = datetime.utcnow()
                    db.add(wallet)
            
            # Save Account Balance
            db.add(account)
            # Update snapshot logic if needed, but risky to overwrite historical snapshot. 
            # Best effort: Update balance_after_transaction to current balance? 
            # Or leave it as the historical record. 
            # Let's update it to reflect the *corrected* state essentially.
            db_tx.balance_after_transaction = account.current_balance

    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    return db_tx

def delete_transaction(db: Session, transaction_id: str):
    db_tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if db_tx:
        # Revert balance change
        account = db_tx.account
        if account:
            if db_tx.type == models.TransactionType.CREDIT:
                # Original was ADD, so removal is SUBTRACT
                account.current_balance -= db_tx.amount
            else:
                # Original was SUBTRACT, so removal is ADD
                account.current_balance += db_tx.amount
            
            # Revert Wallet Balance
            if db_tx.original_currency and db_tx.original_currency.upper() != "SAR":
                curr = db_tx.original_currency.upper()
                wallet = db.query(models.CurrencyWallet).filter(
                    models.CurrencyWallet.account_id == account.id,
                    models.CurrencyWallet.currency_code == curr
                ).first()
                if wallet:
                    if db_tx.type == models.TransactionType.CREDIT or str(db_tx.type).lower() == "credit":
                        wallet.balance -= (db_tx.original_amount or 0.0)
                    else:
                        wallet.balance += (db_tx.original_amount or 0.0)
                    db.add(wallet)

            db.add(account)
        
        db.delete(db_tx)
        db.commit()
    return db_tx

def create_payment(db: Session, obligation_id: str, payment: schemas.PaymentCreate):
    # Check for duplicate billing_month
    if payment.billing_month:
        existing = db.query(models.Payment).filter(
            models.Payment.obligation_id == obligation_id,
            models.Payment.billing_month == payment.billing_month
        ).first()
        if existing:
            # Upsert Logic
            status_enum = models.PaymentStatus.PAID
            if payment.status:
                try:
                    status_enum = models.PaymentStatus(payment.status)
                except ValueError:
                    pass
            
            # SNAPSHOT LOGIC:
            # If transitioning from BUDGET/PENDING -> PAID, capture the current 'budget' as planned_amount
            # But wait, 'existing.amount' is the old value (budget). 
            # If we are "Top Up" (PAID -> PAID), we keep old planned_amount.
            
            if existing.status != models.PaymentStatus.PAID and status_enum == models.PaymentStatus.PAID:
                # Transitioning to PAID: Lock in the budget (existing.amount)
                # Unless planned_amount was already set for some reason
                if existing.planned_amount is None:
                    existing.planned_amount = existing.amount
            
            # If creating completely new logic or whatever, just ensure we don't lose it.
            # If it's a Top Up (PAID -> PAID), we just update 'amount'. planned_amount stays constant.

            existing.amount = payment.amount
            existing.payment_date = payment.payment_date
            existing.note = payment.note
            existing.status = status_enum
            existing.transaction_id = payment.transaction_id
            
            db.commit()
            db.refresh(existing)
            return existing

    # Convert status string to Enum
    status_enum = models.PaymentStatus.PAID
    if payment.status:
        try:
            status_enum = models.PaymentStatus(payment.status)
        except ValueError:
            pass # Default to PAID

    # New Payment Logic
    planned = None
    if payment.planned_amount:
        planned = payment.planned_amount
    else:
        # Default behavior for new entries:
        # If paying now, assume planned = actual (unless overwritten later)
        planned = payment.amount

    db_payment = models.Payment(
        obligation_id=obligation_id,
        amount=payment.amount,
        planned_amount=planned,
        payment_date=payment.payment_date,
        billing_month=payment.billing_month,
        note=payment.note,
        status=status_enum,
        transaction_id=payment.transaction_id
    )
    db.add(db_payment)
    
    # Auto-update the expected amount for next month based on this payment, 
    # BUT only if it is actually PAID.
    if status_enum == models.PaymentStatus.PAID:
        obligation = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
        if obligation:
            obligation.amount = payment.amount
            db.add(obligation)

    db.commit()
    db.refresh(db_payment)
    return db_payment

def delete_payment(db: Session, payment_id: int):
    db_payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if db_payment:
        db.delete(db_payment)
        db.commit()
    return db_payment

def update_payment(db: Session, payment_id: int, update_data: schemas.PaymentUpdate):
    db_payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not db_payment:
        return None
    
    if update_data.payment_date:
        db_payment.payment_date = update_data.payment_date
    if update_data.billing_month:
        db_payment.billing_month = update_data.billing_month
    if update_data.amount is not None:
        db_payment.amount = update_data.amount
    if update_data.note is not None:
        db_payment.note = update_data.note
    if update_data.status:
        try:
            db_payment.status = models.PaymentStatus(update_data.status)
        except ValueError:
            pass
            
    if update_data.transaction_id is not None:
        db_payment.transaction_id = update_data.transaction_id

        
    db.commit()
    db.refresh(db_payment)
    return db_payment

def update_payment_link(db: Session, payment_id: int, transaction_id: str):
    db_payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not db_payment:
        return None
    
    db_payment.transaction_id = transaction_id
    db.commit()
    db.refresh(db_payment)
    return db_payment

def get_payments(db: Session, obligation_id: str):
    return db.query(models.Payment).filter(models.Payment.obligation_id == obligation_id).order_by(models.Payment.payment_date.desc()).all()

def create_goal(db: Session, goal: schemas.SavingsGoalCreate):
    db_goal = models.SavingsGoal(
        name=goal.name,
        target_amount=goal.target_amount,
        current_amount=goal.current_amount,
        target_date=goal.target_date,
        icon=goal.icon,
        color=goal.color
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal

def get_goals(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.SavingsGoal).offset(skip).limit(limit).all()

def update_goal(db: Session, goal_id: str, goal_update: schemas.SavingsGoalUpdate):
    db_goal = db.query(models.SavingsGoal).filter(models.SavingsGoal.id == goal_id).first()
    if not db_goal:
        return None
    
    update_data = goal_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_goal, key, value)
        
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal

def delete_goal(db: Session, goal_id: str):
    db_goal = db.query(models.SavingsGoal).filter(models.SavingsGoal.id == goal_id).first()
    if db_goal:
        db.delete(db_goal)
        db.commit()
    return db_goal

def update_currency_wallet(db: Session, wallet_id: str, update_data: schemas.CurrencyWalletUpdate):
    db_wallet = db.query(models.CurrencyWallet).filter(models.CurrencyWallet.id == wallet_id).first()
    if not db_wallet:
        return None
    db_wallet.balance = update_data.balance
    db_wallet.last_updated = datetime.utcnow()
    db.commit()
    db.refresh(db_wallet)
    return db_wallet

# --- Allocation Rules ---

def create_allocation_rule(db: Session, rule: schemas.AllocationRuleCreate):
    db_rule = models.AllocationRule(**rule.dict())
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule

def get_allocation_rules(db: Session):
    return db.query(models.AllocationRule).all()

def delete_allocation_rule(db: Session, rule_id: str):
    db_rule = db.query(models.AllocationRule).filter(models.AllocationRule.id == rule_id).first()
    if db_rule:
        db.delete(db_rule)
        db.commit()
    return True

def delete_allocation_history_items(db: Session, ids: List[str]):
    try:
        db.query(models.AllocationHistory).filter(models.AllocationHistory.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"Error deleting allocation history: {e}")
        return False


def find_transaction_matches(
    db: Session,
    keyword: str,
    search_start: datetime,
    amount: Optional[float] = None,
    notes: List[str] = None,
    category: str = None,
    exclude_ids: List[str] = []
) -> List[models.Transaction]:
    
    # 1. Base Query: Debit transactions after search_start
    query = db.query(models.Transaction).filter(
        models.Transaction.timestamp >= search_start,
        models.Transaction.type == 'debit'
    )
    candidates = query.all()
    
    matches = []
    
    for tx in candidates:
        if tx.id in exclude_ids:
            continue
            
        match_score = 0
        txn_merchant = (tx.merchant or "").lower()
        txn_notes = (tx.notes or "").lower()
        keyword_lower = keyword.lower()
        
        # A. Name/Keyword Match
        if keyword_lower in txn_merchant or keyword_lower in txn_notes:
            match_score += 50
            
        # B. Notes/Alias Match
        if notes:
            for k in notes:
                k_lower = k.lower()
                # Determine if k is significant (len > 2) handled by caller usually, but check here
                if len(k_lower) > 2 and (k_lower in txn_merchant or k_lower in txn_notes):
                    match_score += 50
                    break 

        # C. Amount Match
        if amount and tx.amount:
            diff = abs(tx.amount - amount)
            # 10% tolerance
            if amount > 0 and diff / amount <= 0.1:
                match_score += 40
            # Exact match bonus
            if diff == 0:
                match_score += 20
        
        # D. Category Match
        if category and tx.category and category.lower() == tx.category.lower():
            match_score += 20
        
        if match_score >= 50:
            matches.append(tx)
            
    return matches

def get_categories(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Category).order_by(models.Category.name.asc()).offset(skip).limit(limit).all()

def create_category(db: Session, category: schemas.CategoryCreate):
    db_cat = models.Category(
        name=category.name,
        type=category.type
    )
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

def get_or_create_category(db: Session, category_name: str, category_type: str = "TRANSACTION"):
    """
    Get an existing category by name or create it if it doesn't exist.
    Used by SMS parsing to auto-record new categories.
    """
    if not category_name or category_name.strip() == "" or category_name.lower() == "uncategorized":
        return None
    
    # Check if category exists (case-insensitive)
    existing = db.query(models.Category).filter(
        func.lower(models.Category.name) == category_name.lower()
    ).first()
    
    if existing:
        return existing
    
    # Create new category
    db_cat = models.Category(
        name=category_name,
        type=category_type
    )
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

def delete_category(db: Session, category_id: str):
    db_cat = db.query(models.Category).filter(models.Category.id == category_id).first()
    if db_cat:
        db.delete(db_cat)
        db.commit()
    return db_cat

def create_training_example(db: Session, raw_text: str, parsed_json: dict):
    """
    Save a successful SMS parse as a training example for future AI learning.
    Avoids duplicates by checking if similar raw_text already exists.
    """
    import json
    # Check for near-duplicate (exact match or very similar)
    existing = db.query(models.TrainingExample).filter(
        models.TrainingExample.raw_text == raw_text
    ).first()
    if existing:
        return existing  # Don't save duplicate
    
    db_example = models.TrainingExample(
        raw_text=raw_text,
        parsed_json=json.dumps(parsed_json)
    )
    db.add(db_example)
    db.commit()
    db.refresh(db_example)
    return db_example

def get_similar_training_examples(db: Session, text: str, limit: int = 3):
    """
    Smart similarity search that prioritizes:
    1. Same sender/bank (highest priority)
    2. Same merchant/brand names
    3. Similar transaction structure
    """
    # 1. Extract high-value tokens (sender, bank, merchant patterns)
    text_lower = text.lower()
    
    # Common bank names to look for
    bank_keywords = ['alrajhi', 'rajhi', 'snb', 'ncb', 'alinma', 'albilad', 'riyad', 'sab', 'saib']
    sender_match = None
    for bank in bank_keywords:
        if bank in text_lower:
            sender_match = bank
            break
    
    # Extract potential merchant (look for patterns like "At:", "Merchant:", etc.)
    merchant_patterns = [
        r'at[:\s]+([^\n,]+)',  # At: MERCHANT
        r'merchant[:\s]+([^\n,]+)',  # Merchant: NAME
        r'pos[:\s]+([^\n,]+)',  # POS: STORE
        r'to[:\s]+([^\n,]+)',  # To: BENEFICIARY
    ]
    merchant_keywords = []
    for pattern in merchant_patterns:
        match = re.search(pattern, text_lower)
        if match:
            merchant_keywords.extend(match.group(1).split()[:3])  # First 3 words
    
    # 2. Tokenize Input (standard tokens)
    tokens = set(re.findall(r'\w+', text_lower))
    
    # 3. Score all examples with weighted matching
    all_examples = db.query(models.TrainingExample).all()
    scored_examples = []
    
    for ex in all_examples:
        ex_text_lower = ex.raw_text.lower()
        ex_tokens = set(re.findall(r'\w+', ex_text_lower))
        
        score = 0
        
        # High priority: Same bank/sender (worth 10 points)
        if sender_match and sender_match in ex_text_lower:
            score += 10
        
        # Medium priority: Same merchant keywords (worth 5 points each)
        for kw in merchant_keywords:
            if kw in ex_text_lower and len(kw) > 3:  # Skip short words
                score += 5
        
        # Standard: Common tokens (1 point each)
        common = tokens.intersection(ex_tokens)
        score += len(common)
        
        if score > 0:
            scored_examples.append((score, ex))
    
    # 4. Sort by score and return top matches
    scored_examples.sort(key=lambda x: x[0], reverse=True)
    return [x[1] for x in scored_examples[:limit]]

def get_random_training_examples(db: Session, limit: int = 3):
    return db.query(models.TrainingExample).order_by(func.random()).limit(limit).all()


def calculate_allocation_preview(db: Session, source_account_id: str, month_offset: int = 0):
    """
    Calculate allocation preview for salary distribution.
    
    1. Get all allocation rules (category→account mapping)
    2. Get all obligations and their expected amounts for the target month
    3. Aggregate obligation amounts by category
    4. Match categories to target accounts via rules
    5. Return preview of transfers
    """
    from dateutil.relativedelta import relativedelta
    
    # Calculate target month
    target_date = datetime.now() + relativedelta(months=month_offset)
    target_month_str = target_date.strftime('%Y-%m')
    prev_month = target_date - relativedelta(months=1)
    prev_month_str = prev_month.strftime('%Y-%m')
    
    # Get source account balance
    source_account = get_account(db, source_account_id)
    source_balance = source_account.current_balance if source_account else 0.0
    
    # Get all allocation rules
    rules = db.query(models.AllocationRule).all()
    rules_by_identifier = {}
    for r in rules:
        key = (r.rule_type, r.identifier)
        rules_by_identifier[key] = r
    
    # Get all accounts for name lookup
    accounts = db.query(models.Account).all()
    accounts_by_id = {a.id: a for a in accounts}
    
    # Get existing Distributions for this month to prevent duplicates
    existing_transfers = db.query(models.Distribution).filter(
        models.Distribution.billing_month == target_month_str,
        models.Distribution.source_account_id == source_account_id
    ).all()
    # Build set of (target_account_id) that already have transfers this month
    transferred_targets = {t.target_account_id: t for t in existing_transfers}
    
    # Get all obligations
    obligations = db.query(models.MonthlyObligation).all()
    
    # Get all payments for target month to check what's already paid
    target_payments = db.query(models.Payment).filter(
        models.Payment.billing_month.like(f"{target_month_str}%")
    ).all()
    paid_obligations = {p.obligation_id for p in target_payments if p.status == models.PaymentStatus.PAID}
    
    # Get this month's payment amounts for already-paid obligations
    target_payment_amounts = {}
    # Also track BUDGET entries for this month
    target_budget_amounts = {}
    for p in target_payments:
        if p.status == models.PaymentStatus.PAID:
            target_payment_amounts[p.obligation_id] = p.amount
        elif p.status == models.PaymentStatus.BUDGET:
            target_budget_amounts[p.obligation_id] = p.amount
    
    # Get previous month payments for Smart Default amounts (for pending obligations)
    prev_payments = db.query(models.Payment).filter(
        models.Payment.billing_month.like(f"{prev_month_str}%")
    ).all()
    prev_amounts_by_obl = {}
    for p in prev_payments:
        prev_amounts_by_obl[p.obligation_id] = p.amount
    
    # Aggregate obligations by category with status tracking
    # Structure: { category: { 'pending': amount, 'allocated': amount } }
    category_data = {}  # category -> { 'pending': float, 'allocated': float }
    loan_data = {}  # loan_name -> { 'pending': float, 'allocated': float }
    
    skipped_items = []
    fulfilled_items = []
    
    for obl in obligations:
        is_paid = obl.id in paid_obligations
        
        # Get expected amount - priority:
        # 1. If PAID this month, use payment amount
        # 2. If BUDGET entry exists for this month, use that
        # 3. Otherwise, use previous month's payment as estimate
        if is_paid:
            expected_amount = target_payment_amounts.get(obl.id, 0)
        elif obl.id in target_budget_amounts:
            expected_amount = target_budget_amounts[obl.id]
        else:
            expected_amount = prev_amounts_by_obl.get(obl.id, 0)
        
        if expected_amount <= 0:
            skipped_items.append(f"{obl.name} (no payment history)")
            continue
        
        category = obl.category or "Other"
        status = 'allocated' if is_paid else 'pending'
        
        # Check if this is a Loan category (special handling)
        if category.lower() == "loan":
            # Use obligation name as loan identifier
            if obl.name not in loan_data:
                loan_data[obl.name] = {'pending': 0, 'allocated': 0}
            loan_data[obl.name][status] += expected_amount
        else:
            # Regular category
            if category not in category_data:
                category_data[category] = {'pending': 0, 'allocated': 0}
            category_data[category][status] += expected_amount
    
    # Build allocation items
    allocations = []
    total_required = 0.0
    
    # Process categories
    for category, amounts in category_data.items():
        rule = rules_by_identifier.get(('CATEGORY', category))
        if rule:
            target_acc = accounts_by_id.get(rule.target_account_id)
            pending_amount = amounts['pending']
            allocated_amount = amounts['allocated']
            
            # Check if transfer already exists for this target account
            existing_transfer = transferred_targets.get(rule.target_account_id)
            
            # Add pending allocation if any
            if pending_amount > 0:
                if existing_transfer:
                    # Already transferred this month - show as transferred
                    allocations.append(schemas.AllocationItem(
                        identifier=category,
                        name=category,
                        rule_type='CATEGORY',
                        target_account_id=rule.target_account_id,
                        target_account_name=target_acc.name if target_acc else "Unknown",
                        amount=existing_transfer.amount,
                        required_amount=pending_amount,
                        status='transferred'
                    ))
                else:
                    # Transfer full required amount
                    allocations.append(schemas.AllocationItem(
                        identifier=category,
                        name=category,
                        rule_type='CATEGORY',
                        target_account_id=rule.target_account_id,
                        target_account_name=target_acc.name if target_acc else "Unknown",
                        amount=pending_amount,
                        required_amount=pending_amount,
                        status='pending'
                    ))
                    total_required += pending_amount
            
            # Add allocated items if any
            if allocated_amount > 0:
                allocations.append(schemas.AllocationItem(
                    identifier=f"{category}_allocated",
                    name=category,
                    rule_type='CATEGORY',
                    target_account_id=rule.target_account_id,
                    target_account_name=target_acc.name if target_acc else "Unknown",
                    amount=allocated_amount,
                    required_amount=allocated_amount,
                    status='allocated'
                ))
        else:
            skipped_items.append(f"{category} category (no rule)")
    
    # Process loans
    for loan_name, amounts in loan_data.items():
        rule = rules_by_identifier.get(('LOAN', loan_name))
        if rule:
            target_acc = accounts_by_id.get(rule.target_account_id)
            pending_amount = amounts['pending']
            allocated_amount = amounts['allocated']
            
            # Check if transfer already exists for this target account
            existing_transfer = transferred_targets.get(rule.target_account_id)
            
            # Add pending allocation if any
            if pending_amount > 0:
                if existing_transfer:
                    # Already transferred this month - show as transferred
                    allocations.append(schemas.AllocationItem(
                        identifier=loan_name,
                        name=loan_name,
                        rule_type='LOAN',
                        target_account_id=rule.target_account_id,
                        target_account_name=target_acc.name if target_acc else "Unknown",
                        amount=existing_transfer.amount,
                        required_amount=pending_amount,
                        status='transferred'
                    ))
                else:
                    # Transfer full required amount
                    allocations.append(schemas.AllocationItem(
                        identifier=loan_name,
                        name=loan_name,
                        rule_type='LOAN',
                        target_account_id=rule.target_account_id,
                        target_account_name=target_acc.name if target_acc else "Unknown",
                        amount=pending_amount,
                        required_amount=pending_amount,
                        status='pending'
                    ))
                    total_required += pending_amount
            
            # Add allocated items if any
            if allocated_amount > 0:
                allocations.append(schemas.AllocationItem(
                    identifier=f"{loan_name}_allocated",
                    name=loan_name,
                    rule_type='LOAN',
                    target_account_id=rule.target_account_id,
                    target_account_name=target_acc.name if target_acc else "Unknown",
                    amount=allocated_amount,
                    required_amount=allocated_amount,
                    status='allocated'
                ))
        else:
            skipped_items.append(f"{loan_name} loan (no rule)")
    
    # Calculate totals - show full required amounts without pro-rata reduction
    # Shortage handling happens at execution time, not preview time
    total_amount = total_required
    
    return schemas.AllocationPreviewResponse(
        total_required=total_required,
        total_amount=total_amount,
        allocations=allocations,
        fulfilled_items=fulfilled_items,
        skipped_items=skipped_items
    )


# --- Audit Functions ---

def get_last_audit(db: Session, account_id: str):
    """Get the most recent audit for an account."""
    return db.query(models.AccountAudit).filter(
        models.AccountAudit.account_id == account_id
    ).order_by(models.AccountAudit.audit_date.desc()).first()

def get_transactions_since_audit(db: Session, account_id: str, since_date: datetime = None):
    """Get all transactions for an account since the last audit date."""
    query = db.query(models.Transaction).filter(
        models.Transaction.account_id == account_id
    )
    if since_date:
        query = query.filter(models.Transaction.timestamp >= since_date)
    return query.order_by(models.Transaction.timestamp.desc()).all()

def check_audit(db: Session, account_id: str, actual_balance: float):
    """Check if system balance matches actual balance and return transactions since last audit."""
    # Get the account
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        return None
    
    system_balance = account.current_balance
    discrepancy = round(actual_balance - system_balance, 2)
    is_match = abs(discrepancy) < 0.01  # Allow for rounding differences
    
    # Get last audit
    last_audit = get_last_audit(db, account_id)
    last_audit_date = last_audit.audit_date if last_audit else None
    
    # Get transactions since last audit
    transactions = get_transactions_since_audit(db, account_id, last_audit_date)
    
    return {
        "is_match": is_match,
        "system_balance": system_balance,
        "actual_balance": actual_balance,
        "discrepancy": discrepancy,
        "last_audit_date": last_audit_date,
        "transactions_since_audit": transactions
    }

def create_audit(db: Session, account_id: str, actual_balance: float, notes: str = None, force_confirm: bool = False):
    """Create a new audit record."""
    # Get the account
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        return None
    
    system_balance = account.current_balance
    difference = round(actual_balance - system_balance, 2)
    is_match = abs(difference) < 0.01
    
    # Determine status
    if is_match:
        status = "MATCH"
    elif force_confirm:
        status = "MISMATCH"
    else:
        # Can't create audit for mismatch without force_confirm
        return {"error": "Cannot confirm mismatch without force_confirm. Please provide notes."}
    
    # Create audit record
    db_audit = models.AccountAudit(
        account_id=account_id,
        system_balance=system_balance,
        actual_balance=actual_balance,
        difference=difference,
        status=status,
        notes=notes
    )
    db.add(db_audit)
    
    # Update account's last successful audit date
    account.last_successful_audit_date = datetime.utcnow()
    
    db.commit()
    db.refresh(db_audit)
    return db_audit

def get_audit_history(db: Session, account_id: str, limit: int = 20):
    """Get audit history for an account."""
    return db.query(models.AccountAudit).filter(
        models.AccountAudit.account_id == account_id
    ).order_by(models.AccountAudit.audit_date.desc()).limit(limit).all()


# --- Distribution CRUD ---

def create_distribution(db: Session, distribution: schemas.DistributionCreate):
    """Create a distribution record."""
    db_distribution = models.Distribution(
        source_account_id=distribution.source_account_id,
        target_account_id=distribution.target_account_id,
        amount=distribution.amount,
        billing_month=distribution.billing_month,
        note=distribution.note,
        transaction_id=distribution.transaction_id
    )
    db.add(db_distribution)
    db.commit()
    db.refresh(db_distribution)
    return db_distribution

def get_distributions(db: Session, billing_month: str = None, source_account_id: str = None):
    """Get distributions, optionally filtered by month or source account."""
    from sqlalchemy.orm import joinedload
    
    query = db.query(models.Distribution).options(
        joinedload(models.Distribution.linked_transactions).joinedload(models.DistributionTransaction.transaction)
    )
    
    if billing_month:
        query = query.filter(models.Distribution.billing_month == billing_month)
    if source_account_id:
        query = query.filter(models.Distribution.source_account_id == source_account_id)
    
    return query.order_by(models.Distribution.created_at.desc()).all()

def get_distribution(db: Session, distribution_id: str):
    """Get a single distribution by ID."""
    from sqlalchemy.orm import joinedload
    
    return db.query(models.Distribution).options(
        joinedload(models.Distribution.linked_transactions).joinedload(models.DistributionTransaction.transaction)
    ).filter(
        models.Distribution.id == distribution_id
    ).first()

def update_distribution(db: Session, distribution_id: str, update: schemas.DistributionUpdate):
    """Update a distribution."""
    db_distribution = get_distribution(db, distribution_id)
    if not db_distribution:
        return None
    
    update_data = update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_distribution, key, value)
    
    db.commit()
    db.refresh(db_distribution)
    return db_distribution

def delete_distribution(db: Session, distribution_id: str):
    """Delete a distribution."""
    db_distribution = get_distribution(db, distribution_id)
    if not db_distribution:
        return False
    
    # First delete any linked entries in the junction table
    db.query(models.DistributionTransaction).filter(
        models.DistributionTransaction.distribution_id == distribution_id
    ).delete(synchronize_session=False)
    
    db.delete(db_distribution)
    db.commit()
    return True

def get_distribution_matches(db: Session, distribution_id: str):
    """Find matching transactions for a distribution (similar to obligation matching)."""
    distribution = get_distribution(db, distribution_id)
    if not distribution:
        return []
    
    # Look for transfer transactions in the same month
    # Match by: amount (within tolerance), type='credit', to target account
    tolerance = distribution.amount * 0.1  # 10% tolerance
    min_amount = distribution.amount - tolerance
    max_amount = distribution.amount + tolerance
    
    # Parse billing month to get date range
    try:
        year, month = distribution.billing_month.split('-')
        from dateutil.relativedelta import relativedelta
        start_date = datetime(int(year), int(month), 1)
        end_date = start_date + relativedelta(months=1)
    except:
        return []
    
    # Find transactions: credits to target account, matching amount, in the month
    matches = db.query(models.Transaction).filter(
        models.Transaction.account_id == distribution.target_account_id,
        models.Transaction.type == 'credit',
        models.Transaction.amount >= min_amount,
        models.Transaction.amount <= max_amount,
        models.Transaction.timestamp >= start_date,
        models.Transaction.timestamp < end_date,
        models.Transaction.category.in_(['Transfer', 'Internal Transfer', None])
    ).order_by(models.Transaction.timestamp.desc()).limit(5).all()
    
    return matches

def link_distribution_to_transaction(db: Session, distribution_id: str, transaction_id: str):
    """Link a distribution to a transaction."""
    db_distribution = get_distribution(db, distribution_id)
    if not db_distribution:
        return None
    
    db_distribution.transaction_id = transaction_id
    db.commit()
    db.refresh(db_distribution)
    return db_distribution
