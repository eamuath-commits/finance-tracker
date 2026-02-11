import logging
import os
import json
import re
import asyncio
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, ContextTypes, CommandHandler, MessageHandler, CallbackQueryHandler, filters
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
# Also log to stdout for Docker visibility
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)
logger.addHandler(stream_handler)

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


def validate_parsed_digits(original_sms: str, parsed_data: dict) -> dict:
    """
    Post-processing validation: Verify AI-parsed account numbers exist in original SMS.
    If AI misread a digit (e.g., 1967 → 1964), try to correct it.
    
    Args:
        original_sms: The original SMS text
        parsed_data: The AI-parsed JSON data
    
    Returns:
        Corrected parsed_data with validated account numbers
    """
    import re
    
    fields_to_validate = ['source_account_last4', 'destination_account_last4']
    
    # Extract all 4-digit numbers from original SMS
    all_4digit_numbers = re.findall(r'\b(\d{4})\b', original_sms)
    # Also extract last 4 of any longer number (like full account numbers)
    longer_numbers = re.findall(r'(\d{5,})', original_sms)
    for num in longer_numbers:
        all_4digit_numbers.append(num[-4:])
    
    all_4digit_set = set(all_4digit_numbers)
    
    for field in fields_to_validate:
        ai_value = parsed_data.get(field)
        if not ai_value:
            continue
        
        ai_value_str = str(ai_value)
        
        # Check if AI's value exists in the SMS
        if ai_value_str in all_4digit_set or ai_value_str in original_sms:
            continue  # Value is correct
        
        # AI misread the number - try to find the correct one
        # Look for numbers that are "close" to what AI parsed (1-2 digit difference)
        def digit_distance(a: str, b: str) -> int:
            if len(a) != len(b):
                return 999
            return sum(1 for x, y in zip(a, b) if x != y)
        
        best_match = None
        best_distance = 999
        
        for candidate in all_4digit_set:
            dist = digit_distance(ai_value_str, candidate)
            if dist < best_distance and dist <= 2:  # Allow up to 2 digit differences
                best_distance = dist
                best_match = candidate
        
        if best_match and best_match != ai_value_str:
            logger.warning(f"Digit validation: {field} corrected from '{ai_value_str}' to '{best_match}' (original SMS didn't contain '{ai_value_str}')")
            parsed_data[field] = best_match
    
    return parsed_data

async def parse_with_ai(db: Session, text: str, custom_prompt: str = None):
    """
    Sends SMS text to Gemini AI and expects a JSON response.
    Retries on 429 errors.
    
    Args:
        db: Database session
        text: SMS text to parse
        custom_prompt: Optional bank-specific prompt. If provided, uses this
                      prompt directly with the SMS text appended. If None,
                      uses the default comprehensive prompt.
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
    You are a highly intelligent financial AI assistant for Saudi Arabian banking SMS. Extract structured transaction data.
    
    **USER'S ACCOUNTS (Internal Detection)**:
    {accounts_json_str}

    **Input SMS**: "{text}"
    **Context**: Date={today_date}, Year={current_year}, Location=Saudi Arabia.

    **BANK-SPECIFIC PATTERNS**:
    
    **AlRajhiBank**:
    - "PoS" / "Online Purchase" = Purchase (DEBIT)
    - "By:XXXX;mada-Apple Pay" = Card XXXX used
    - "Transfer Between Your Accounts" + "To:XXXX" = Internal transfer TO account XXXX (CREDIT to XXXX)
    - "Debit Internal Transfer" / "Debit Transfer Local" = Outgoing transfer (DEBIT)
    - "Credit Transfer Local/Internal" = Incoming transfer (CREDIT)
    - "Credit Card:Payment" = Paying credit card bill (CREDIT to card - reduces debt)
    - "Credit Card:transfer" = Refund from credit card to account (CREDIT to account)
    - "Bill Payment" = SADAD payment (DEBIT)
    - "Notification : Declined" = Failed transaction (sub_type: decline, is_transaction: false)
    - "Debit: Loan Instalment" = Loan payment (DEBIT, sub_type: loan)
    - "Refund" = Money returned (CREDIT)
    - **DATE FORMAT**: AlRajhi uses YY/M/DD HH:MM format (e.g., "26/1/25 17:48" = 2026-01-25 17:48)

    
    **STC Bank**:
    - "Internal outward transfer" = Outgoing to STC user (DEBIT)
    - "Internal incoming transfer" = Incoming from STC user (CREDIT)
    - "Adding money to account" = Top-up (CREDIT, sub_type: deposit)
    - "Debit Transfer Sponsored" = Musaned worker payment (DEBIT)
    - "Inward transfer (SARIE)" = Local bank transfer incoming (CREDIT)
    
    **Jazira Bank (BJAZ)**:
    - "POS Purchase (Apple Pay)" = Card purchase (DEBIT)
    - "Internet Purchase" / "Online Purchase Apple Pay" = Online purchase (DEBIT)
    - "Outgoing Funds Transfer Approved" = Transfer out (DEBIT)
    - "Credit transfer: Local" / "Credit transfer Internal" = Incoming (CREDIT)
    - "Debit transfer: Loan Instalment" = Loan payment (DEBIT, sub_type: loan)
    - "Credit Card Payment Confirmation" = Paying card bill (CREDIT to card)
    - "Internet Purchase Reversal" = Refund (CREDIT)

    **EXTRACTION RULES**:
    1. "By:XXXX" or "Card:XXXX" = Source Account (card being used)
    2. "From:XXXX" = Source Account
    3. "To:XXXX" = Destination Account
    4. Match account numbers to User's Accounts list for INTERNAL detection
    5. Credit Card Payment/Repayment = CREDIT (reduces debt, money going INTO card)
    6. Purchase/PoS = DEBIT (money leaving)
    7. Declined = NOT a transaction (is_transaction: false)
    8. Loan Instalment = DEBIT with sub_type "loan"

    **CATEGORY INFERENCE**:
    - Starbucks, GOT COOKI, restaurants = "Food & Dining"
    - PETROMIN, ALDREES, Fuel = "Transport"
    - STC BILL, NWC, ELECTRICITY = "Bills"
    - AMAZON, GOOGLE = "Shopping"
    - HUNGERSTATION, Food delivery = "Food & Dining"
    - COURSERA, ADOBE = "Subscriptions"
    - PHARMACY = "Health"
    - BARBER = "Personal Care"
    - Transfer to person = "Transfer"

    **OUTPUT JSON**:
    {{
      "is_financial_event": boolean,
      "is_transaction": boolean,
      "transaction_type": "debit" | "credit",
      "sub_type": "purchase" | "transfer" | "payment" | "withdrawal" | "deposit" | "internal_transfer" | "decline" | "loan" | "refund",
      "source_bank": stringOrNull,
      "destination_bank": stringOrNull,
      "source_account_last4": stringOrNull,
      "destination_account_last4": stringOrNull,
      "card_info": stringOrNull,
      "amount": number,
      "currency": string,
      "fees": numberOrNull,
      "timestamp": "YYYY-MM-DD HH:MM",
      "available_balance": numberOrNull,
      "beneficiary": stringOrNull,
      "merchant": stringOrNull,
      "sender_name": stringOrNull,
      "category": stringOrNull,
      "description": stringOrNull
    }}
    
    Respond ONLY with valid JSON.
    
    **EXAMPLES**:
    
    1. AlRajhi PoS Purchase:
       Input: "PoS\\nBy:9365;mada-Apple Pay\\nAmount:SAR 7\\nAt:GOT COOKI\\n27/1/26 12:39"
       Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"purchase","source_bank":"AlRajhiBank","source_account_last4":"9365","card_info":"mada-Apple Pay 9365","amount":7,"currency":"SAR","merchant":"GOT COOKI","category":"Food & Dining","timestamp":"2026-01-27 12:39","description":"Purchase at GOT COOKI"}}
    
    2. AlRajhi Internal Transfer (Credit to destination):
       Input: "Transfer Between Your Accounts\\nAmount: SAR 1000\\nTo: 1505\\n26/1/25 17:49"
       Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"credit","sub_type":"internal_transfer","source_bank":"AlRajhiBank","destination_account_last4":"1505","amount":1000,"currency":"SAR","timestamp":"2026-01-25 17:49","description":"Transfer to 1505"}}
    
    3. AlRajhi Debit Internal Transfer:
       Input: "Debit Internal Transfer\\nFrom:1505\\nAmount:SAR 440\\nTo:MOHAMMED ISLAM\\nTo:0477\\n26/1/26 15:03"
       Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"transfer","source_bank":"AlRajhiBank","source_account_last4":"1505","destination_account_last4":"0477","amount":440,"currency":"SAR","beneficiary":"MOHAMMED ISLAM","category":"Transfer","timestamp":"2026-01-26 15:03","description":"Transfer to MOHAMMED ISLAM"}}
    
    4. AlRajhi Credit Card Payment (Paying bill = CREDIT):
       Input: "Credit Card:Payment\\nCard:Visa 7868\\nAmount:SAR 100\\nBalance:640.99 SAR\\nDate:27-01-2026 22:47"
       Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"credit","sub_type":"payment","source_bank":"AlRajhiBank","destination_account_last4":"7868","card_info":"Visa 7868","amount":100,"currency":"SAR","available_balance":640.99,"timestamp":"2026-01-27 22:47","description":"Credit Card Payment"}}
    
    5. AlRajhi Online Purchase (Credit Card):
       Input: "Online Purchase\\nCard:7868 ;Visa\\nAmount:539.99 SAR\\nAt: GOOGLE*GO\\nCountry:USA\\nBalance:88.58 SAR\\n27/1/26 22:47"
       Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"purchase","source_bank":"AlRajhiBank","source_account_last4":"7868","card_info":"Visa 7868","amount":539.99,"currency":"SAR","merchant":"GOOGLE*GO","category":"Subscriptions","available_balance":88.58,"timestamp":"2026-01-27 22:47","description":"Purchase at GOOGLE"}}
    
    6. AlRajhi Bill Payment:
       Input: "Bill Payment\\nFrom:1505\\nAmount:SAR 973.76\\nBiller:001\\nService:STC BILL\\nBill:00100215438\\n26-1-6 15:40"
       Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"payment","source_bank":"AlRajhiBank","source_account_last4":"1505","amount":973.76,"currency":"SAR","merchant":"STC BILL","category":"Bills","timestamp":"2026-01-06 15:40","description":"Bill Payment - STC"}}
    
    7. AlRajhi Declined (not a transaction):
       Input: "Notification : Declined due to insufficient fund\\nTransaction : Online Purchase\\nCard: 7868\\nAmount : USD 79\\nMerchant : COURSERA.\\nDate : 18/1/26 21:04"
       Output: {{"is_financial_event":true,"is_transaction":false,"transaction_type":"debit","sub_type":"decline","source_bank":"AlRajhiBank","source_account_last4":"7868","card_info":"7868","amount":79,"currency":"USD","merchant":"COURSERA","timestamp":"2026-01-18 21:04","description":"Declined - Insufficient funds"}}
    
    8. AlRajhi Credit Transfer Incoming:
       Input: "Credit Transfer Local\\nVia:BJAZ\\nAmount:SAR 7000\\nTo:7772\\nFrom:MUATH AMER MOHAMMED ALASIRI\\nFrom:8001\\n26-1-7 13:23"
       Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"credit","sub_type":"transfer","source_bank":"BJAZ","destination_bank":"AlRajhiBank","source_account_last4":"8001","destination_account_last4":"7772","amount":7000,"currency":"SAR","sender_name":"MUATH AMER MOHAMMED ALASIRI","category":"Transfer","timestamp":"2026-01-07 13:23","description":"Incoming transfer from BJAZ"}}
    
    9. AlRajhi Loan Instalment:
       Input: "Debit: Loan Instalment\\nInstalment: SAR 3032.19\\nFrom: 5225\\nRemaining Amount: SAR 222872.89\\n25/1/26 20:27"
       Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"loan","source_bank":"AlRajhiBank","source_account_last4":"5225","amount":3032.19,"currency":"SAR","category":"Loan","timestamp":"2026-01-25 20:27","description":"Loan Instalment Payment"}}
    
    10. AlRajhi Refund:
        Input: "Refund\\nCard: 7868; 001\\nAmount: 15.35 SAR\\nFrom: GOOGLE*GO\\n 27/1/26 22:54"
        Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"credit","sub_type":"refund","destination_bank":"AlRajhiBank","destination_account_last4":"7868","amount":15.35,"currency":"SAR","sender_name":"GOOGLE*GO","category":"Refund","timestamp":"2026-01-27 22:54","description":"Refund from GOOGLE"}}
    
    11. AlRajhi Salary (Credit Transfer from Company):
        Input: "Credit Transfer Local\\nVia:SAUDI AWWAL BANK\\nAmount:SAR 110095.73\\nTo:3264\\nFrom:DELL TECHNOLOGIES SINGLE LLC\\nFrom:\\n26/1/25 09:50"
        Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"credit","sub_type":"transfer","source_bank":"SAUDI AWWAL BANK","destination_bank":"AlRajhiBank","destination_account_last4":"3264","amount":110095.73,"currency":"SAR","sender_name":"DELL TECHNOLOGIES SINGLE LLC","category":"Salary","timestamp":"2026-01-25 09:50","description":"Salary from DELL TECHNOLOGIES"}}
    
    12. STC Bank Internal Outward:
        Input: "Internal outward transfer\\nAmount:400.00SAR\\nTo:MOHAMED ABDELSATTAR\\nAcc:3607*\\nAt:27/01/26 11:12"
        Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"transfer","source_bank":"STC Bank","destination_account_last4":"3607","amount":400,"currency":"SAR","beneficiary":"MOHAMED ABDELSATTAR","category":"Transfer","timestamp":"2026-01-27 11:12","description":"Transfer to MOHAMED ABDELSATTAR"}}
    
    13. STC Bank Incoming:
        Input: "Inward transfer (SARIE)\\n4800.00 SAR\\nFrom MUATH ALASIRI\\nFrom AL RAJHI BANK\\nAccount *863\\n25-01-2026 17:05\\nRef. No. *XZN9"
        Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"credit","sub_type":"transfer","source_bank":"AL RAJHI BANK","destination_bank":"STC Bank","destination_account_last4":"0863","amount":4800,"currency":"SAR","sender_name":"MUATH ALASIRI","category":"Transfer","timestamp":"2026-01-25 17:05","description":"Incoming from AL RAJHI"}}
    
    14. Jazira POS Purchase:
        Input: "POS Purchase (Apple Pay)\\nCredit Card: 4897\\nat :Starbucks\\nof: 86.00 SAR\\non : 2026-01-22 22:46\\nAvailable Balance: 21753.24 SAR\\nDue Amount: 51896.96 SAR"
        Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"purchase","source_bank":"Jazira Bank","source_account_last4":"4897","card_info":"Credit Card 4897","amount":86,"currency":"SAR","merchant":"Starbucks","category":"Food & Dining","available_balance":21753.24,"timestamp":"2026-01-22 22:46","description":"Purchase at Starbucks"}}
    
    15. Jazira Loan Instalment:
        Input: "Debit transfer: Loan Instalment\\nFrom: 8001\\nInstalment: SAR 19,099.85\\nRemaining Amount: SAR 744,894.15\\nFor: Personal Loan\\nDate: 2026-01-26 17:23"
        Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"loan","source_bank":"Jazira Bank","source_account_last4":"8001","amount":19099.85,"currency":"SAR","category":"Loan","timestamp":"2026-01-26 17:23","description":"Personal Loan Instalment"}}
    
    16. Jazira Outgoing Transfer:
        Input: "Outgoing Funds Transfer Approved\\nDebited from Account: 8001\\nTo: MUATH ALAS**\\nAmount: SAR 2,000.00\\nIBAN/Alias: 7772\\n[AlRajhi Bank]\\nat 2026-01-17 14:19"
        Output: {{"is_financial_event":true,"is_transaction":true,"transaction_type":"debit","sub_type":"transfer","source_bank":"Jazira Bank","source_account_last4":"8001","destination_bank":"AlRajhi Bank","destination_account_last4":"7772","amount":2000,"currency":"SAR","beneficiary":"MUATH ALASIRI","category":"Transfer","timestamp":"2026-01-17 14:19","description":"Transfer to AlRajhi"}}
    """

    # If custom prompt provided (from bank-specific parser), use it
    if custom_prompt:
        prompt = f"""{custom_prompt}

**USER'S ACCOUNTS (for matching)**:
{accounts_json_str}

**Context**: Date={today_date}, Year={current_year}

**SMS to parse**:
"{text}"

Respond with JSON only.
"""
        logger.info(f"Using custom bank-specific prompt")
    
    MAX_RETRIES = 5
    base_delay = 4
    
    for attempt in range(MAX_RETRIES + 1):
        try:
            # We use async generation if available, but the library might be sync. 
            # model.generate_content is synchronous blocking IO usually.
            # Ideally run in executor, but for now simple call.
            response = await asyncio.to_thread(model.generate_content, prompt)
            
            # Log token usage
            if hasattr(response, 'usage_metadata'):
                usage = response.usage_metadata
                input_tokens = getattr(usage, 'prompt_token_count', 0)
                output_tokens = getattr(usage, 'candidates_token_count', 0)
                total_tokens = getattr(usage, 'total_token_count', 0)
                logger.info(f"📊 Token Usage - Input: {input_tokens}, Output: {output_tokens}, Total: {total_tokens}")
            
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
    # Expected format: "SENDER --- BODY" or "SENDER —— BODY" (supports various dash types)
    sms_sender = None
    sms_body = msg_text
    
    # List of separators to try (regular dashes, em-dashes, etc.)
    separators = ['\n---\n', ' --- ', '---', '\n——\n', ' —— ', '——', '\n--\n', ' -- ', '--']
    
    for sep in separators:
        if sep in msg_text:
            parts = msg_text.split(sep, 1)
            if len(parts) == 2 and len(parts[0].strip()) < 50:  # Sender should be short
                sms_sender = parts[0].strip()
                sms_body = parts[1].strip()
                logger.info(f"Parsed structured message - Sender: {sms_sender} (separator: '{sep.strip()}')")
                break
    
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
    
    # Validate AI-parsed account numbers against original SMS
    result = validate_parsed_digits(sms_body, result)


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
            # INTERACTIVE FALLBACK - Create PENDING_ACTION transaction with inline buttons
            
            is_credit = result.get('transaction_type') == 'credit'
            
            # Check if destination is known (from the SMS)
            dest_last4 = result.get('destination_account_last4')
            dest_account = crud.get_account_by_last_4(db, str(dest_last4)) if dest_last4 else None
            
            # For transfers with known destination, this is a DEBIT from source (unknown) to destination (known)
            # The transaction should be stored with the DESTINATION account for now, marked as pending
            target_account_id = dest_account.id if dest_account else None
            
            tx_data = schemas.TransactionCreate(
                account_id=target_account_id,  # Store with destination (will be adjusted after source selection)
                amount=result['amount'],
                merchant=f"Transfer to {dest_account.name}" if dest_account else (result.get('merchant') or "Unknown Source"),
                raw_sms_content=msg_text,
                parsed_data=json.dumps(result),
                category="Transfer" if dest_account else (result.get('category') or "Uncategorized"), 
                type="credit" if dest_account else ("credit" if is_credit else "debit"),  # Credit to destination
                status="pending_action",
                timestamp=datetime.strptime(result['timestamp'], "%Y-%m-%d %H:%M") if result.get('timestamp') else datetime.now()
            )
            
            # Add multi-currency info
            if result.get('currency') and result.get('currency').upper() != 'SAR':
                tx_data.original_amount = result['amount']
                tx_data.original_currency = result.get('currency')
            
            # Create the pending transaction
            pending_tx = crud.create_transaction(db, tx_data)
            logger.info(f"Created pending_action transaction: {pending_tx.id} (dest: {dest_account.name if dest_account else 'unknown'})")
            
            # Build inline keyboard with account options
            accounts = crud.get_accounts(db)
            credit_cards = crud.get_credit_cards(db)
            
            keyboard = []
            
            # Add accounts (excluding destination if known)
            for acc in accounts[:10]:
                # Skip the destination account - we're asking for SOURCE
                if dest_account and acc.id == dest_account.id:
                    continue
                    
                label = f"💳 {acc.name}"
                if acc.last_4_digits:
                    label += f" •{acc.last_4_digits}"
                # Short callback: "src:{tx_id8}:{acc_id8}" to fit 64 byte limit
                keyboard.append([InlineKeyboardButton(label, callback_data=f"src:{pending_tx.id[:8]}:{acc.id[:8]}")])
            
            # Add credit cards (for non-transfer scenarios)
            if not dest_account:
                for cc in credit_cards[:5]:
                    label = f"💎 {cc.name}"
                    if cc.last_4_digits:
                        label += f" •{cc.last_4_digits}"
                    keyboard.append([InlineKeyboardButton(label, callback_data=f"cc:{pending_tx.id[:8]}:{cc.id[:8]}")])
            
            reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
            
            # Build response message
            if dest_account:
                response_txt = (
                    f"💸 **Transfer to {dest_account.name}**\n"
                    f"Amount: {result.get('amount')} {result.get('currency', 'SAR')}\n\n"
                    f"**Select the SOURCE account:**"
                )
            else:
                response_txt = (
                    f"❓ **Unknown Account/Card**\n"
                    f"Amount: {result.get('amount')} {result.get('currency', 'SAR')}\n"
                    f"Type: {result.get('transaction_type')}\n\n"
                    f"**Select the account:**"
                )
            
            await message.reply_text(response_txt, reply_markup=reply_markup)
            
            raw_msg.status = models.MessageStatus.PENDING
            raw_msg.error_log = "Waiting for source account selection" if dest_account else "Waiting for account selection"
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

async def _create_transaction_logic(db, result, source_account, source_credit_card, msg_text, reply_target=None, source="telegram"):
    # --- 0. Timestamp Handling: Use SMS timestamp for WebUI, current time for Telegram ---
    from dateutil import parser as date_parser
    import re
    
    tx_timestamp = datetime.now()  # Default fallback
    current_year = datetime.now().year
    header_timestamp_used = False
    
    # For WebUI source, first check for user-provided header timestamp
    # Format: "2026-01-31 11:49:37 from AlRajhiBank"
    if source == "webui" and msg_text:
        header_match = re.match(r'^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+from\s+', msg_text, re.IGNORECASE)
        if header_match:
            try:
                tx_timestamp = datetime.strptime(header_match.group(1), "%Y-%m-%d %H:%M:%S")
                header_timestamp_used = True
                logger.info(f"Using header timestamp from WebUI: {tx_timestamp}")
            except Exception as e:
                logger.warning(f"Failed to parse header timestamp: {e}")
    
    # Fall back to AI-parsed timestamp if no header timestamp
    if source == "webui" and not header_timestamp_used and result.get("timestamp"):
        try:
            parsed_ts = date_parser.parse(result["timestamp"])
            
            # --- YEAR VALIDATION: Prevent future dates and very old dates ---
            parsed_year = parsed_ts.year
            
            # If year is in the future (parsing error), assume current year
            if parsed_year > current_year:
                logger.warning(f"Future year detected ({parsed_year}), correcting to {current_year}")
                parsed_ts = parsed_ts.replace(year=current_year)
            
            # If year is more than a few months in the past AND not current year, likely parsing error
            # AlRajhi uses YY/M/DD format where "25" could be parsed as 2025 instead of 2026-01-25
            elif parsed_year < current_year:
                # Check if it's a recent date that got the wrong year
                # If the month/day would make sense as a recent transaction (within last 6 months), use current year
                test_date = parsed_ts.replace(year=current_year)
                now = datetime.now()
                six_months_ago = now.replace(month=now.month - 6) if now.month > 6 else now.replace(year=now.year - 1, month=now.month + 6)
                
                if test_date <= now and test_date >= six_months_ago:
                    logger.warning(f"Past year detected ({parsed_year}), correcting to {current_year}")
                    parsed_ts = test_date
                elif test_date > now:
                    # Transaction would be in the future if we use current year, use last year
                    logger.warning(f"Past year detected ({parsed_year}), keeping as-is (would be future)")
                else:
                    # Very old transaction, keep as-is
                    logger.info(f"Transaction from {parsed_year} - older than 6 months, keeping original year")
            
            tx_timestamp = parsed_ts
            logger.info(f"Using SMS timestamp for WebUI: {tx_timestamp}")
        except Exception as e:
            logger.warning(f"Failed to parse SMS timestamp '{result.get('timestamp')}': {e}, using current time")

    
    # --- 0b. Multi-Currency Handling & Conversion ---
    original_amount = result.get('amount')

    original_currency = (result.get('currency') or 'SAR').upper()
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
    
    # Use AI-suggested category, with fallback defaults
    category = result.get('category')
    if not category or category.lower() == "uncategorized":
        # Assign default categories based on sub_type if AI didn't suggest one
        if sub_type == 'internal_transfer':
            category = "Internal Transfer"
        elif sub_type == 'transfer':
            category = "Transfer"
        elif sub_type == 'payment':
            category = "Bills"
        elif sub_type == 'loan':
            category = "Loan"
        elif sub_type == 'refund':
            category = "Refund"
        elif sub_type == 'deposit':
            category = "Deposit"
        else:
            category = "Uncategorized"
    
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
            # Smart merchant naming for transfers:
            # 1. If destination is user's own account → account name
            # 2. If beneficiary name exists → beneficiary name
            # 3. Otherwise → account number
            dest_last4 = result.get('destination_account_last4')
            
            if dest_account:
                # Destination is user's own account - use account label
                merchant_raw = f"Transfer to {dest_account.name}"
                clean_merchant = dest_account.name
            elif result.get('beneficiary'):
                # External transfer with beneficiary name
                merchant_raw = result.get('beneficiary')
                clean_merchant = result.get('beneficiary')
            elif dest_last4:
                # No beneficiary name, show account number
                merchant_raw = f"Transfer to ****{dest_last4}"
            elif result.get('destination_bank'):
                merchant_raw = f"Transfer to {result.get('destination_bank')}"
            else:
                merchant_raw = "Outgoing Transfer"


        elif tx_type_str == 'credit':
            # Smart merchant naming for incoming credits:
            # 1. If source is user's own account → account name  
            # 2. If sender_name exists → sender name
            # 3. Otherwise → account number
            ai_source_last4 = result.get('source_account_last4')
            sender_acc_obj = crud.get_account_by_last_4(db, str(ai_source_last4)) if ai_source_last4 else None
            
            if sender_acc_obj:
                # Source is user's own account - use account label
                merchant_raw = f"Transfer from {sender_acc_obj.name}"
            elif result.get('sender_name'):
                # External transfer with sender name
                merchant_raw = result.get('sender_name')
            elif ai_source_last4:
                # No sender name, show account number
                merchant_raw = f"Transfer from ****{ai_source_last4}"
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
        not ai_source_last4 and
        not result.get('sender_name')  # If sender_name exists, it's an EXTERNAL credit, not internal transfer
    )

    
    logger.info(f"DEBUG: is_internal_transfer_missing_source={is_internal_transfer_missing_source}, source_account={source_account.name if source_account else None}")
    
    if is_internal_transfer_missing_source and source_account:
        logger.info(f"DEBUG: Creating pending_action transaction for internal transfer to {source_account.name}")
        transaction_data = schemas.TransactionCreate(
            account_id=source_account.id,
            amount=sar_amount,
            original_amount=original_amount,
            original_currency=original_currency,
            exchange_rate=exchange_rate if original_currency != 'SAR' else None,
            merchant=merchant_raw,
            raw_sms_content=msg_text,
            parsed_data=json.dumps(result),
            timestamp=tx_timestamp,
            category=category,
            type=tx_type_str,
            status="pending_action",
            fees=result.get('fees', 0.0),
            source=source  # Track transaction source
        )
        
        tx = crud.create_transaction(db, transaction_data)
        logger.info(f"DEBUG: Created transaction {tx.id} with status pending_action")
        
        # Build inline keyboard with source account options (excluding destination)
        if reply_target:
            accounts = crud.get_accounts(db)
            keyboard = []
            
            for acc in accounts[:10]:
                # Skip the destination account - we're asking for SOURCE
                if acc.id == source_account.id:
                    continue
                    
                label = f"💳 {acc.name}"
                if acc.last_4_digits:
                    label += f" •{acc.last_4_digits}"
                # Use shortened callback: "src:{tx_id_short}:{acc_id_short}" to stay under 64 bytes
                callback = f"src:{tx.id[:8]}:{acc.id[:8]}"
                keyboard.append([InlineKeyboardButton(label, callback_data=callback)])
            
            reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
            
            response_txt = (
                f"💸 **Transfer to {source_account.name}**\n"
                f"Amount: {sar_amount} SAR\n\n"
                f"**Select the SOURCE account:**"
            )
            
            logger.info(f"DEBUG: Sending inline buttons to user - {len(keyboard)} accounts")
            try: 
                await reply_target.reply_text(response_txt, reply_markup=reply_markup)
                logger.info("DEBUG: Inline buttons sent successfully")
            except Exception as e:
                logger.error(f"ERROR sending inline buttons: {e}")
        
        return tx
    
    # --- 5. Create Transaction Record (Normal Flow) ---
    # Determine if this is an account or credit card transaction
    account_id = source_account.id if source_account else None
    credit_card_id = source_credit_card.id if source_credit_card else None
    
    # --- PENDING TRANSFER DETECTION (Cross-Bank Transfers) ---
    # If this is a CREDIT transfer, check if it matches a pending debit (completes the transfer)
    ai_source_last4 = result.get('source_account_last4')
    ai_dest_last4 = result.get('destination_account_last4')
    
    if sub_type in ['transfer', 'internal_transfer'] and tx_type_str == 'credit':
        # Look for a matching pending_transfer
        pending_debit = crud.find_pending_transfer(db, ai_source_last4, ai_dest_last4, sar_amount)
        if pending_debit:
            # Found a matching pending transfer - confirm it
            crud.confirm_pending_transfer(db, pending_debit.id)
            logger.info(f"Confirmed pending transfer: {pending_debit.id} (matched with credit)")
    
    # Determine transaction status
    tx_status = "completed"  # Default
    
    # NOTE: Bank-to-bank transfers are completed immediately.
    # The debit SMS contains the source account (From: last4).
    # The credit SMS will arrive later from the destination bank.
    # Each SMS is processed independently - no pending/waiting needed.
    if sub_type in ['transfer', 'internal_transfer'] and tx_type_str == 'debit':
        if ai_dest_last4:
            # Check if destination is ALSO your account (cross-bank internal transfer)
            dest_is_yours = crud.get_account_by_last_4(db, str(ai_dest_last4))
            if dest_is_yours:
                # Log the cross-bank transfer but keep as completed
                logger.info(f"Cross-bank transfer detected (completed): {source_account.name if source_account else 'Unknown'} -> {dest_is_yours.name}")
    
    # --- 5a. Counterparty Resolution (find-or-create) ---
    counterparty_merchant_id = None
    counterparty_beneficiary_id = None
    counterparty_biller_id = None
    
    try:
        if sub_type in ['purchase', 'refund', 'atm', 'pos', 'online'] or (sub_type == 'cc_payment'):
            # POS / online purchases → merchants table
            merchant_name = result.get('merchant') or merchant_raw
            if merchant_name and merchant_name not in ['Unknown', 'POS Purchase']:
                m = crud.find_or_create_merchant(db, merchant_name, category=category)
                counterparty_merchant_id = m.id
                logger.info(f"Linked to merchant: {m.name} ({m.id})")
        
        elif sub_type in ['transfer', 'internal_transfer']:
            if tx_type_str == 'debit' and not dest_account:
                # Outgoing to external = beneficiary
                beneficiary_name = result.get('beneficiary') or result.get('merchant') or merchant_raw
                if beneficiary_name and not beneficiary_name.startswith('Transfer'):
                    dest_bank = result.get('destination_bank')
                    b = crud.find_or_create_beneficiary(
                        db, beneficiary_name, 
                        bank_name=dest_bank,
                        account_last4=result.get('destination_account_last4')
                    )
                    counterparty_beneficiary_id = b.id
                    logger.info(f"Linked to beneficiary: {b.name} @ {b.bank_name} ({b.id})")
            elif tx_type_str == 'credit' and result.get('sender_name'):
                # Incoming from external = beneficiary (sender)
                sender_name = result.get('sender_name')
                sender_bank = result.get('sender_bank') or result.get('source_bank')
                b = crud.find_or_create_beneficiary(
                    db, sender_name,
                    bank_name=sender_bank,
                    account_last4=result.get('source_account_last4')
                )
                counterparty_beneficiary_id = b.id
                logger.info(f"Linked to beneficiary (sender): {b.name} @ {b.bank_name} ({b.id})")
        
        elif sub_type in ['bill_payment', 'payment'] or (category and category.lower() in ['bills', 'utilities', 'telecom']):
            biller_name = result.get('merchant') or merchant_raw
            if biller_name and biller_name not in ['Unknown']:
                bl = crud.find_or_create_biller(db, biller_name, category=category)
                counterparty_biller_id = bl.id
                logger.info(f"Linked to biller: {bl.name} ({bl.id})")
    except Exception as e:
        logger.warning(f"Counterparty resolution failed (non-fatal): {e}")
    
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
        timestamp=tx_timestamp,

        category=category,
        type=tx_type_str,
        status=tx_status,
        fees=result.get('fees', 0.0),
        source=source,  # Track transaction source (telegram, webui, manual)
        merchant_id=counterparty_merchant_id,
        beneficiary_id=counterparty_beneficiary_id,
        biller_id=counterparty_biller_id,
    )
    
    tx = crud.create_transaction(db, transaction_data)
    
    # --- 5b. AUTO-LINK: CC 7868 Payments → Expense Account ---
    # When Credit Card 7868 receives a payment (credit), auto-create debit on Expense account
    if source_credit_card and source_credit_card.last_4_digits == "7868":
        if tx_type_str == "credit" and sub_type in ['payment', 'cc_payment', 'credit_card_payment']:
            # Find Expense account
            expense_account = db.query(models.Account).filter(
                models.Account.name.ilike("%expense%")
            ).first()
            
            if expense_account:
                logger.info(f"Auto-linking CC 7868 payment: Creating debit on Expense account for {sar_amount} SAR")
                
                # Create corresponding debit transaction on Expense account
                debit_data = schemas.TransactionCreate(
                    account_id=expense_account.id,
                    credit_card_id=None,
                    amount=sar_amount,
                    original_amount=original_amount,
                    original_currency=original_currency,
                    exchange_rate=exchange_rate if original_currency != 'SAR' else None,
                    merchant=f"CC Payment to {source_credit_card.name}",
                    raw_sms_content=msg_text,
                    parsed_data=json.dumps(result),
                    timestamp=tx_timestamp,
                    category="Credit Card Payment",
                    type="debit",
                    status="completed",
                    fees=0.0,
                    source=source
                )
                debit_tx = crud.create_transaction(db, debit_data)
                logger.info(f"Auto-created debit transaction {debit_tx.id} on Expense account")
            else:
                logger.warning("CC 7868 payment detected but no Expense account found for auto-linking")
    
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
        
        if tx_status == "pending_transfer":
            response_txt = f"⏳ **Pending Transfer**\n"
            response_txt += f"From: {source_name}\n"
            response_txt += f"Amount: {sar_amount} SAR\n"
            response_txt += f"Waiting for credit confirmation from destination bank.\n"
        else:
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

# --- Callback Query Handler (for inline buttons) ---
async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle inline button callbacks for account selection"""
    query = update.callback_query
    await query.answer()  # Acknowledge the callback
    
    data = query.data
    
    # Handle short callback format: src, acc, cc (for 64-byte limit)
    if data.startswith("src:") or data.startswith("acc:") or data.startswith("cc:"):
        # Parse callback data: "src:{tx_id8}:{target_id8}"
        parts = data.split(":")
        if len(parts) != 3:
            await query.edit_message_text("❌ Invalid selection")
            return
        
        action, tx_id_short, target_id_short = parts
        
        db = database.SessionLocal()
        try:
            # Query by ID prefix since we only have first 8 chars
            tx = db.query(models.Transaction).filter(models.Transaction.id.like(f"{tx_id_short}%")).first()
            if not tx:
                await query.edit_message_text("❌ Transaction not found")
                db.close()
                return
            
            if tx.status != "pending_action":
                await query.edit_message_text("ℹ️ This transaction was already processed")
                db.close()
                return
            
            if action == "src":
                # SOURCE ACCOUNT SELECTION (for transfers with known destination)
                # The pending_tx is stored as CREDIT to destination
                # Now we know the source, create DEBIT from source and complete credit
                
                source_account = db.query(models.Account).filter(models.Account.id.like(f"{target_id_short}%")).first()
                if not source_account:
                    await query.edit_message_text("❌ Account not found")
                    db.close()
                    return
                
                dest_account = db.query(models.Account).filter(models.Account.id == tx.account_id).first()
                
                # 1. Create DEBIT transaction from source
                debit_tx = models.Transaction(
                    account_id=source_account.id,
                    amount=tx.amount,
                    merchant=f"Transfer to {dest_account.name}" if dest_account else "Outgoing Transfer",
                    raw_sms_content=tx.raw_sms_content,
                    parsed_data=tx.parsed_data,
                    timestamp=tx.timestamp,
                    category="Transfer",
                    type="debit",
                    status="completed"
                )
                
                # Update source balance (subtract)
                source_account.current_balance -= tx.amount
                debit_tx.balance_after_transaction = source_account.current_balance
                db.add(debit_tx)
                
                # 2. Update credit transaction: mark as completed, update merchant
                tx.status = "completed"
                tx.merchant = f"Transfer from {source_account.name}"
                
                # Update destination balance (add)
                if dest_account:
                    dest_account.current_balance += tx.amount
                    tx.balance_after_transaction = dest_account.current_balance
                
                db.commit()
                
                await query.edit_message_text(
                    f"✅ **Transfer Complete!**\n\n"
                    f"From: {source_account.name} (-{tx.amount} SAR)\n"
                    f"To: {dest_account.name if dest_account else 'Unknown'} (+{tx.amount} SAR)"
                )
                logger.info(f"Completed transfer: {source_account.name} -> {dest_account.name if dest_account else 'Unknown'}")
                
            elif action == "assign_acc":
                # Simple account assignment (for non-transfer transactions)
                account = db.query(models.Account).filter(models.Account.id == target_id).first()
                if not account:
                    await query.edit_message_text("❌ Account not found")
                    db.close()
                    return
                
                # Use existing assign function
                crud.assign_account_to_transaction(db, tx_id, target_id)
                
                await query.edit_message_text(
                    f"✅ **Transaction Assigned!**\n\n"
                    f"Account: {account.name}\n"
                    f"Amount: {tx.amount} SAR\n"
                    f"Type: {tx.type}"
                )
                logger.info(f"Assigned transaction {tx_id} to account {account.name}")
                
            elif action == "assign_cc":
                # Assign to credit card
                cc = db.query(models.CreditCard).filter(models.CreditCard.id == target_id).first()
                if not cc:
                    await query.edit_message_text("❌ Credit card not found")
                    db.close()
                    return
                
                # Update transaction with credit card
                tx.credit_card_id = target_id
                tx.status = "completed"
                
                # Update credit card balance
                if tx.type == "credit":
                    cc.current_balance += tx.amount  # Credits add to balance
                else:
                    cc.current_balance -= tx.amount  # Debits subtract from balance
                
                if tx.fees:
                    cc.current_balance -= tx.fees
                
                tx.balance_after_transaction = cc.current_balance
                db.commit()
                
                await query.edit_message_text(
                    f"✅ **Transaction Assigned!**\n\n"
                    f"Credit Card: {cc.name}\n"
                    f"Amount: {tx.amount} SAR\n"
                    f"Type: {tx.type}\n"
                    f"Balance: {cc.current_balance:.2f} SAR"
                )
                logger.info(f"Assigned transaction {tx_id} to credit card {cc.name}")
                
        except Exception as e:
            logger.error(f"Callback error: {e}")
            await query.edit_message_text(f"❌ Error: {str(e)}")
        finally:
            db.close()

def run_bot():
    if not TELEGRAM_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN not found. Exiting.")
        return

    application = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
    
    # Handlers
    application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))
    application.add_handler(CallbackQueryHandler(handle_callback))  # For inline button clicks
    
    logger.info("Bot is polling (dropping pending updates to skip old messages)...")
    # drop_pending_updates=True ensures we only process NEW messages, not old queued ones
    application.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    run_bot()
