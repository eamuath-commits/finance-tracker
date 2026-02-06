# backend/bank_parsers/alrajhi.py
"""
AlRajhi Bank SMS parser.
Handles AlRajhi-specific SMS formats and transaction patterns.
"""
from typing import Dict, Any
from .base import BaseBankParser


class AlRajhiParser(BaseBankParser):
    """
    Parser for AlRajhi Bank SMS messages.
    
    AlRajhi SMS Patterns:
    - PoS (Point of Sale) purchases
    - Credit/Debit transfers
    - Incoming transfers (SADAD, SARIE)
    - Balance updates
    
    Date Format: YY/M/DD HH:MM or DD/M/YY HH:MM
    """
    
    BANK_NAME = "AlRajhi"
    
    # No default account for AlRajhi - SMS always contains account info
    DEFAULT_ACCOUNT_LAST4 = None
    
    # AlRajhi-specific prompt (uses default for now, can be customized)
    PROMPT = ""  # Uses sms_agent default which is already AlRajhi-optimized
    
    def post_process(self, result: Dict[str, Any], sms_text: str) -> Dict[str, Any]:
        """
        AlRajhi-specific post-processing.
        """
        # Set source bank
        result['source_bank'] = 'AlRajhi'
        
        # Handle internal transfers between AlRajhi accounts
        if 'Transfer Between Your Accounts' in sms_text:
            result['sub_type'] = 'internal_transfer'
        
        # Handle credit card payments
        if 'Credit Card Payment' in sms_text:
            result['sub_type'] = 'credit_card_payment'
        
        return result
    
    def handle_ambiguous(self, result: Dict[str, Any], sms_text: str) -> Dict[str, Any]:
        """
        Handle ambiguous AlRajhi transactions.
        
        Example: "Transfer Between Your Accounts" could be debit or credit
        depending on the "To:" or "From:" context.
        """
        sms_lower = sms_text.lower()
        
        # If "to:" appears before "from:", it's a credit to that account
        to_pos = sms_lower.find('to:')
        from_pos = sms_lower.find('from:')
        
        if to_pos != -1 and from_pos != -1:
            if to_pos < from_pos:
                result['transaction_type'] = 'credit'
            else:
                result['transaction_type'] = 'debit'
        
        # Clear ambiguous flag after resolution
        result.pop('ambiguous', None)
        
        return result
