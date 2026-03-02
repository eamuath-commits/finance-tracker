# backend/bank_parsers/stc.py
"""
STC Bank SMS parser.
Handles STC Bank-specific SMS formats and transaction patterns.
"""
import re
from typing import Dict, Any, Optional
from .base import BaseBankParser


class STCParser(BaseBankParser):
    """
    Parser for STC Bank SMS messages.
    
    STC SMS Patterns:
    - Inward transfer (SARIE) - Credit from other bank
    - Adding money to account - Deposit
    - Internal transfer - Transfer to STC user
    - Transfer via WU - Western Union
    - Outcome Transfer to Sponsored - Musaned payment
    - Purchase (Apple Pay, Online, card) - Debits
    - Reverse - Refunds
    
    Date Formats:
    - DD-MM-YYYY HH:MM (e.g., 31-07-2025 10:43)
    - DD/MM/YY HH:MM (e.g., 16/07/25 07:20)
    - DD/MM/YYYY HH:MM (e.g., 07/09/2025 14:20)
    
    Note: STC SMS often doesn't specify account - uses default 0863
    """
    
    BANK_NAME = "STC"
    
    # Default STC account - used when SMS doesn't specify account
    DEFAULT_ACCOUNT_LAST4 = "0863"
    
    # STC-specific prompt with STC examples
    PROMPT = '''You are a transaction parsing assistant specialized in STC Bank SMS.

TASK: Parse STC Bank SMS into structured JSON.

STC TRANSACTION TYPES:
- "Inward transfer (SARIE)" = credit from other bank
- "Adding money to account" = credit (deposit)
- "Internal transfer" = debit to STC user
- "Transfer via WU" = debit (Western Union)
- "Outcome Transfer to Sponsored" = debit (Musaned payment)
- "*XXXX Purchase" or "Apple Pay Purchase" = debit (purchase)
- "Online Purchase" = debit (e-commerce)
- "Reverse" = credit (refund)

STC DATE FORMATS (convert to YYYY-MM-DD HH:MM):
- DD-MM-YYYY HH:MM (e.g., 31-07-2025 10:43)
- DD/MM/YY HH:MM (e.g., 16/07/25 07:20)
- DD/MM/YYYY HH:MM (e.g., 07/09/2025 14:20)

MERCHANT NAME RESOLUTION:
SMS often truncates or uses legal entity names. If you recognize the brand, output the FULL brand name and domain:
- "HUNGERSTATION LLC" → brand_name: "HungerStation", brand_domain: "hungerstation.com"
- "HUNGERSTA" → brand_name: "HungerStation", brand_domain: "hungerstation.com"
- "GOT COOKIES" or "GOT COOKI" → brand_name: "Got Cookie", brand_domain: null
- "STARBUCKS" → brand_name: "Starbucks", brand_domain: "starbucks.com"
- "AMAZON" → brand_name: "Amazon", brand_domain: "amazon.sa"
- "JARIR" → brand_name: "Jarir Bookstore", brand_domain: "jarir.com"
- "TAMIMI" or "TAMIMI MARKETS" → brand_name: "Tamimi Markets", brand_domain: "tamimimarkets.com"
If you don't recognize the brand, set brand_name and brand_domain to null.
The "merchant" field should contain the EXACT text from the SMS (raw).

EXAMPLES:

SMS: "Inward transfer (SARIE)
1.00 SAR
From MUATH ALASIRI
From AL RAJHI BANK
Account *863
31-07-2025 10:43
Ref. No. *15XP"
JSON: {"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "sarie_transfer", "source_bank": "AL RAJHI BANK", "destination_account_last4": "0863", "amount": 1.0, "currency": "SAR", "sender_name": "MUATH ALASIRI", "timestamp": "2025-07-31 10:43", "category": "Income"}

SMS: "Apple Pay Purchase
Via: *8574
Amount: 32.64 SAR
From: HUNGERSTATION LLC
At: 16/07/25 07:20"
JSON: {"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "card_info": "Apple Pay 8574", "source_account_last4": "8574", "amount": 32.64, "currency": "SAR", "merchant": "HUNGERSTATION LLC", "brand_name": "HungerStation", "brand_domain": "hungerstation.com", "timestamp": "2025-07-16 07:20", "category": "Food & Dining"}

SMS: "Internal transfer
Amount:5000.00SAR
To:MUATH ALASWADI
At:19/08/25 08:58"
JSON: {"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "amount": 5000.0, "currency": "SAR", "beneficiary": "MUATH ALASWADI", "timestamp": "2025-08-19 08:58", "category": "Transfer"}

SMS: "Transfer via WU
Amount:1,875.00 SAR
Fees:0.00 SAR
MTCN:0981555392
Receiver:Mae Barquilla
Account:*253
Country:Philippines
At:20/09/25 09:39"
JSON: {"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "western_union", "amount": 1875.0, "currency": "SAR", "fees": 0.0, "beneficiary": "Mae Barquilla", "destination_account_last4": "0253", "timestamp": "2025-09-20 09:39", "category": "Transfer", "description": "Western Union to Philippines"}

SMS: "Reverse
To: ***6070; Apple Pay
Amount: 7 SAR
At: GOT COOKIES
Date: 16/07/25 12:24"
JSON: {"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "refund", "card_info": "Apple Pay 6070", "destination_account_last4": "6070", "amount": 7.0, "currency": "SAR", "merchant": "GOT COOKIES", "brand_name": "Got Cookie", "brand_domain": null, "timestamp": "2025-07-16 12:24", "category": "Refund"}

SMS: "Outcome Transfer to Sponsored 
Amount:1900.00SAR 
To:MOHAMMED ISLAM 
Acc:1386* 
At:02/02/26 09:06"
JSON: {"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "sponsored_transfer", "amount": 1900.0, "currency": "SAR", "beneficiary": "MOHAMMED ISLAM", "source_account_last4": "1386", "timestamp": "2026-02-02 09:06", "category": "Transfer", "merchant": "MOHAMMED ISLAM"}

Now parse this SMS:
'''
    
    def post_process(self, result: Dict[str, Any], sms_text: str) -> Dict[str, Any]:
        """
        STC-specific post-processing.
        """
        result['source_bank'] = 'STC Bank'
        
        # Detect transaction sub-types from SMS patterns
        sms_lower = sms_text.lower()
        
        if 'inward transfer (sarie)' in sms_lower:
            result['sub_type'] = 'sarie_transfer'
            result['transaction_type'] = 'credit'
        elif 'adding money to account' in sms_lower:
            result['sub_type'] = 'deposit'
            result['transaction_type'] = 'credit'
        elif 'transfer between my accounts' in sms_lower:
            # Internal STC transfer - resolve direction based on known accounts
            result['sub_type'] = 'internal_transfer'
            result['transaction_type'] = None  # Clear to trigger smart resolution
        elif 'internal transfer' in sms_lower:
            result['sub_type'] = 'internal_transfer'
            result['transaction_type'] = 'debit'
        elif 'transfer via wu' in sms_lower:
            result['sub_type'] = 'western_union'
            result['transaction_type'] = 'debit'
        elif 'outcome transfer to sponsored' in sms_lower:
            result['sub_type'] = 'sponsored_transfer'
            result['transaction_type'] = 'debit'
        elif 'reverse' in sms_lower:
            result['sub_type'] = 'refund'
            result['transaction_type'] = 'credit'
        elif 'purchase' in sms_lower:
            result['sub_type'] = 'purchase'
            result['transaction_type'] = 'debit'
        
        # Extract card/account from Via: pattern
        via_match = re.search(r'Via:\s*\*?(\d{4})', sms_text, re.IGNORECASE)
        if via_match:
            card_last4 = via_match.group(1)
            result['card_info'] = f"STC Card {card_last4}"
            result['source_account_last4'] = card_last4
        
        # Extract account from Account *XXX pattern
        account_match = re.search(r'Account\s*\*?(\d{3,4})', sms_text, re.IGNORECASE)
        if account_match:
            account_digits = account_match.group(1)
            # Pad to 4 digits if needed
            if len(account_digits) == 3:
                account_digits = '0' + account_digits
            if result.get('transaction_type') == 'credit':
                result['destination_account_last4'] = account_digits
            else:
                result['source_account_last4'] = account_digits
        
        # Extract beneficiary from To: pattern (for transfers)
        to_match = re.search(r'To:\s*(.+?)\s*(?:\n|Acc:|At:|$)', sms_text, re.IGNORECASE)
        if to_match:
            beneficiary = to_match.group(1).strip()
            if beneficiary:
                result['beneficiary'] = beneficiary
                # For transfers, set merchant to beneficiary name if not already set
                if not result.get('merchant') or result.get('merchant') == 'CC Payment':
                    result['merchant'] = beneficiary
        
        # Extract account from Acc: pattern (e.g., Acc:1386*)
        acc_match = re.search(r'Acc:\s*([\d]+)', sms_text, re.IGNORECASE)
        if acc_match:
            acc_digits = acc_match.group(1)
            if len(acc_digits) == 3:
                acc_digits = '0' + acc_digits
            result['source_account_last4'] = acc_digits
        
        return result
    
    def _parse_stc_date(self, date_str: str) -> Optional[str]:
        """
        Parse STC date formats to standard YYYY-MM-DD HH:MM.
        
        Formats:
        - DD-MM-YYYY HH:MM
        - DD/MM/YY HH:MM
        - DD/MM/YYYY HH:MM
        """
        import re
        from datetime import datetime
        
        patterns = [
            (r'(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})', '%d-%m-%Y %H:%M'),
            (r'(\d{2})/(\d{2})/(\d{2})\s+(\d{2}):(\d{2})', '%d/%m/%y %H:%M'),
            (r'(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2})', '%d/%m/%Y %H:%M'),
        ]
        
        for pattern, fmt in patterns:
            match = re.search(pattern, date_str)
            if match:
                try:
                    dt = datetime.strptime(match.group(0), fmt)
                    return dt.strftime('%Y-%m-%d %H:%M')
                except ValueError:
                    continue
        
        return None
