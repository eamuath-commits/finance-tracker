import logging
import os
import json
import re
import asyncio
from datetime import datetime, timedelta
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, CommandHandler, MessageHandler, filters
from sqlalchemy.orm import Session
import google.generativeai as genai

import database
import models
import crud
import schemas
from exchange_rate_service import exchange_rate_service

# Logging Setup
logger = logging.getLogger("sms_agent")
logger.setLevel(logging.INFO)
current_dir = os.path.dirname(os.path.abspath(__file__))
file_handler = logging.FileHandler(os.path.join(current_dir, "sms_agent.log"))
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# Special Logger for raw Gemini I/O
ai_logger = logging.getLogger("ai_raw_io")
ai_logger.setLevel(logging.INFO)
ai_file_handler = logging.FileHandler(os.path.join(current_dir, "gemini_responses.log"))
ai_file_handler.setFormatter(formatter)
ai_logger.addHandler(ai_file_handler)

# SMS Log - Raw incoming messages for debugging and review
sms_logger = logging.getLogger("sms_raw")
sms_logger.setLevel(logging.INFO)
sms_file_handler = logging.FileHandler(os.path.join(current_dir, "sms_messages.log"))
sms_file_handler.setFormatter(logging.Formatter('%(asctime)s | %(message)s'))
sms_logger.addHandler(sms_file_handler)

def extract_sms_sender(msg_text: str) -> str:
    """
    Extract the SMS sender name from the end of the message text.
    
    Messages typically end with a timestamp followed by the sender name, e.g.:
    - "28/1/26 11:03AlRajhiBank"
    - "2026-01-27 10:48Jazira Bank"
    - "28/1/26 11:05+966566985112"
    
    Returns the extracted sender name or "Unknown" if not found.
    """
    import re
    
    # Known bank/sender patterns to look for at the end of message
    known_senders = [
        'AlRajhiBank', 'Rajhi Bank', 'Al Rajhi Bank',
        'SNB', 'Saudi National Bank', 'Alahli Bank', 'Al Ahli Bank',
        'Jazira Bank', 'Bank AlJazira', 'Al Jazira Bank',
        'STC Bank', 'stc bank', 'STC Pay', 'stc pay',
        'Riyad Bank', 'SABB', 'Banque Saudi Fransi', 'BSF',
        'Alinma Bank', 'Al Bilad Bank', 'Bank Albilad',
        'Gulf Bank', 'ANB', 'Arab National Bank'
    ]
    
    # Check if message ends with a known sender (after timestamp)
    for sender in known_senders:
        if msg_text.rstrip().endswith(sender):
            return sender
    
    # Pattern 1: Match timestamp followed by sender at end of message
    # e.g., "28/1/26 11:03AlRajhiBank" or "27/1/26 22:54AlRajhiBank"
    pattern1 = r'\d{1,2}/\d{1,2}/\d{2,4}\s+\d{1,2}:\d{2}([A-Za-z][A-Za-z\s]+(?:Bank)?)\s*$'
    match = re.search(pattern1, msg_text)
    if match:
        return match.group(1).strip()
    
    # Pattern 2: Match phone number at end (e.g., "+966566985112")
    pattern2 = r'(\+\d{10,15})\s*$'
    match = re.search(pattern2, msg_text)
    if match:
        return match.group(1).strip()
    
    # Pattern 3: Bank name at very end after any text (more flexible)
    pattern3 = r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*Bank)\s*$'
    match = re.search(pattern3, msg_text)
    if match:
        return match.group(1).strip()
    
    return "Unknown"

# --- Configuration ---
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# Gemini Setup
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL)
        logger.info(f"Gemini AI Configured Successfully (Model: {GEMINI_MODEL}).")
    except Exception as e:
        logger.error(f"Failed to configure Gemini AI: {e}")
        model = None
else:
    logger.warning("GEMINI_API_KEY not found. AI features disabled.")
    model = None

async def parse_with_ai(db: Session, text: str):
    """
    Sends SMS text to Gemini AI and expects a JSON response.
    Retries on 429 errors.
    """
    if not model:
        return {"error": "AI_NOT_CONFIGURED"}

    today_date = datetime.now().strftime("%Y-%m-%d")
    year_short = datetime.now().strftime("%y")
    current_year = datetime.now().year

    # Fetch Training Examples (Smart Memory)
    examples = crud.get_similar_training_examples(db, text, limit=3)
    if not examples:
        examples = crud.get_random_training_examples(db, limit=3)
    examples_text = ""
    if examples:
        examples_text = "**Examples (Learn from these successful parses):**\n"
        for ex in examples:
            examples_text += f"- Input: \"{ex.raw_text}\"\n  Output: {ex.parsed_json}\n\n"

    # Fetch User Accounts (Context Injection)
    # We strip sensitive info, keeping Name, Bank, and Last 4 digits for matching.
    user_accounts = db.query(models.Account).all()
    accounts_context = []
    for acc in user_accounts:
        accounts_context.append({
            "name": acc.name,
            "bank_name": acc.bank_name,
            "last_4_digits": acc.last_4_digits,
            "id": acc.id # ID is internal, AI doesn't need it but good for debugging if we logged it. actually AI doesn't need UUID.
        })
    
    accounts_json_str = json.dumps(accounts_context, indent=2)

    prompt = f"""
    You are a highly intelligent financial AI assistant. Your task is to extract structured banking transaction data from SMS messages.
    
    **CRITICAL CONTEXT: USER'S EXISTING ACCOUNTS**
    You must use this list to determine if a mentioned account is INTERNAL (User's own) or EXTERNAL.
    {accounts_json_str}

    **Input SMS**: "{text}"
    **Current Context**: Date={today_date}, Year={current_year}, Location=Saudi Arabia.
    **Input Format**: Message might start with "Sender: [BankName]". Use this to strictly identify the SOURCE BANK.

    **EXTRACTION RULES (Strict Logic)**:
    1.  **Identify Transaction Type**:
        -   **Transfer**: Movement of funds between accounts. Includes "Credit Transfer" (Incoming) and "Outgoing Transfer" (Outgoing).
        -   **Purchase**: POS, Online Purchase (Card Usage).
        -   **Bill Payment**: SADAD, Utility bills.
        -   **Withdrawal**: Cash from ATM.
        -   **Deposit**: Cash/Check deposit.
        -   **Decline**: Failed transaction.
    
    2.  **Strict Field Extraction**:
        -   **Source Bank**: The bank sending the money. Usually identified by "Sender: [Name]" or matching known account bank names.
        -   **Destination Bank**: The bank receiving the money.
        -   **Source Account**: The account money is LEAVING. 
            -   Matches `last_4_digits` in User Accounts List? -> **Type: INTERNAL**.
            -   Extracted digits (e.g. 8001)? 
            -   **Tip**: If SMS says "By: 9365" or "Card: 9365", then 9365 IS the Source Account. 
        -   **Destination Account**: The account money is ENTERING.
            -   Matches `last_4_digits` in User Accounts List? -> **Type: INTERNAL**.
            -   Extracted Digits/IBAN (e.g. 7772)?
        -   **Beneficiary**: The NAME of the person/entity receiving money (External).
        -   **Merchant**: The store/service name (for Purchases).
        -   **Sender Name**: The NAME of the person sending money (for Incoming Transfers).

    3.  **Logical Rules**:
        -   **To/From Logic (CRITICAL)**:
            -   "To: 1234" -> 1234 is **Destination Account**.
            -   "From: 1234" -> 1234 is **Source Account**.
            -   **Ambiguous Internal Transfer**: If text says "Transfer Between Your Accounts" and ONLY "To: 1234" is found (where 1234 is a User Account):
                -   Treat as **CREDIT** (Incoming to 1234).
                -   Source is Unknown.
        -   **Internal Detection**: If an extracted account number (Source/Dest) matches the "User's Existing Accounts" list, mark it as INTERNAL.
        -   **Direction**: 
            -   "Outgoing" / "Debit" / "Purchase" -> Money LEAVES Source Account. (Transaction Type: DEBIT).
            -   "Credit" / "Deposit" / "Credit Card Payment" -> Money ENTERS Destination Account. (Transaction Type: CREDIT).
            -   **NOTE**: A "Credit Card Payment" or "Payment to Card" is money being PAID into the card, thus it is a **CREDIT**. It is a repayment of debt, NOT a purchase.
        -   **Merchant/Counterparty Logic for UI**:
            -   If Purchase: Merchant = Store Name.
            -   If Transfer TO Output (Debit): Merchant = Beneficiary Name OR Destination Account Digits.
            -   If Transfer FROM Input (Credit): Merchant = Sender Name OR Source Account Digits.
            -   **Internal Transfer**: If BOTH Source and Dest are INTERNAL (found in DB list), set `sub_type`="internal_transfer".

    **OUTPUT JSON SCHEMA (Strict)**:
    {{
      "is_financial_event": boolean,
      "is_transaction": boolean,
      "transaction_type": "debit" | "credit",
      "sub_type": "purchase" | "transfer" | "payment" | "withdrawal" | "deposit" | "internal_transfer" | "decline",
      "source_bank": stringOrNull,
      "destination_bank": stringOrNull,
      "source_account_last4": stringOrNull,
      "destination_account_last4": stringOrNull,
      "card_info": stringOrNull, (e.g. "mada x8438"),
      "amount": number,
      "currency": string, (e.g. "USD", "SAR", "EUR"),
      "fees": number,
      "timestamp": "YYYY-MM-DD HH:MM",
      "available_balance": numberOrNull,
      "beneficiary": stringOrNull, (Person receiving money),
      "merchant": stringOrNull, (Store or Entity),
      "sender_name": stringOrNull, (Person sending money),
      "description": stringOrNull, (A logical summary e.g. "Transfer to Muath")
    }}
    
    Respond ONLY with valid JSON.
    
    **Examples**:
    1. Input:
       AlrajhiBank
       Transfer Between Your Accounts
       Amount: SAR 22
       To: 1505
       26/1/24 2:19
       
       Output:
       {{
         "is_financial_event": true,
         "is_transaction": true,
         "transaction_type": "credit",
         "sub_type": "internal_transfer",
         "source_bank": "AlRajhiBank",
         "source_account_last4": null,
         "destination_account_last4": "1505",
         "amount": 22,
         "currency": "SAR",
         "description": "Transfer to 1505"
       }}

    2. Input:
       Credit Card:Payment
       Card:Visa 1234
       Amount:USD 800
       Balance:800 USD
       26/1/26 10:10

       Output:
       {{
         "is_financial_event": true,
         "is_transaction": true,
         "transaction_type": "credit",
         "sub_type": "payment",
         "source_bank": null,
         "destination_account_last4": "1234",
         "amount": 800,
         "currency": "USD",
         "description": "Credit Card Payment"
       }}

    3. Input:
       Credit Card:Payment
       Card:Visa 1234
       Amount:EUR 800
       Balance:800 EUR
       26/1/26 10:10

       Output:
       {{
         "is_financial_event": true,
         "is_transaction": true,
         "transaction_type": "credit",
         "sub_type": "payment",
         "source_bank": null,
         "destination_account_last4": "1234",
         "amount": 800,
         "currency": "EUR",
         "description": "Credit Card Payment"
       }}

    4. Input:
       PoS
       By:4390;mada-Atheer
       Amount:SAR 131
       At:SASCO Qen 
       26/1/26 10:52+966566985112

       Output:
       {{
         "is_financial_event": true,
         "is_transaction": true,
         "transaction_type": "debit",
         "sub_type": "purchase",
         "source_account_last4": "4390",
         "card_info": "mada-Atheer 4390",
         "amount": 131,
         "currency": "SAR",
         "merchant": "SASCO Qen",
         "description": "Purchase at SASCO Qen"
       }}
    """

    MAX_RETRIES = 5
    base_delay = 4
    
    for attempt in range(MAX_RETRIES + 1):
        try:
            # We use async generation if available, but the library might be sync. 
            # model.generate_content is synchronous blocking IO usually.
            # Ideally run in executor, but for now simple call.
            response = await asyncio.to_thread(model.generate_content, prompt)
            
            # Cleanup code blocks if AI wraps in ```json ... ```
            clean_text = response.text.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean_text)
            
            # Log to file
            ai_logger.info(f"INPUT: {text} || OUTPUT: {json.dumps(data)}")
            
            return data
            
        except Exception as e:
            error_str = str(e)
            if "429" in error_str and attempt < MAX_RETRIES:
                # Stop retrying if we hit the hard daily quota (Resource Exhausted) vs rate limit
                if "Quota exceeded" in error_str and "GenerateRequestsPerDay" in error_str:
                     logger.error("AI Daily Quota Exceeded. Stopping retries to save resources.")
                     return {"error": "Daily Quota Exceeded. Please try again tomorrow."}

                delay = base_delay * (2 ** attempt) # 4s, 8s, 16s...
                logger.warning(f"AI 429 Rate Limit. Retrying in {delay}s... (Attempt {attempt+1}/{MAX_RETRIES})")
                await asyncio.sleep(delay)
            else:
                logger.error(f"AI Parse Error: {e}")
                return {"error": str(e)}

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handles incoming Telegram messages (Private, Group, or Channel).
    """
    # Channel posts might not have an effective_user
    if update.effective_user:
        user_id = str(update.effective_user.id)
    else:
        user_id = f"Channel_{update.effective_chat.id}"

    # Use effective_message which works for both Message and ChannelPost
    message = update.effective_message
    if not message:
        logger.warning(f"Received update with no effective message: {update.update_id}")
        return

    # Extract text from Message (text) or Caption (if photo/media)
    msg_text = message.text or message.caption
    
    if not msg_text:
        logger.info(f"Received non-text message inside {user_id}: {message}")
        try:
            await message.reply_text("⚠️ Message received but contained no text/caption. Is it an image?")
        except Exception as e:
            logger.error(f"Could not reply to non-text message: {e}")
        return

    logger.info(f"Received message from {user_id}: {msg_text[:50]}...")
    # Log raw SMS to dedicated file
    sms_logger.info(f"FROM: {user_id} | SMS: {msg_text.replace(chr(10), ' | ')}")
    
    # --- OTP DETECTION: Skip OTP/Verification messages ---
    otp_keywords = ['otp', 'verification code', 'verify code', 'security code', 'one-time password', 
                    'one time password', 'رمز التحقق', 'رمز التفعيل', 'كود التحقق', 'verification pin',
                    'authentication code', 'login code', 'signin code', 'sign-in code', '2fa code']
    msg_lower = msg_text.lower()
    if any(kw in msg_lower for kw in otp_keywords):
        logger.info(f"Skipping OTP/verification message from {user_id}")
        try:
            await message.reply_text("⏭️ Skipped: OTP/verification message detected.")
        except Exception as e:
            logger.error(f"Could not reply: {e}")
        return
    
    try:
        await message.reply_text("⏳ Processing...")
    except Exception as e:
        logger.error(f"Could not send reply (likely channel restriction): {e}")

    # --- Parse Sender and Body from structured format ---
    # Expected format: "SENDER\n---\nBODY" or just "BODY" (legacy)
    sms_sender = None
    sms_body = msg_text
    
    if '\n---\n' in msg_text:
        # New structured format: sender first, then body
        parts = msg_text.split('\n---\n', 1)
        if len(parts) == 2:
            sms_sender = parts[0].strip()
            sms_body = parts[1].strip()
            logger.info(f"Parsed structured message - Sender: {sms_sender}")
    elif '---' in msg_text:
        # Also support single line separator
        parts = msg_text.split('---', 1)
        if len(parts) == 2 and len(parts[0].strip()) < 50:  # Sender should be short
            sms_sender = parts[0].strip()
            sms_body = parts[1].strip()
            logger.info(f"Parsed structured message (single line) - Sender: {sms_sender}")
    
    # Fallback: try to extract sender from end of message text
    if not sms_sender:
        sms_sender = extract_sms_sender(msg_text)
        if sms_sender != "Unknown":
            logger.info(f"Extracted sender from message text: {sms_sender}")

    try:
        db = database.SessionLocal()
        
        # DEDUPLICATION CHECK - DISABLED PER USER REQUEST (to allow testing)
        # existing_msg = db.query(models.RawMessage).filter(
        #     models.RawMessage.sender == f"Telegram-{user_id}",
        #     models.RawMessage.body == msg_text,
        #     models.RawMessage.status.in_([models.MessageStatus.PARSED, models.MessageStatus.PENDING])
        # ).first()
        #
        # if existing_msg:
        #      logger.info(f"Skipping duplicate message from {user_id} (ID: {existing_msg.id})")
        #      await message.reply_text("ℹ️ Skipped duplicate message.")
        #      db.close()
        #      return

        raw_msg = models.RawMessage(
            sender=sms_sender or "Unknown",
            body=sms_body,
            status=models.MessageStatus.PENDING,
            timestamp=datetime.now()
        )
        db.add(raw_msg)
        db.commit()
        db.refresh(raw_msg)
    except Exception as e:
        logger.error(f"CRITIAL DB ERROR during initial save: {e}", exc_info=True)
        try: await message.reply_text("❌ System Error: Database Write Failed. Check logs.")
        except: pass
        if 'db' in locals(): db.close()
        return

    # 1. AI Parse (use cleaned body, not full message with sender prefix)
    result = await parse_with_ai(db, sms_body)

    if "error" in result:
         try: await message.reply_text(f"❌ AI Error: {result['error']}")
         except: pass
         raw_msg.status = models.MessageStatus.FAILED
         raw_msg.error_log = result['error']
         db.commit()
         db.close()
         return

    if not result.get("is_financial_event"):
        try: await message.reply_text("ℹ️ Not a financial event. Ignored.")
        except: pass
        raw_msg.status = models.MessageStatus.FAILED 
        raw_msg.error_log = "AI determined not a financial event"
        db.commit()
        db.close()
        return

    # Check for Declines (status or sub_type)
    if result.get("status") == "failed" or result.get("sub_type") == "decline":
        try: 
            await message.reply_text(
                f"🚫 **Transaction Declined**\n"
                f"Merchant: {result.get('merchant')}\n"
                f"Amount: {result.get('amount')} {result.get('currency', 'SAR')}\n"
                f"Reason: Declined/Failed"
            )
        except: pass
        raw_msg.status = models.MessageStatus.PARSED 
        raw_msg.error_log = "Transaction Declined (Not added to ledger)"
        db.commit()
        db.close()
        return

    # 2. Save to DB (Only Success Transactions)
    try:
        # Determine Source Account OR Credit Card
        source_account = None
        source_credit_card = None
        
        # Heuristic: Try to find any account number in the result fields
        source_last4 = result.get('source_account_last4') or result.get('destination_account_last4')
        
        if source_last4:
            # Sanitize: Remove spaces, ensure only digits
            clean_source = "".join(filter(str.isdigit, str(source_last4)))
            if len(clean_source) >= 4:
                source_last4 = clean_source[-4:]
                # Check CREDIT CARDS first, then accounts
                source_credit_card = crud.get_credit_card_by_last4(db, source_last4)
                if source_credit_card:
                    logger.info(f"DEBUG: Source Logic -> Matched CREDIT CARD: {source_last4}, Card: {source_credit_card.name}")
                else:
                    source_account = crud.get_account_by_last_4(db, source_last4)
                    if source_account:
                        logger.info(f"DEBUG: Source Logic -> Matched Account: {source_last4}, Account: {source_account.name}")

        # Fallback: Check card_info for digits if source undefined (e.g. "By: 9365" or "mada x4390")
        if not source_account and not source_credit_card and result.get('card_info'):
             # Extract digits from card_info (e.g. "mada 9365" -> "9365")
             card_digits = "".join(filter(str.isdigit, str(result.get('card_info'))))
             if len(card_digits) >= 4:
                 source_last4 = card_digits[-4:]
                 source_credit_card = crud.get_credit_card_by_last4(db, source_last4)
                 if source_credit_card:
                     logger.info(f"DEBUG: Source Logic -> Card Info CREDIT CARD: {source_last4}, Card: {source_credit_card.name}")
                 else:
                     source_account = crud.get_account_by_last_4(db, source_last4)
                     if source_account:
                        logger.info(f"DEBUG: Source Logic -> Fallback to Card Info: {source_last4}, Account: {source_account.name}")

        # Last Resort: Manual Regex extraction from raw text if AI and card_info failed
        if not source_account and not source_credit_card:
            # Look for "By:4390" or similar
            regex_match = re.search(r"By:(\d{4})", msg_text)
            if regex_match:
                source_last4 = regex_match.group(1)
                source_credit_card = crud.get_credit_card_by_last4(db, source_last4)
                if source_credit_card:
                    logger.info(f"DEBUG: Source Logic -> Regex CREDIT CARD: {source_last4}, Card: {source_credit_card.name}")
                else:
                    source_account = crud.get_account_by_last_4(db, source_last4)
                    if source_account:
                        logger.info(f"DEBUG: Source Logic -> Manual Regex Match: {source_last4}, Account: {source_account.name}")

        # Smart Handling for Incoming Credits
        # Heuristic: If message says "Credit Transfer" or "Deposit", likely a CREDIT.
        is_explicit_credit = "credit transfer" in msg_text.lower() or "deposit" in msg_text.lower()
        
        dest_last4 = result.get('destination_account_last4')
        # Fallback: If AI put account number in merchant field (common in credits)
        if not dest_last4 and result.get('merchant') and str(result.get('merchant')).isdigit():
             dest_last4 = result.get('merchant')

        # Swap Logic / Credit Correction:
        # If explicitly a credit OR AI thinks it's a credit, ensure we target the correct account.
        if (result.get('transaction_type') == 'credit' or is_explicit_credit):
             target_dest_last4 = None
             if dest_last4:
                  target_dest_last4 = "".join(filter(str.isdigit, str(dest_last4)))[-4:]
             
             final_target_acc = None
             
             # Case A: Destination matched from extract
             if target_dest_last4 and len(target_dest_last4) == 4:
                 final_target_acc = crud.get_account_by_last_4(db, target_dest_last4)
             
             # Case B: AI Mistake - Extracted Destination as Source
             # If no Dest found, but we have a Source Account, and it's definitely a CREDIT...
             # Then that 'Source' (e.g. 7772) is actually the Destination.
             if not final_target_acc and source_account:
                  final_target_acc = source_account
                  logger.info(f"DEBUG: AI mapped Credit Destination to Source field ({source_account.name}). Correcting.")

             if final_target_acc:
                 logger.info(f"Incoming Credit detected to own account {final_target_acc.name}. ensure primary.")
                 source_account = final_target_acc
                 result['transaction_type'] = 'credit' # Force logic to treat as credit
                 logger.info(f"DEBUG: Credit Logic Applied. Primary Account: {source_account.name}")
        
        if not source_account and not source_credit_card:
            # INTERACTIVE FALLBACK (Now creates a PENDING_ACTION transaction)
            
            # 1. Create the Transaction first as PENDING_ACTION
            # We treat it as a DEBIT by default if unknown, or infer from context
            is_credit = result.get('transaction_type') == 'credit'
            
            tx_data = schemas.TransactionCreate(
                account_id=None, # UNKNOWN
                amount=result['amount'],
                merchant=result.get('merchant') or "Unknown Source",
                raw_sms_content=msg_text,
                category="Uncategorized", 
                type="credit" if is_credit else "debit",
                status="pending_action",
                timestamp=datetime.strptime(result['timestamp'], "%Y-%m-%d %H:%M") if result.get('timestamp') else datetime.now()
            )
            
            # Add multi-currency info to pending transaction too
            if result.get('currency') and result.get('currency').upper() != 'SAR':
                tx_data.original_amount = result['amount']
                tx_data.original_currency = result.get('currency')
            
            db.close() # Close DB before async wait
            
            await message.reply_text(
                f"❓ **Unknown Account/Card**\n"
                f"I parsed this as: {result.get('transaction_type')} of {result.get('amount')} {result.get('currency', 'SAR')}.\n"
                f"But I couldn't match it to any linked account or credit card.\n\n"
                f"Please add the account/card ending in relevant digits, or forward a clearer message."
            )
            
            raw_msg.status = models.MessageStatus.FAILED
            raw_msg.error_log = "Unknown Account/Card - pending user action"
            
            # Re-open DB to save status
            db = database.SessionLocal()
            db_msg = db.query(models.RawMessage).filter(models.RawMessage.id == raw_msg.id).first()
            if db_msg:
                db_msg.status = models.MessageStatus.FAILED
                db_msg.error_log = "Unknown Account/Card"
                db.commit()
            db.close()
            return

        # 3. Create Transaction Logic (pass credit card if matched)
        await _create_transaction_logic(db, result, source_account, source_credit_card, msg_text, message)
        
        # Update Raw Message Status
        raw_msg.status = models.MessageStatus.PARSED
        db.commit()
        db.close()

    except Exception as e:
        logger.error(f"DB Error: {e}")
        try: await message.reply_text(f"❌ Database Error: {e}")
        except: pass
        if 'db' in locals(): db.close()

async def _create_transaction_logic(db, result, source_account, source_credit_card, msg_text, reply_target=None):
    # --- 0. Multi-Currency Handling & Conversion ---
    original_amount = result.get('amount')
    original_currency = result.get('currency', 'SAR').upper()
    sar_amount = original_amount
    exchange_rate = 1.0

    if original_currency != 'SAR':
        # Fetch exchange rate
        # Prioritize card's bank if known, otherwise bank identified by AI
        if source_credit_card:
            bank_name = source_credit_card.bank_name
        elif source_account:
            bank_name = source_account.bank_name
        else:
            bank_name = result.get('source_bank')
        exchange_rate = exchange_rate_service.get_rate(original_currency, "SAR", bank_name)
        
        if exchange_rate:
            sar_amount = round(original_amount * exchange_rate, 2)
            logger.info(f"Converted {original_amount} {original_currency} to {sar_amount} SAR using rate {exchange_rate}")
        else:
            logger.warning(f"Could not find exchange rate for {original_currency}. Using original amount as fallback.")

    # --- 1. Resolve Accounts (Context Aware) ---
    # Skip account resolution if we already have a credit card
    if not source_credit_card:
        ai_source_last4 = result.get('source_account_last4')
        if ai_source_last4:
            found_source = crud.get_account_by_last_4(db, str(ai_source_last4))
            if found_source:
                 source_account = found_source
    
    # Resolve Destination Account
    dest_account = None
    ai_dest_last4 = result.get('destination_account_last4')
    if ai_dest_last4:
        dest_account = crud.get_account_by_last_4(db, str(ai_dest_last4))

    # --- 2. Determine Transaction Type & Category ---
    tx_type_str = result.get('transaction_type', 'debit').lower()
    sub_type = result.get('sub_type', 'purchase').lower()
    
    category = result.get('category') or "Uncategorized"
    if sub_type in ['transfer', 'internal_transfer']:
        category = "Transfer"
    elif sub_type == 'payment':
        category = "Bills"
    
    # --- 2b. Auto-record category to Categories table ---
    if category and category.lower() != "uncategorized":
        try:
            crud.get_or_create_category(db, category, "TRANSACTION")
        except Exception as e:
            logger.warning(f"Failed to auto-record category '{category}': {e}")

    # --- SWAP LOGIC: Ensure Credits are applied to the Destination Account ---
    # Only apply to regular accounts, not credit cards
    if not source_credit_card and tx_type_str == 'credit' and dest_account:
        if not source_account or source_account.id != dest_account.id:
            logger.info(f"Swapping Primary Account for Credit: {source_account.name if source_account else 'None'} -> {dest_account.name}")
            source_account = dest_account
    
    # --- 3. Construct Merchant / Counterparty Name ---
    merchant_raw = "Unknown"
    clean_merchant = result.get('brand_name')

    if sub_type == 'purchase':
        merchant_raw = result.get('merchant') or "POS Purchase"
    
    elif sub_type in ['transfer', 'internal_transfer']:
        if tx_type_str == 'debit':
            if dest_account:
                merchant_raw = f"Transfer to {dest_account.name}"
                clean_merchant = dest_account.name
            elif result.get('beneficiary'):
                merchant_raw = result.get('beneficiary')
                clean_merchant = result.get('beneficiary')
            elif result.get('destination_bank'):
                 merchant_raw = f"Transfer to {result.get('destination_bank')}"
            else:
                 merchant_raw = "Outgoing Transfer"

        elif tx_type_str == 'credit':
            ai_source_last4 = result.get('source_account_last4')
            if ai_source_last4:
                sender_acc_obj = crud.get_account_by_last_4(db, str(ai_source_last4))
                if sender_acc_obj:
                     merchant_raw = f"Transfer from {sender_acc_obj.name}"
                else:
                     merchant_raw = f"Transfer from {ai_source_last4}"
            elif result.get('sender_name'):
                merchant_raw = result.get('sender_name')
            elif result.get('source_bank'):
                merchant_raw = f"Transfer from {result.get('source_bank')}"
            else:
                merchant_raw = "Incoming Transfer"
    else:
        merchant_raw = result.get('description') or result.get('sub_type')

    # --- 4. Handle Internal Transfer with Unknown Source (skip if credit card) ---
    import json
    ai_source_last4 = result.get('source_account_last4')
    
    is_internal_transfer_missing_source = (
        not source_credit_card and  # Not a credit card transaction
        sub_type in ['transfer', 'internal_transfer'] and 
        tx_type_str == 'credit' and 
        not ai_source_last4
    )
    
    if is_internal_transfer_missing_source and source_account:
        transaction_data = schemas.TransactionCreate(
            account_id=source_account.id,
            amount=sar_amount,
            original_amount=original_amount,
            original_currency=original_currency,
            exchange_rate=exchange_rate if original_currency != 'SAR' else None,
            merchant=merchant_raw,
            raw_sms_content=msg_text,
            parsed_data=json.dumps(result),
            timestamp=datetime.now(),
            category=category,
            type=tx_type_str,
            status="pending_action",
            fees=result.get('fees', 0.0)
        )
        
        tx = crud.create_transaction(db, transaction_data)
        
        if reply_target:
            response_txt = f"❓ **Unknown Source Account**\n"
            response_txt += f"Credit of {sar_amount} SAR logged to {source_account.name} as PENDING.\n\n"
            response_txt += f"➡️ Open the app and select the **Source Account** to complete this transfer."
            try: await reply_target.reply_text(response_txt)
            except: pass
        
        return tx
    
    # --- 5. Create Transaction Record (Normal Flow) ---
    # Determine if this is an account or credit card transaction
    account_id = source_account.id if source_account else None
    credit_card_id = source_credit_card.id if source_credit_card else None
    
    transaction_data = schemas.TransactionCreate(
        account_id=account_id,
        credit_card_id=credit_card_id,  # NEW: Credit card support
        amount=sar_amount,
        original_amount=original_amount,
        original_currency=original_currency,
        exchange_rate=exchange_rate if original_currency != 'SAR' else None,
        merchant=merchant_raw,
        raw_sms_content=msg_text,
        parsed_data=json.dumps(result),
        timestamp=datetime.now(),
        category=category,
        type=tx_type_str,
        status="completed",
        fees=result.get('fees', 0.0)
    )
    
    tx = crud.create_transaction(db, transaction_data)
    
    # --- 6. Save as Training Example (Learn from Success) ---
    try:
        crud.create_training_example(db, msg_text, result)
        logger.info(f"Saved training example for: {merchant_raw}")
    except Exception as e:
        logger.warning(f"Failed to save training example: {e}")
    
    # --- 7. Notifications & Feedback ---
    if reply_target:
        # Build success message
        source_name = source_credit_card.name if source_credit_card else (source_account.name if source_account else "Unknown")
        source_type = "Credit Card" if source_credit_card else "Account"
        
        response_txt = f"✅ **Success!**\n"
        response_txt += f"{source_type}: {source_name}\n"
        response_txt += f"Amount: {sar_amount} SAR\n"
        if original_currency != 'SAR':
             response_txt += f"(Original: {original_amount} {original_currency})\n"
        response_txt += f"Merchant: {merchant_raw}\n"
        if tx.balance_after_transaction is not None:
            response_txt += f"Balance: {tx.balance_after_transaction:.2f} SAR"
        
        try: await reply_target.reply_text(response_txt)
        except: pass

def run_bot():
    if not TELEGRAM_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN not found. Exiting.")
        return

    application = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    
    # Handlers
    application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))
    
    logger.info("Bot is polling...")
    application.run_polling()

if __name__ == "__main__":
    run_bot()
