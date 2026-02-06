# backend/bank_parsers/base.py
"""
Base class for bank-specific SMS parsers.
Provides common functionality and defines the interface for bank parsers.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger("bank_parsers")


class BaseBankParser(ABC):
    """
    Abstract base class for bank-specific SMS parsers.
    
    Each bank parser should:
    1. Define a PROMPT with bank-specific examples
    2. Optionally override post_process() for custom logic
    3. Optionally override handle_ambiguous() for edge cases
    """
    
    # Bank identifier
    BANK_NAME: str = "Unknown"
    
    # Default account last4 for banks where SMS doesn't specify account
    # Override in subclass if the bank has a default account
    DEFAULT_ACCOUNT_LAST4: Optional[str] = None
    
    # AI Prompt - override in subclass with bank-specific examples
    PROMPT: str = ""
    
    async def parse(self, db: Session, sms_text: str) -> Dict[str, Any]:
        """
        Main parse method. Override for custom parsing logic.
        
        Args:
            db: Database session
            sms_text: Raw SMS text
        
        Returns:
            Parsed transaction data dictionary
        """
        # Import here to avoid circular import
        import sms_agent
        
        # Use bank-specific prompt if defined, otherwise use default
        if self.PROMPT:
            result = await sms_agent.parse_with_ai(db, sms_text, custom_prompt=self.PROMPT)
        else:
            result = await sms_agent.parse_with_ai(db, sms_text)
        
        # Apply bank-specific post-processing
        result = self.post_process(result, sms_text)
        
        # Handle ambiguous transactions
        if result.get("ambiguous"):
            result = self.handle_ambiguous(result, sms_text)
        
        # Resolve transaction direction based on known accounts
        result = self._resolve_transaction_direction(db, result)
        
        # Apply default account if needed
        result = self._apply_default_account(result)
        
        # Log the parsing result
        logger.info(f"[{self.BANK_NAME}] Parsed: {result.get('transaction_type')} "
                   f"{result.get('amount')} {result.get('currency', 'SAR')}")
        
        return result
    
    def post_process(self, result: Dict[str, Any], sms_text: str) -> Dict[str, Any]:
        """
        Override for bank-specific post-processing.
        
        Args:
            result: Parsed data from AI
            sms_text: Original SMS text
        
        Returns:
            Modified result dictionary
        """
        return result
    
    def handle_ambiguous(self, result: Dict[str, Any], sms_text: str) -> Dict[str, Any]:
        """
        Override for handling ambiguous transactions.
        
        Args:
            result: Parsed data with ambiguous flag
            sms_text: Original SMS text
        
        Returns:
            Resolved result dictionary
        """
        return result
    
    def _apply_default_account(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply default account if the relevant account field is empty.
        
        For debits: source_account_last4 should be the user's account (apply default if empty)
        For credits: destination_account_last4 should be the user's account (apply default if empty)
        """
        if not self.DEFAULT_ACCOUNT_LAST4:
            return result
        
        tx_type = result.get('transaction_type')
        
        # For debits: money leaves user's account → source should be default if empty
        if tx_type == 'debit' and not result.get('source_account_last4'):
            logger.info(f"[{self.BANK_NAME}] Applying default source account: {self.DEFAULT_ACCOUNT_LAST4}")
            result['source_account_last4'] = self.DEFAULT_ACCOUNT_LAST4
        
        # For credits: money enters user's account → destination should be default if empty
        elif tx_type == 'credit' and not result.get('destination_account_last4'):
            logger.info(f"[{self.BANK_NAME}] Applying default destination account: {self.DEFAULT_ACCOUNT_LAST4}")
            result['destination_account_last4'] = self.DEFAULT_ACCOUNT_LAST4
        
        return result
    
    def get_account_last4(self, result: Dict[str, Any], sms_text: str) -> Optional[str]:
        """
        Get the account last4 from result or extract from SMS.
        Override for bank-specific extraction logic.
        """
        last4 = result.get('source_account_last4') or result.get('destination_account_last4')
        if not last4 and self.DEFAULT_ACCOUNT_LAST4:
            return self.DEFAULT_ACCOUNT_LAST4
        return last4
    
    def _resolve_transaction_direction(self, db: Session, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Resolve transaction direction based on known accounts.
        
        For internal transfers where transaction_type isn't set:
        - If destination is known but source unknown → CREDIT to destination
        - If source is known but destination unknown → DEBIT from source
        - If both known → DEBIT (assuming user sent money)
        - If neither known → keep as-is (will go to pending_action)
        """
        import crud
        
        # Only apply if transaction_type is not already set
        if result.get('transaction_type'):
            return result
        
        source_last4 = result.get('source_account_last4')
        dest_last4 = result.get('destination_account_last4')
        
        # Check which accounts are known
        source_account = None
        dest_account = None
        
        if source_last4:
            source_account = crud.get_account_by_last_4(db, source_last4)
        if dest_last4:
            dest_account = crud.get_account_by_last_4(db, dest_last4)
        
        logger.info(f"[{self.BANK_NAME}] Account resolution: source={source_last4}->{'KNOWN' if source_account else 'UNKNOWN'}, "
                   f"dest={dest_last4}->{'KNOWN' if dest_account else 'UNKNOWN'}")
        
        if dest_account and not source_account:
            # Destination is known, source is unknown → Credit to destination
            result['transaction_type'] = 'credit'
            # Swap fields so destination becomes the primary account
            result['destination_account_last4'] = dest_last4
            result['source_account_last4'] = None  # Unknown external source
            logger.info(f"[{self.BANK_NAME}] Resolved as CREDIT to known account {dest_last4}")
        
        elif source_account and not dest_account:
            # Source is known, destination is unknown → Debit from source
            result['transaction_type'] = 'debit'
            logger.info(f"[{self.BANK_NAME}] Resolved as DEBIT from known account {source_last4}")
        
        elif source_account and dest_account:
            # Both known → Internal transfer, treat as debit from source
            result['transaction_type'] = 'debit'
            logger.info(f"[{self.BANK_NAME}] Both accounts known - treating as DEBIT from {source_last4}")
        
        else:
            # Neither known → Default to debit, will go to pending_action
            result['transaction_type'] = 'debit'
            logger.info(f"[{self.BANK_NAME}] Neither account known - defaulting to DEBIT")
        
        return result
