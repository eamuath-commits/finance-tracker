# backend/bank_parsers/jazira.py
"""
Bank Al Jazira (BJAZ) SMS parser.
Handles Jazira-specific SMS formats and transaction patterns.

CC Payment comes as TWO separate SMS messages:
  SMS 1: "Credit Card Payment Confirmation / To: Credit Card: 4897 / of SAR X / Available Balance..."
    → CREDIT on CC 4897 (payment applied to card, reduces debt)
  SMS 2: "Credit Card: Payment / Card: 4897;Credit Card / Amount: SAR X / From: 8001"
    → DEBIT from account 8001 (money leaves bank account)
"""
import re
import logging
from typing import Dict, Any, Optional
from .base import BaseBankParser

logger = logging.getLogger("bank_parsers.jazira")


class JaziraParser(BaseBankParser):
    """
    Parser for Bank Al Jazira SMS messages.
    
    Key Patterns:
    - "Credit Card Payment Confirmation" → CC payment received (CREDIT on CC)
    - "Credit Card: Payment" → Money left bank account (DEBIT from account)
    - "POS Purchase (Apple Pay)" → Purchase (DEBIT)
    - "Internet Purchase" → Online purchase (DEBIT)
    - "Credit transfer: Local / Internal" → Incoming transfer (CREDIT)
    - "Outgoing Funds Transfer Approved" → Transfer out (DEBIT)
    - "Debit transfer: Loan Instalment" → Loan payment (DEBIT)
    - "Internet Purchase Reversal" → Refund (CREDIT)
    """
    
    BANK_NAME = "Jazira"
    DEFAULT_ACCOUNT_LAST4 = None
    
    PROMPT = '''You are a transaction parsing assistant specialized in Bank Al Jazira (BJAZ) SMS messages.

**CRITICAL: TWO types of Credit Card Payment SMS exist. Handle them DIFFERENTLY:**

**Type A: "Credit Card Payment Confirmation"** (CC side - payment received by the card)
- This confirms payment was received ON the credit card
- transaction_type = "credit" (money INTO the card = reduces debt)
- sub_type = "cc_payment"
- The card number is after "To: Credit Card:" → put in source_account_last4 (this IS the CC)
- "Available Balance" is the CC available credit after payment
- source_account_last4 = card last4 (the credit card receiving payment)

**Type B: "Credit Card: Payment"** (Bank account side - money left account)
- This confirms money LEFT the bank account to pay a CC
- transaction_type = "debit" (money OUT of bank account)
- sub_type = "cc_payment"  
- "From: XXXX" = source_account_last4 (the bank account being debited)
- "Card: XXXX;Credit Card" = info about which CC was paid (put in card_info only)

**Other Transaction Types:**
- "POS Purchase" / "POS Purchase (Apple Pay)" → DEBIT, sub_type: purchase
- "Internet Purchase" / "Online Purchase Apple Pay" → DEBIT, sub_type: purchase
- "Outgoing Funds Transfer Approved" → DEBIT, sub_type: transfer
- "Credit transfer: Local" / "Credit transfer Internal" → CREDIT, sub_type: transfer
- "Debit transfer: Loan Instalment" → DEBIT, sub_type: loan
- "Internet Purchase Reversal" → CREDIT, sub_type: refund

**Account Extraction:**
- "Card: XXXX;mada" → source_account_last4 = XXXX (debit card)
- "Card: XXXX;Credit Card" → card_info reference only
- "From: XXXX" → source_account_last4
- "To: XXXX" → destination_account_last4
- "To: Credit Card: XXXX" → source_account_last4 = XXXX (the CC receiving payment)

**Date Format:** YYYY-MM-DD HH:MM

**OUTPUT JSON:**
{
  "is_financial_event": boolean,
  "is_transaction": boolean,
  "transaction_type": "debit" | "credit",
  "sub_type": "purchase" | "transfer" | "cc_payment" | "loan" | "refund" | "internal_transfer",
  "source_bank": "Jazira",
  "source_account_last4": stringOrNull,
  "destination_account_last4": stringOrNull,
  "card_info": stringOrNull,
  "amount": number,
  "currency": string,
  "fees": numberOrNull,
  "timestamp": "YYYY-MM-DD HH:MM",
  "available_balance": numberOrNull,
  "merchant": stringOrNull,
  "category": stringOrNull,
  "description": stringOrNull
}

**EXAMPLES:**

1. CC Payment Confirmation (Type A - credit card side):
   Input: "Credit Card Payment Confirmation\\nTo: Credit Card: 4897\\nof SAR 22871.84\\non 2026-02-07 19:12\\nAvailable Balance is 33631.64 SAR"
   Output: {"is_financial_event":true,"is_transaction":true,"transaction_type":"credit","sub_type":"cc_payment","source_bank":"Jazira","source_account_last4":"4897","amount":22871.84,"currency":"SAR","available_balance":33631.64,"timestamp":"2026-02-07 19:12","merchant":"CC Payment","category":"Payment","description":"Credit card payment confirmation"}

2. CC Payment from Account (Type B - bank account side):
   Input: "Credit Card: Payment\\nCard: 4897;Credit Card\\nAmount: SAR 22,871.84\\nFrom: 8001\\nDate: 2026-02-07 19:12"
   Output: {"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"cc_payment","source_bank":"Jazira","source_account_last4":"8001","card_info":"Credit Card 4897","amount":22871.84,"currency":"SAR","timestamp":"2026-02-07 19:12","merchant":"CC Payment","category":"Credit Card Payment","description":"Credit card payment from account 8001"}

3. POS Purchase:
   Input: "POS Purchase (Apple Pay)\\nCard: 8001;mada\\nAmount: SAR 50.00\\nAt: STARBUCKS\\nDate: 2026-02-07 10:30"
   Output: {"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"purchase","source_bank":"Jazira","source_account_last4":"8001","card_info":"mada 8001","amount":50.0,"currency":"SAR","timestamp":"2026-02-07 10:30","merchant":"STARBUCKS","category":"Food & Dining","description":"POS purchase at STARBUCKS"}

Respond ONLY with valid JSON.
'''

    def post_process(self, result: Dict[str, Any], sms_text: str) -> Dict[str, Any]:
        """
        Jazira-specific post-processing.
        """
        result['source_bank'] = 'Jazira'
        
        sms_lower = sms_text.lower()
        
        # --- TYPE A: "Credit Card Payment Confirmation" → CREDIT on CC ---
        if 'credit card payment confirmation' in sms_lower:
            result['transaction_type'] = 'credit'
            result['sub_type'] = 'cc_payment'
            result['category'] = 'Payment'
            result['merchant'] = result.get('merchant') or 'CC Payment'
            
            # Extract CC number: "To: Credit Card: 4897"
            cc_match = re.search(r'To:\s*Credit\s*Card:\s*(\d{4})', sms_text, re.IGNORECASE)
            if cc_match:
                result['source_account_last4'] = cc_match.group(1)
            
            # Extract available balance
            bal_match = re.search(r'Available\s*Balance\s*(?:is\s*)?(\d[\d,]*\.?\d*)', sms_text, re.IGNORECASE)
            if bal_match:
                result['available_balance'] = float(bal_match.group(1).replace(',', ''))
            
            logger.info(f"[Jazira] CC Payment Confirmation: Credit to CC {result.get('source_account_last4')}")
        
        # --- TYPE B: "Credit Card: Payment" → DEBIT from bank account ---
        elif 'credit card' in sms_lower and 'payment' in sms_lower:
            result['transaction_type'] = 'debit'
            result['sub_type'] = 'cc_payment'
            result['category'] = 'Credit Card Payment'
            result['merchant'] = result.get('merchant') or 'CC Payment'
            
            # Extract card info (Card: XXXX;Credit Card) - just info, not source
            card_match = re.search(r'Card:\s*(\d{4})\s*;?\s*Credit\s*Card', sms_text, re.IGNORECASE)
            if card_match:
                result['card_info'] = f"Credit Card {card_match.group(1)}"
                # Don't set as source - the funding account (From:) is the source
            
            # Extract funding account (From: XXXX) - THIS is the source
            from_match = re.search(r'From:\s*(\d{4})', sms_text, re.IGNORECASE)
            if from_match:
                result['source_account_last4'] = from_match.group(1)
            
            logger.info(f"[Jazira] CC Payment Debit: From account {result.get('source_account_last4')}")
        
        # Loan instalment
        elif 'loan instalment' in sms_lower:
            result['transaction_type'] = 'debit'
            result['sub_type'] = 'loan'
            result['category'] = 'Loan'
        
        # POS Purchase
        elif 'pos purchase' in sms_lower:
            result['transaction_type'] = 'debit'
            result['sub_type'] = 'purchase'
        
        # Internet Purchase
        elif 'internet purchase reversal' in sms_lower:
            result['transaction_type'] = 'credit'
            result['sub_type'] = 'refund'
        elif 'internet purchase' in sms_lower or 'online purchase' in sms_lower:
            result['transaction_type'] = 'debit'
            result['sub_type'] = 'purchase'
        
        # Credit transfer (incoming)
        elif 'credit transfer' in sms_lower:
            result['transaction_type'] = 'credit'
            result['sub_type'] = 'transfer'
            
            # Extract Sender Name (marks this as EXTERNAL, not internal transfer)
            sender_match = re.search(r'Sender\s*Name:\s*(.+?)(?:\n|$)', sms_text, re.IGNORECASE)
            if sender_match:
                result['sender_name'] = sender_match.group(1).strip()
            
            # Extract Sender Bank
            sender_bank_match = re.search(r'Sender\s*Bank:\s*(.+?)(?:\n|$)', sms_text, re.IGNORECASE)
            if sender_bank_match:
                result['sender_bank'] = sender_bank_match.group(1).strip()
            
            # Extract destination account (To: XXXX)
            to_match = re.search(r'To:\s*(\d{4})', sms_text, re.IGNORECASE)
            if to_match:
                result['destination_account_last4'] = to_match.group(1)
            
            logger.info(f"[Jazira] Credit transfer to {result.get('destination_account_last4')} from {result.get('sender_name', 'unknown')}")
        
        # Outgoing transfer
        elif 'outgoing funds transfer' in sms_lower:
            result['transaction_type'] = 'debit'
            result['sub_type'] = 'transfer'
        
        return result
