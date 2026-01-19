from sqlalchemy.orm import Session
import models
import schemas
import uuid
from datetime import datetime

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

def create_transaction(db: Session, transaction: schemas.TransactionCreate):
    # Update Account Balance FIRST so we can record it
    account = db.query(models.Account).filter(models.Account.id == transaction.account_id).first()
    new_balance = 0.0
    
    if account:
        # Assuming outgoing transaction amount is positive in payload if it is a debit.
        # But wait, logic depends on type.
        # Currently standard: Spent 50 -> Amount 50.
        # Account Balance 1000 - 50 = 950.
        
        # NOTE: If we implement Income/Credit properly, we should check category or amount sign.
        # For now, relying on simple subtraction logic as per previous implementation (Lines 86).
        # "Credit" category logic handles display, but backend needs to know direction?
        # Let's check crud.py existing lines 86: account.current_balance -= transaction.amount
        
        # We need to refine this slightly:
        # If Category is 'Income'/'Deposit', add. Else subtract.
        CREDIT_CATEGORIES = ['Income', 'Deposit', 'Refund', 'Interest']
        if transaction.category and transaction.category in CREDIT_CATEGORIES:
             account.current_balance += transaction.amount
        else:
             account.current_balance -= transaction.amount
        
        new_balance = account.current_balance
        db.add(account)

    db_transaction = models.Transaction(
        account_id=transaction.account_id,
        amount=transaction.amount,
        merchant=transaction.merchant,
        raw_sms_content=transaction.raw_sms_content,
        timestamp=datetime.utcnow(),
        category=transaction.category,
        balance_after_transaction=new_balance if account else None
    )
    db.add(db_transaction)

    db.commit()
    db.refresh(db_transaction)
    return db_transaction

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

def create_obligation(db: Session, obligation: schemas.ObligationCreate):
    db_obj = models.MonthlyObligation(
        name=obligation.name,
        due_day=obligation.due_day,
        category=obligation.category
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
    
    update_data = transaction_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_tx, key, value)
        
    db.add(db_tx)
    db.commit()
    db.refresh(db_tx)
    db.refresh(db_tx)
    return db_tx

def delete_transaction(db: Session, transaction_id: str):
    db_tx = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if db_tx:
        # Revert balance change
        account = db_tx.account
        if account:
            # Same categories as in create_transaction to determine direction
            CREDIT_CATEGORIES = ['Income', 'Deposit', 'Refund', 'Interest']
            
            if db_tx.category and db_tx.category in CREDIT_CATEGORIES:
                # Original was ADD, so removal is SUBTRACT
                account.current_balance -= db_tx.amount
            else:
                # Original was SUBTRACT, so removal is ADD
                account.current_balance += db_tx.amount
            
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
            # Upsert Logic: If it exists (PENDING or PAID), update it with the new details.
            # This handles cases where user edits the amount/date via the "Pay" button (POST).
            
            status_enum = models.PaymentStatus.PAID
            if payment.status:
                try:
                    status_enum = models.PaymentStatus(payment.status)
                except ValueError:
                    pass
            
            existing.amount = payment.amount
            existing.payment_date = payment.payment_date
            existing.note = payment.note
            existing.status = status_enum
            
            # Auto-update expected amount if PAID --> DEPRECATED/REMOVED
            # if status_enum == models.PaymentStatus.PAID:
            #     obligation = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
            #     if obligation:
            #         # obligation.amount = payment.amount
            #         # db.add(obligation)
            #         pass
            
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

    db_payment = models.Payment(
        obligation_id=obligation_id,
        amount=payment.amount,
        payment_date=payment.payment_date,
        billing_month=payment.billing_month,
        note=payment.note,
        status=status_enum
    )
    db.add(db_payment)
    
    # Auto-update the expected amount for next month based on this payment, 
    # BUT only if it is actually PAID.
    if status_enum == models.PaymentStatus.PAID:
        obligation = db.query(models.MonthlyObligation).filter(models.MonthlyObligation.id == obligation_id).first()
        if obligation:
            # If obligation has no amount, or we want to update it to latest payment
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

from datetime import date

def calculate_allocation_preview(db: Session, source_account_id: str, month_offset: int = 0):
    # 1. Determine target month/year
    today = date.today()
    year = today.year
    month = today.month + month_offset
    while month > 12:
        month -= 12
        year += 1
    while month < 1:
        month += 12
        year -= 1
    
    target_billing_month = date(year, month, 1)

    # 2. Fetch Budgeted/Pending Payments for that month
    payments = db.query(models.Payment).join(models.MonthlyObligation).filter(
        models.Payment.billing_month == target_billing_month,
        models.Payment.status.in_([models.PaymentStatus.BUDGET, models.PaymentStatus.PENDING])
    ).all()

    # 3. Fetch Rules
    rules = get_allocation_rules(db)

    # 4. Aggregate
    allocations = {} # TargetAccountID -> { amount, acc_name, details, current_balance }
    skipped_items = []
    fulfilled_items = []

    for p in payments:
        obl = p.obligation
        matched_rule = None
        
        # Priority 1: Match Name (LOAN type)
        for r in rules:
            if r.rule_type == models.AllocationRuleType.LOAN and r.identifier.lower() == obl.name.lower():
                matched_rule = r
                break
        
        # Priority 2: Match Category (CATEGORY type)
        if not matched_rule and obl.category:
            for r in rules:
                if r.rule_type == models.AllocationRuleType.CATEGORY and r.identifier.lower() == obl.category.lower():
                    matched_rule = r
                    break
        
        if matched_rule:
            tid = matched_rule.target_account_id
            if tid not in allocations:
                t_acc = db.query(models.Account).filter(models.Account.id == tid).first()
                if t_acc:
                    allocations[tid] = {
                        "target_account_id": tid,
                        "target_account_name": t_acc.name,
                        "current_balance": t_acc.current_balance,
                        "amount": 0,
                        "details": []
                    }
            
            if tid in allocations:
                allocations[tid]["amount"] += p.amount
                allocations[tid]["details"].append(obl.name)
        else:
            skipped_items.append(f"{obl.name} (No Rule)")

    # Format Response
    result_list = []
    total = 0
    # Fetch Source Balance to track depletion
    source_acc = db.query(models.Account).filter(models.Account.id == source_account_id).first()
    running_balance = source_acc.current_balance if source_acc else 0

    for tid, data in allocations.items():
        required_amount = data["amount"]
        
        # Cap transfer at available source balance
        transfer_amount = min(required_amount, running_balance)
        gap = required_amount - transfer_amount

        # Update running balance
        running_balance = max(0, running_balance - transfer_amount)

        # Add note if there is a gap covered by destination
        if gap > 0:
            data["details"].append(f"(Source Limit: {transfer_amount:,.0f}, Dest covers {gap:,.0f})")

        if transfer_amount > 0 or gap > 0:
            total += transfer_amount
            # Summary name
            details_txt = ", ".join(data["details"])
            if len(details_txt) > 500:
                details_txt = details_txt[:500] + "..."
                
            result_list.append(schemas.AllocationPreviewItem(
                rule_type="AGGREGATE",
                identifier=f"aggregate_{tid}",
                name=details_txt, 
                amount=transfer_amount,
                target_account_id=tid,
                target_account_name=data["target_account_name"]
            ))
        else:
            # Entirely covered by balance (This case matches 'fulfilled' only if required was 0? 
            # With new logic, if required > 0 and transfer is 0, it goes to IF block above with gap.
            # So this ELSE is mostly dead unless required was 0 initially which shouldn't happen in this loop)
            pass
        
    return schemas.AllocationPreviewResponse(
        total_amount=total, 
        allocations=result_list,
        skipped_items=skipped_items,
        fulfilled_items=fulfilled_items
    )

# --- Category Management ---

def create_category(db: Session, category: schemas.CategoryCreate):
    # Check case-insensitive
    existing = db.query(models.Category).filter(models.Category.name.ilike(category.name)).first()
    if existing:
        return existing
        
    db_cat = models.Category(name=category.name)
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

def get_categories(db: Session):
    return db.query(models.Category).order_by(models.Category.name).all()

def update_category_name(db: Session, category_id: str, new_name: str):
    cat = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not cat:
        return None
    
    old_name = cat.name
    # Update Category Table
    cat.name = new_name
    db.add(cat)
    
    # 1. Update Obligations
    db.query(models.MonthlyObligation).filter(models.MonthlyObligation.category == old_name).update(
        {"category": new_name}, synchronize_session=False
    )
    
    # 2. Update Allocation Rules
    db.query(models.AllocationRule).filter(
        models.AllocationRule.rule_type == models.AllocationRuleType.CATEGORY,
        models.AllocationRule.identifier == old_name
    ).update(
        {"identifier": new_name}, synchronize_session=False
    )
    
    db.commit()
    db.refresh(cat)
    return cat

def delete_category(db: Session, category_id: str):
    cat = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not cat:
        return None
        
    old_name = cat.name
    
    # 1. Clear Obligations (Set to NULL)
    db.query(models.MonthlyObligation).filter(models.MonthlyObligation.category == old_name).update(
        {"category": None}, synchronize_session=False
    )
    
    # 2. Delete related Rules
    db.query(models.AllocationRule).filter(
        models.AllocationRule.rule_type == models.AllocationRuleType.CATEGORY,
        models.AllocationRule.identifier == old_name
    ).delete(synchronize_session=False)

    db.delete(cat)
    db.commit()
    return True
