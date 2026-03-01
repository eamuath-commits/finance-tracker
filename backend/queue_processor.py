"""
Transaction Queue Processor

Ensures transactions are processed in chronological order, maintaining balance consistency.
Transactions are first added to a queue, and only processed when there are no pending items.
"""
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
import models
import logging

logger = logging.getLogger(__name__)


def add_to_queue(
    db: Session, 
    transaction: models.Transaction, 
    account_id: Optional[str] = None, 
    credit_card_id: Optional[str] = None,
    blocked_reason: Optional[str] = None
) -> models.TransactionQueue:
    """
    Add a transaction to the processing queue.
    Does NOT update balances - that happens in try_process().
    """
    status = "blocked" if blocked_reason else "queued"
    
    queue_entry = models.TransactionQueue(
        transaction_id=transaction.id,
        account_id=account_id or transaction.account_id,
        credit_card_id=credit_card_id or transaction.credit_card_id,
        status=status,
        queued_at=datetime.now(),
        blocked_reason=blocked_reason
    )
    db.add(queue_entry)
    db.commit()
    db.refresh(queue_entry)
    
    logger.info(f"Added transaction {transaction.id} to queue with status '{status}'")
    return queue_entry


def has_pending_items(db: Session, account_id: Optional[str] = None, credit_card_id: Optional[str] = None) -> bool:
    """
    Check if there are any blocked/pending items in the queue.
    Returns True if processing should be blocked.
    """
    query = db.query(models.TransactionQueue).filter(
        models.TransactionQueue.status == "blocked"
    )
    
    if account_id:
        query = query.filter(models.TransactionQueue.account_id == account_id)
    if credit_card_id:
        query = query.filter(models.TransactionQueue.credit_card_id == credit_card_id)
    
    return query.first() is not None


def unblock_transaction(db: Session, transaction_id: str) -> bool:
    """
    Mark a blocked transaction as ready to process (queued).
    Called after user resolves pending items (e.g., selects source account).
    """
    queue_entry = db.query(models.TransactionQueue).filter(
        models.TransactionQueue.transaction_id == transaction_id
    ).first()
    
    if not queue_entry:
        return False
    
    queue_entry.status = "queued"
    queue_entry.blocked_reason = None
    db.commit()
    
    logger.info(f"Unblocked transaction {transaction_id}")
    return True


def try_process(db: Session, account_id: Optional[str] = None, credit_card_id: Optional[str] = None) -> List[models.Transaction]:
    """
    Process queued transactions in timestamp order.
    Only processes if there are no blocked items.
    Returns list of processed transactions.
    """
    # Check for blocked items
    if has_pending_items(db, account_id, credit_card_id):
        logger.info("Queue processing blocked - pending items require resolution")
        return []
    
    # Get queued items ordered by transaction timestamp
    query = db.query(models.TransactionQueue).filter(
        models.TransactionQueue.status == "queued"
    )
    
    if account_id:
        query = query.filter(models.TransactionQueue.account_id == account_id)
    if credit_card_id:
        query = query.filter(models.TransactionQueue.credit_card_id == credit_card_id)
    
    # Join with transactions to order by timestamp
    queue_entries = query.join(
        models.Transaction, 
        models.TransactionQueue.transaction_id == models.Transaction.id
    ).order_by(models.Transaction.timestamp.asc()).all()
    
    processed = []
    
    for entry in queue_entries:
        transaction = db.query(models.Transaction).filter(
            models.Transaction.id == entry.transaction_id
        ).first()
        
        if not transaction:
            logger.warning(f"Transaction {entry.transaction_id} not found, skipping")
            continue
        
        # Apply balance update
        success = apply_balance_update(db, transaction)
        
        if success:
            entry.status = "processed"
            entry.processed_at = datetime.now()
            processed.append(transaction)
            logger.info(f"Processed transaction {transaction.id}, updated balance")
    
    db.commit()
    return processed


def apply_balance_update(db: Session, transaction: models.Transaction) -> bool:
    """
    Apply the balance change for a single transaction.
    This is the core balance update logic extracted for queue processing.
    """
    tx_type = str(transaction.type).lower() if transaction.type else 'debit'
    amount = transaction.amount or 0
    
    # Update Account balance
    if transaction.account_id:
        account = db.query(models.Account).filter(
            models.Account.id == transaction.account_id
        ).first()
        
        if account:
            old_balance = account.current_balance or 0
            if tx_type == 'credit':
                account.current_balance = round(old_balance + amount, 2)
            else:  # debit
                account.current_balance = round(old_balance - amount, 2)
            
            # Calculate balance_after_transaction
            if transaction.fees:
                account.current_balance = round(account.current_balance - transaction.fees, 2)
            transaction.balance_after_transaction = account.current_balance
            logger.info(f"Account {account.last_4_digits}: {old_balance} -> {account.current_balance}")
    
    # Update Credit Card balance
    if transaction.credit_card_id:
        credit_card = db.query(models.CreditCard).filter(
            models.CreditCard.id == transaction.credit_card_id
        ).first()
        
        if credit_card:
            old_balance = credit_card.current_balance or 0
            
            # Always calculate from DB (credit adds, debit subtracts)
            if tx_type == 'credit':
                credit_card.current_balance = old_balance + amount
            else:  # debit = purchase, subtracts from balance
                credit_card.current_balance = old_balance - amount
            
            if transaction.fees:
                credit_card.current_balance = round(credit_card.current_balance - transaction.fees, 2)
            
            transaction.balance_after_transaction = credit_card.current_balance
            logger.info(f"CC {credit_card.last_4_digits}: {old_balance} -> {credit_card.current_balance}")
            
            # Discrepancy check: compare with SMS available_balance if present
            if transaction.parsed_data:
                try:
                    import json
                    parsed = json.loads(transaction.parsed_data) if isinstance(transaction.parsed_data, str) else transaction.parsed_data
                    sms_balance = parsed.get('available_balance')
                    if sms_balance is not None:
                        # For CC: SMS "Available Balance" = available credit = credit_limit - debt
                        # Our current_balance = debt (what you owe)
                        # So expected_debt = credit_limit - sms_available_balance
                        if credit_card.credit_limit:
                            expected_balance = credit_card.credit_limit - sms_balance
                        else:
                            # If no credit limit set, can't derive debt from available balance
                            # Use direct comparison as fallback
                            expected_balance = sms_balance
                        
                        diff = abs(credit_card.current_balance - expected_balance)
                        
                        if diff <= 0.05:
                            # Small rounding difference — adopt SMS balance
                            if diff > 0:
                                logger.info(
                                    f"CC {credit_card.last_4_digits}: Small rounding diff ({diff:.2f}), "
                                    f"adopting SMS balance: {credit_card.current_balance:.2f} → {expected_balance:.2f}"
                                )
                            credit_card.current_balance = round(expected_balance, 2)
                            transaction.balance_after_transaction = credit_card.current_balance
                        else:
                            # Large discrepancy — raise warning flag
                            logger.warning(
                                f"⚠️ CC {credit_card.last_4_digits} BALANCE DISCREPANCY: "
                                f"DB={credit_card.current_balance:.2f}, Expected={expected_balance:.2f}, "
                                f"SMS_available={sms_balance:.2f}, diff={diff:.2f}"
                            )
                            # Store discrepancy info in parsed_data for frontend display
                            parsed['balance_discrepancy'] = {
                                'db_balance': round(credit_card.current_balance, 2),
                                'sms_balance': round(sms_balance, 2),
                                'expected_balance': round(expected_balance, 2),
                                'difference': round(diff, 2)
                            }
                            transaction.parsed_data = json.dumps(parsed)
                            transaction.notes = (transaction.notes or '') + f" [⚠️ Balance discrepancy: {diff:.2f} SAR]"
                except Exception as e:
                    logger.debug(f"Could not check SMS balance: {e}")
    
    return True


def get_queue_status(db: Session) -> dict:
    """
    Get current queue statistics.
    """
    total_queued = db.query(models.TransactionQueue).filter(
        models.TransactionQueue.status == "queued"
    ).count()
    
    total_blocked = db.query(models.TransactionQueue).filter(
        models.TransactionQueue.status == "blocked"
    ).count()
    
    total_processed = db.query(models.TransactionQueue).filter(
        models.TransactionQueue.status == "processed"
    ).count()
    
    return {
        "queued": total_queued,
        "blocked": total_blocked,
        "processed": total_processed,
        "can_process": total_blocked == 0 and total_queued > 0
    }


def get_blocked_transactions(db: Session) -> List[dict]:
    """
    Get all blocked transactions with their details.
    """
    blocked = db.query(models.TransactionQueue).filter(
        models.TransactionQueue.status == "blocked"
    ).all()
    
    result = []
    for entry in blocked:
        tx = db.query(models.Transaction).filter(
            models.Transaction.id == entry.transaction_id
        ).first()
        
        if tx:
            result.append({
                "queue_id": entry.id,
                "transaction_id": tx.id,
                "amount": tx.amount,
                "merchant": tx.merchant,
                "timestamp": tx.timestamp.isoformat() if tx.timestamp else None,
                "blocked_reason": entry.blocked_reason,
                "account_id": entry.account_id,
                "credit_card_id": entry.credit_card_id
            })
    
    return result
