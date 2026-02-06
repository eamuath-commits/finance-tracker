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
