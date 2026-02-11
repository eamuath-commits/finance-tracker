# backend/bank_parsers/default.py
"""
Default SMS parser for unknown banks.
Uses the standard AI parsing without bank-specific optimizations.
"""
from .base import BaseBankParser


class DefaultParser(BaseBankParser):
    """
    Default parser for unknown or unsupported banks.
    Uses the standard sms_agent prompt.
    """
    
    BANK_NAME = "Unknown"
    
    # No custom prompt - uses sms_agent default
    PROMPT = ""
    
    # No default account for unknown banks
    DEFAULT_ACCOUNT_LAST4 = None
