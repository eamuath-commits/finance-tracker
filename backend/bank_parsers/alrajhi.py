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
        import re
        
        # Set source bank
        result['source_bank'] = 'AlRajhi'
        
        # Handle internal transfers between AlRajhi accounts
        if 'Transfer Between Your Accounts' in sms_text:
            result['sub_type'] = 'internal_transfer'
        
        # Handle credit card payments
        if 'Credit Card Payment' in sms_text:
            result['sub_type'] = 'credit_card_payment'
        
        # --- ENFORCE From/To account mapping from SMS text ---
        # The AI sometimes swaps source_account_last4 and destination_account_last4.
        # The SMS text is the source of truth: "From:XXXX" = source, "To:XXXX" = destination.
        
        # Extract all From: and To: values (last 4 digits)
        from_matches = re.findall(r'From:\s*(\d{4})', sms_text)
        to_matches = re.findall(r'To:\s*(\d{4})', sms_text)
        
        # For debit transfers: From = source (your account being debited), To = destination
        if result.get('transaction_type') == 'debit' and result.get('sub_type') in ('transfer', 'internal_transfer'):
            if from_matches:
                result['source_account_last4'] = from_matches[0]
            if to_matches:
                result['destination_account_last4'] = to_matches[0]
        
        # For credit transfers: To = your account being credited, From = sender's account
        elif result.get('transaction_type') == 'credit' and result.get('sub_type') in ('transfer', 'internal_transfer'):
            if to_matches:
                result['destination_account_last4'] = to_matches[0]
            if from_matches:
                result['source_account_last4'] = from_matches[0]
        
        # Also extract from By:XXXX pattern (PoS/purchases)
        by_match = re.search(r'By:\s*(\d{4})', sms_text)
        if by_match and result.get('sub_type') in ('purchase', 'pos', 'online', 'atm'):
            result['source_account_last4'] = by_match.group(1)
        
        # --- FIX TIMESTAMP: AlRajhi uses DD/M/YY HH:MM format ---
        # The AI often misinterprets this as MM/DD/YY, swapping month and day.
        # Re-parse the raw date from SMS text to ensure correct day-first interpretation.
        # Patterns: "12/6/26 21:21" or "Date:14/4/26 06:32" or "6/6/26 14:37"
        date_match = re.search(r'(?:Date:)?\s*(\d{1,2}/\d{1,2}/\d{2})\s+(\d{1,2}:\d{2})', sms_text)
        if date_match:
            try:
                from dateutil import parser as date_parser
                raw_date_str = f"{date_match.group(1)} {date_match.group(2)}"
                # Parse with dayfirst=True since AlRajhi format is DD/M/YY
                parsed_dt = date_parser.parse(raw_date_str, dayfirst=True)
                # Fix 2-digit year: dateutil may interpret "26" as 2026 or 1926
                if parsed_dt.year < 2000:
                    parsed_dt = parsed_dt.replace(year=parsed_dt.year + 100)
                result['timestamp'] = parsed_dt.strftime('%Y-%m-%d %H:%M')
            except Exception:
                pass  # Keep AI's timestamp if parsing fails
        
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
