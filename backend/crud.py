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

def get_account_by_name(db: Session, name: str):
    # Try case-insensitive matching if possible, otherwise exact
    return db.query(models.Account).filter(models.Account.name == name).first()

def get_account(db: Session, account_id: str):
    return db.query(models.Account).filter(models.Account.id == account_id).first()

def create_account(db: Session, account: schemas.AccountCreate):
    db_account = models.Account(
        name=account.name,
        account_type=account.account_type,
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
    if transaction.account_id:
        account = db.query(models.Account).filter(models.Account.id == transaction.account_id).first()
    
    new_balance = 0.0
    
    if account and transaction.status == "completed":
        # Logic based on Transaction Type (Agent Driven)
        try:
             # Try/Catch for Enum vs String comparison safety
             is_credit = transaction.type == "credit" or transaction.type == models.TransactionType.CREDIT
        except:
             is_credit = str(transaction.type).lower() == "credit"

        if is_credit:
             account.current_balance += transaction.amount
        else:
             # DEBIT
             account.current_balance -= transaction.amount
        
        # Deduct Fees if present (Fees are always a debit)
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

    db_transaction = models.Transaction(
        account_id=transaction.account_id,
        amount=transaction.amount,
        merchant=transaction.merchant,
        raw_sms_content=transaction.raw_sms_content,
        timestamp=transaction.timestamp,
        category=transaction.category,
        type=transaction.type,
        balance_after_transaction=new_balance if account and transaction.status == "completed" else None,
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

def get_similar_training_examples(db: Session, text: str, limit: int = 3):
    """
    Naive similarity search. In production, use embeddings (pgvector).
    Here we just find examples that share significant words.
    """
    # 1. Tokenize Input
    tokens = set(re.findall(r'\w+', text.lower()))
    
    # 2. Score all examples
    all_examples = db.query(models.TrainingExample).all()
    scored_examples = []
    
    for ex in all_examples:
        ex_tokens = set(re.findall(r'\w+', ex.raw_text.lower()))
        common = tokens.intersection(ex_tokens)
        score = len(common)
        if score > 0:
            scored_examples.append((score, ex))
    
    # 3. Sort and Return
    scored_examples.sort(key=lambda x: x[0], reverse=True)
    return [x[1] for x in scored_examples[:limit]]

def get_random_training_examples(db: Session, limit: int = 3):
    return db.query(models.TrainingExample).order_by(func.random()).limit(limit).all()

# --- Obligations & Payments ---

def get_obligations(db: Session):
    return db.query(models.MonthlyObligation).order_by(models.MonthlyObligation.display_order.asc(), models.MonthlyObligation.due_day.asc()).all()

def create_obligation(db: Session, obligation: schemas.ObligationCreate):
    # Set display_order to last + 1
    last = db.query(models.MonthlyObligation).order_by(models.MonthlyObligation.display_order.desc()).first()
    new_order = (last.display_order + 1) if last else 0
    
    db_obl = models.MonthlyObligation(**obligation.dict(), display_order=new_order)
    db.add(db_obl)
    db.commit()
    db.refresh(db_obl)
    return db_obl

def update_obligation(db: Session, obl_id: str, updates: schemas.ObligationUpdate):
    db_obl = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obl_id).first()
    if not db_obl:
        return None
    
    update_data = updates.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_obl, key, value)
    
    db.commit()
    db.refresh(db_obl)
    return db_obl

def delete_obligation(db: Session, obl_id: str):
    db_obl = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obl_id).first()
    if not db_obl:
        return False
    
    # Cascade delete payments? Or keep them? Usually cascade or set null.
    # Models likely handle relation, but let's be safe.
    db.query(models.Payment).filter(models.Payment.obligation_id == obl_id).delete()
    
    db.delete(db_obl)
    db.commit()
    return True

def reorder_obligations(db: Session, ordered_ids: List[str]):
    for idx, obl_id in enumerate(ordered_ids):
        db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obl_id).update({"display_order": idx})
    db.commit()

# --- Payments ---

def get_payment_history(db: Session, obligation_id: str):
    return db.query(models.Payment).filter(models.Payment.obligation_id == obligation_id).order_by(models.Payment.payment_date.desc()).all()

def create_payment(db: Session, obligation_id: str, payment: schemas.PaymentCreate):
    db_pay = models.Payment(**payment.dict(), obligation_id=obligation_id)
    db.add(db_pay)
    db.commit()
    db.refresh(db_pay)
    return db_pay

def update_payment(db: Session, payment_id: int, updates: schemas.PaymentUpdate):
    db_pay = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not db_pay:
        return None
    
    update_data = updates.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_pay, key, value)
        
    db.commit()
    db.refresh(db_pay)
    return db_pay

def delete_payment(db: Session, payment_id: int):
    db_pay = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not db_pay:
        return False
    db.delete(db_pay)
    db.commit()
    return True
