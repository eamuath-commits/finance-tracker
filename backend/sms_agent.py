import os
import asyncio
import json
import logging
import google.generativeai as genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, filters, CallbackQueryHandler, TypeHandler
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

# Import local backend modules
import database
import models
import crud
import schemas

# Load environment variables
load_dotenv()

# Configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ALLOWED_USERS = os.getenv("ALLOWED_TELEGRAM_USERS", "")

# Configure Logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Configure Gemini AI
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    # Allow model to be configured via ENV, default to gemini-2.0-flash-exp (Smarter & Faster)
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
    logger.info(f"Using Gemini Model: {model_name}")
    model = genai.GenerativeModel(model_name)
else:
    logger.warning("GEMINI_API_KEY not found. AI parsing will fail.")
    model = None

# Configure AI Logger
ai_logger = logging.getLogger("gemini_logger")
ai_logger.setLevel(logging.INFO)
file_handler = logging.FileHandler("gemini_responses.log")
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(message)s'))
ai_logger.addHandler(file_handler)

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
            -   "Outgoing" / "Debit" -> Money LEAVES Source Account. (Transaction Type: DEBIT).
            -   "Credit" / "Deposit" -> Money ENTERS Destination Account. (Transaction Type: CREDIT).
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
      "currency": string,
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

    logger.info(f"Received message from {user_id}: {msg_text[:20]}...")
    
    try:
        await message.reply_text("⏳ Processing...")
    except Exception as e:
        logger.error(f"Could not send reply (likely channel restriction): {e}")

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
            sender=f"Telegram-{user_id}",
            body=msg_text,
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

    # 1. AI Parse
    result = await parse_with_ai(db, msg_text)

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

    # Check for Declines
    if result.get("status") == "failed":
        try: 
            await message.reply_text(
                f"🚫 **Transaction Declined**\n"
                f"Merchant: {result.get('merchant')}\n"
                f"Reason: Failed/Insufficient Funds"
            )
        except: pass
        raw_msg.status = models.MessageStatus.PARSED 
        raw_msg.error_log = "Transaction Declined (Not added to ledger)"
        db.commit()
        db.close()
        return

    # 2. Save to DB (Only Success Transactions)
    try:
        # Determine Source Account
        source_account = None
        source_last4 = result.get('source_account_last4')
        
        if source_last4:
            # Sanitize: Remove spaces, ensure only digits
            clean_source = "".join(filter(str.isdigit, str(source_last4)))
            if len(clean_source) >= 4:
                source_last4 = clean_source[-4:]
                source_account = crud.get_account_by_last_4(db, source_last4)
                logger.info(f"DEBUG: Source Logic -> Extracted: {source_last4}, Account: {source_account.name if source_account else 'None'}")

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
        
        if not source_account:
            # INTERACTIVE FALLBACK (Now creates a PENDING_ACTION transaction)
            
            # 1. Create the Transaction first as PENDING_ACTION
            # Use explicit 'None' for source to trigger special logic inside _create_transaction_logic
            pending_tx_result = await _create_transaction_logic(db, result, None, msg_text, message)
            
            # Extract the TX ID (assuming _create_transaction_logic returns something or we fetch it)
            # Actually _create_transaction_logic returns a string message or creates it.
            # We need to change _create_transaction_logic to Return the DB object if possible,
            # OR we fetch the latest transaction created.
            # BUT _create_transaction_logic inside sms_agent is designed to reply.
            
            # REFACTOR: _create_transaction_logic handles source_account=None
            # If source_account is None, it creates tx with status='pending_action' and account_id=None
            
            # INTERACTIVE BUTTONS
            accounts = db.query(models.Account).order_by(models.Account.name).all()
            if not accounts:
                await message.reply_text("❌ No accounts. Please add accounts first.")
                db.close()
                return

            keyboard = []
            # We need the Transaction ID to update it.
            # _create_transaction_logic now returns the TX object if successful.
            if hasattr(pending_tx_result, 'id'):
                 tx_id = pending_tx_result.id
            else:
                 # Fallback if logic failed to return object (shouldn't happen with update)
                 db.close()
                 return

            for i, acc in enumerate(accounts):
                # Callback data: act:{tx_id}:{acc_id} (Use ID instead of index for safety)
                # Max 64 bytes. UUID is 36. 'act:' is 4. acc_id (UUID) is 36. Too long (76).
                # Use Index!
                keyboard.append([InlineKeyboardButton(f"{acc.name}", callback_data=f"act:{tx_id}:{i}")])
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            await message.reply_text(
                f"❓ **Unknown Account**\n"
                f"Logged as Pending. Select **Source Account** to complete:",
                reply_markup=reply_markup
            )
            
            # We mark raw_msg as PARSED because the Transaction IS created (just pending action)
            raw_msg.status = models.MessageStatus.PARSED 
            db.commit()
            db.close()
            return

        # Explicit Flow (Source Found)
        await _create_transaction_logic(db, result, source_account, msg_text, message)
        
        # Update Raw Message Status
        raw_msg.status = models.MessageStatus.PARSED
        db.commit()
        db.close()

    except Exception as e:
        logger.error(f"DB Error: {e}")
        try: await message.reply_text(f"❌ Database Error: {e}")
        except: pass
        db.close()

async def _create_transaction_logic(db, result, source_account, msg_text, reply_target):
    # --- 1. Resolve Accounts (Context Aware) ---
    # Override Source Account if AI explicitly identified a different internal one
    ai_source_last4 = result.get('source_account_last4')
    if ai_source_last4:
        found_source = crud.get_account_by_last_4(db, str(ai_source_last4))
        if found_source:
             source_account = found_source # Trust AI extraction over heuristic
    
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

    # --- SWAP LOGIC: Ensure Credits are applied to the Destination Account ---
    # If Type is Credit and Dest is Internal, the transaction belongs to Dest.
    # (Fixes issue where "From: 8001 To: 7772" Credit was applied to 8001 because 8001 was matched first)
    if tx_type_str == 'credit' and dest_account:
        if not source_account or source_account.id != dest_account.id:
            logger.info(f"Swapping Primary Account for Credit: {source_account.name if source_account else 'None'} -> {dest_account.name}")
            source_account = dest_account
            # Note: The original source (sender) is still available via ai_source_last4 lookup in Merchant block
    
    # --- 3. Construct Merchant / Counterparty Name ---
    merchant_raw = "Unknown"
    clean_merchant = result.get('brand_name')

    if sub_type == 'purchase':
        merchant_raw = result.get('merchant') or "POS Purchase"
    
    elif sub_type in ['transfer', 'internal_transfer']:
        # LOGIC: Transfer Naming
        if tx_type_str == 'debit':
            # Money Leaving -> To Whom?
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
            # Money Entering -> From Whom?
            # Check if source is actually another internal account (Internal Transfer received)
            # The 'source_account' var here is the RECEIVER (since it's a Credit to 'source_account'). 
            # Wait, standard logic says 'source_account' is the one the transaction is attached to.
            # If Credit, we attached to the Receiver. So we need the SENDER.
            
            # AI might have put Sender Account in 'source_account_last4' or 'sender_name'
            # But if 'source_account' (variable) is the Receiver, we check result['source_account_last4']?
            # AI Logic: "Source Account" = Money LEAVING. "Destination Account" = Money ENTERING.
            # If this is a Credit, the User's Account is the DESTINATION.
            # So 'source_account' passed to this function SHOULD BE the User's Dest Account? 
            # No, 'handle_message' finds an account and calls it 'source_account'.
            
            # LET'S CORRELATE:
            # If Type=Credit, User's Account is the DESTINATION.
            # So `source_account` (the variable) is actually the Destination.
            # The SENDER is external or another internal account.
            
            # Check if AI identified a Source (Sender) that is Internal
            sender_internal = None
            if ai_source_last4:
                 sender_internal = crud.get_account_by_last_4(db, str(ai_source_last4))

            if sender_internal:
                merchant_raw = f"Transfer from {sender_internal.name}"
                clean_merchant = sender_internal.name
            elif result.get('sender_name'):
                merchant_raw = result.get('sender_name')
                clean_merchant = result.get('sender_name')
            elif result.get('source_bank'):
                merchant_raw = f"Transfer from {result.get('source_bank')}"
            else:
                merchant_raw = "Incoming Transfer"
    
    elif sub_type == 'payment':
        merchant_raw = result.get('merchant') or result.get('beneficiary') or "Bill Payment"
    elif sub_type == 'deposit':
        merchant_raw = result.get('source_bank') or "Cash Deposit"
    elif sub_type == 'withdrawal':
        merchant_raw = "ATM Withdrawal"

    if not clean_merchant:
        clean_merchant = merchant_raw

    # --- 4. Internal Transfer Detection ---
    # If explicitly detected or both accounts known
    is_internal = sub_type == 'internal_transfer' or (source_account and dest_account)
    if is_internal:
         sub_type = 'internal_transfer'
         category = "Transfer"

    # Determine Transaction Type
    tx_type_str = result.get('transaction_type', 'debit').lower()
    tx_type = models.TransactionType.CREDIT if tx_type_str == 'credit' else models.TransactionType.DEBIT
    
    # FIX: Explicitly convert Enum to string value for Pydantic/SQLAlchemy compatibility
    tx_type_value = tx_type.value

    # Parse Date from AI result or use current time
    tx_timestamp = datetime.now()
    ai_date_success = False
    
    # 1. Try AI Date
    if 'date' in result and result['date']:
        try:
            from dateutil import parser
            parsed_ai = parser.parse(result['date'])
            # Combine with time if available
            if 'time' in result and result['time']:
                 try:
                      time_part = parser.parse(result['time']).time()
                      parsed_ai = datetime.combine(parsed_ai.date(), time_part)
                 except: pass
            
            # CHECK VALIDITY immediately
            if parsed_ai > datetime.now() + timedelta(days=1):
                logger.warning(f"⚠️ AI Date {parsed_ai} is in the future. Ignoring it.")
                ai_date_success = False # Reject it
            else:
                tx_timestamp = parsed_ai
                ai_date_success = True
                
        except Exception as e:
             logger.warning(f"Could not parse AI date: {result.get('date')}, error: {e}")
             ai_date_success = False



    # 2. Regex Parsing (Always Run for Robustness)
    # Even if AI succeeded, we check if Regex finds a better match (e.g. Current Year)
    # This fixes cases like "26/1/22" where AI sees 22 as Year 2022, but Regex knows 26 is Year 2026.
    regex_date_success = False
    best_candidate = None
    
    if True: # Always run regex
        import re
        # logger.info("Running Regex Date Parsing...")
        
        # Current Year Info
        now = datetime.now()
        yr_short = now.strftime("%y") # '26'
        yr_long = str(now.year) # '2026'
        
        parsed_regex = None
        candidates = []

        # Helper to safely parse Y, M, D strings
        def try_parse(y_str, m_str, d_str):
            try:
                # Normalize Year
                y = int(y_str)
                if y < 100: y += 2000
                m, d = int(m_str), int(d_str)
                return datetime(y, m, d)
            except: return None

        # Strategy: Find ALL possible matches for ambiguous patterns, then score them.
        
        # Pattern A: YY/MM/DD (e.g. 26/01/22)
        match_yy_mm_dd = re.search(r'\b(\d{2})[/-](\d{1,2})[/-](\d{1,2})\b', msg_text)
        if match_yy_mm_dd:
            # Ambiguous: could be YY/MM/DD or DD/MM/YY
            p1, p2, p3 = match_yy_mm_dd.groups()
            
            # Option 1: YY/MM/DD (p1=Year)
            dt1 = try_parse(p1, p2, p3)
            if dt1: candidates.append(dt1)
            
            # Option 2: DD/MM/YY (p3=Year)
            dt2 = try_parse(p3, p2, p1)
            if dt2: candidates.append(dt2)

        # Pattern B: DD/MM/YYYY (Full Year) -> Unambiguous Year, but capture anyway
        match_full = re.search(r'\b(\d{1,2})[/-](\d{1,2})[/-](' + yr_long + r')', msg_text)
        if match_full:
             dt_full = try_parse(match_full.group(3), match_full.group(2), match_full.group(1))
             if dt_full: candidates.append(dt_full)

        # SELECTION LOGIC
        # We prefer the candidate where Year == Current Year
        best_candidate = None
        
        logger.info(f"Date Candidates found: {candidates}")
        
        for cand in candidates:
            # Rule 1: Must not be future (allow 1 day buffer)
            if cand > now + timedelta(days=1):
                continue
                
            # Rule 2: Prefer Current Year
            if cand.year == now.year:
                best_candidate = cand
                break # Found a perfect match!
            
            # Rule 3: If no current year match yet, take the most recent valid one (e.g. late Dec last year)
            if best_candidate is None:
                best_candidate = cand
            else:
                 # If we have one, keeps the first one or logic? 
                 # Usually if we have "22" vs "26", and neither is current year (say current is 2025), 
                 # we'd just want reasonable.
                 # But sticking to "Matches Current Year" is the strongest heuristic for "26/1/22" in 2026.
                 pass
        
        if best_candidate:
            logger.info(f"Selected Best Regex Date: {best_candidate}")
            tx_timestamp = best_candidate
            
            # Try to grab time HH:MM
            time_match = re.search(r'\b(\d{1,2}):(\d{2})', msg_text)
            if time_match:
                try:
                    h, m = time_match.groups()
                    tx_timestamp = best_candidate.replace(hour=int(h), minute=int(m))
                except: pass
    
    # SANITY CHECK (Again, final)
    # If the parsed date is more than 24 hours in the future, assume parsing error and use NOW.
    # SANITY CHECK (Again, final)
    # If the parsed date is more than 24 hours in the future, assume parsing error and use NOW.
    # from datetime import timedelta (Removed - Global)
    if tx_timestamp > datetime.now() + timedelta(days=1):
         logger.warning(f"⚠️ Future date detected (Parsed: {tx_timestamp}, Now: {datetime.now()}). Reverting to NOW.")
         tx_timestamp = datetime.now()

    # Resolve Destination Account Early to determine Status
    dest_last4 = result.get('destination_account_last4')
    dest_account = None
    if dest_last4:
         dest_account = crud.get_account_by_last_4(db, str(dest_last4))
    
    # Fallback: If we resolved the merchant to an account earlier
    # Note: 'dest_acc' comes from merchant parsing logic earlier in the file
    if not dest_account and 'dest_acc' in locals() and dest_acc:
        dest_account = dest_acc

    # Determine Status: Pending if Internal Transfer (Wait for confirmation SMS)
    tx_status = "completed"
    if source_account and dest_account and dest_account.id != source_account.id:
         tx_status = "pending"
         
         # Same-Bank Exception: If banks match, assume instant transfer and complete immediately
         if (source_account and dest_account and source_account.bank_name and dest_account.bank_name and 
             source_account.bank_name.strip().lower() == dest_account.bank_name.strip().lower()):
             tx_status = "completed"
             logger.info(f"Same-bank transfer detected ({source_account.bank_name}). Marking as completed immediately.")
    
    # Handle Null Source (Ambiguous)
    acc_id = source_account.id if source_account else None
    if not source_account:
        tx_status = "pending_action"

    transaction = schemas.TransactionCreate(
        account_id=acc_id,
        amount=result['amount'], 
        fees=result.get('fees', 0.0), # Add fees
        merchant=merchant_raw,
        category=category,
        type=tx_type_value,
        timestamp=tx_timestamp,
        raw_sms_content=msg_text,
        status=tx_status 
    )

    # Check for Duplicate Main Transaction (e.g. Dual SMS for same transfer)
    # Only if source is known. If unknown, we act as new.
    if source_account:
        duplicate = crud.find_potential_duplicate(
            db, 
            source_account.id, 
            result['amount'], 
            tx_type_value, 
            tx_timestamp
        )
        if duplicate:
            if duplicate.status == "pending":
                # Confirm this transaction
                crud.confirm_transaction(db, duplicate.id)
                msg_extras = f"Confirmed Pending Transaction (ID: {duplicate.id})"
                
                # Try to find and confirm the counterpart (Debit Leg) on the original source
                real_source_last4 = result.get('source_account_last4')
                if real_source_last4:
                    real_source = crud.get_account_by_last_4(db, str(real_source_last4))
                    if real_source:
                        pending_debit = crud.find_potential_duplicate(
                            db, real_source.id, result['amount'], "debit", tx_timestamp
                        )
                        if pending_debit and pending_debit.status == "pending":
                            crud.confirm_transaction(db, pending_debit.id)
                            msg_extras += f" & Linked Debit ({real_source.name})"

                logger.info(f"Duplicate confirmed: {msg_extras}")
                return f"Transaction Confirmed via Second SMS. {msg_extras}"
            
            logger.info(f"Duplicate transaction detected (skipping): {duplicate.id}")
            return f"Duplicate transaction ignored (ID: {duplicate.id})"

    try:
        new_tx = crud.create_transaction(db=db, transaction=transaction)
        # Save Training Example (Memory)
        try:
             crud.create_training_example(db, msg_text, json.dumps(result))
        except Exception as e_mem:
             logger.error(f"Failed to save training example: {e_mem}")
             
        # Return the object for calling function usage
        # If Pending Action (No Account), don't send normal Added message yet
        if tx_status == "pending_action":
            # AMBIGUOUS TRANSFER LOGIC: 
            # If we know the destination, create the Credit Leg immediately!
            if dest_account:
                 logger.info(f"Ambiguous Source but Known Destination ({dest_account.name}). Creating Credit Leg.")
                 try:
                     credit_tx = schemas.TransactionCreate(
                        account_id=dest_account.id,
                        amount=result['amount'],
                        merchant="Unknown Account", # Source Unknown
                        category="Transfer",
                        type="credit", # Incoming
                        timestamp=tx_timestamp,
                        raw_sms_content=msg_text,
                        status="pending" # Mark as Pending until Source is resolved
                     )
                     crud.create_transaction(db=db, transaction=credit_tx)
                 except Exception as e_cred:
                     logger.error(f"Failed to create immediate credit leg: {e_cred}")

            return new_tx

    except Exception as e:
        logger.error(f"Failed to create main transaction: {e}")
        return f"Error creating transaction: {str(e)}"

    status_icon = "⏳" if tx_status == "pending" else "✅"
    status_text = "Pending (Waiting for Confirmation)" if tx_status == "pending" else "Added"
    reply_message = f"{status_icon} Transaction {status_text}\nAmount: {result['amount']}\nMerchant: {merchant_raw}\nCategory: {category}\nDate: {tx_timestamp.strftime('%Y-%m-%d %H:%M')}"

    # Handle Internal Transfer (Credit Leg)
    # dest_account already resolved above

    # Handle Internal Transfer (Credit Leg)
    # Only if both accounts are known and different
    if dest_account and source_account and dest_account.id != source_account.id:
         credit_tx = schemas.TransactionCreate(
             account_id=dest_account.id,
             amount=result['amount'], 
             merchant=f"Transfer from {source_account.name}",
             category="Transfer", 
             type=models.TransactionType.CREDIT.value,
             timestamp=tx_timestamp, # Use same timestamp
             raw_sms_content=f"Auto-credit from transfer: {msg_text}",
             status=tx_status
         )
         # Check for Duplicate Credit Leg
         dup_credit = crud.find_potential_duplicate(
             db,
             dest_account.id,
             result['amount'],
             models.TransactionType.CREDIT.value,
             tx_timestamp
         )
         if dup_credit:
             logger.info("Credit leg already exists (skipping)")
             reply_message += f"\n\n🔀 **Linked Transfer**\n(Already Exists: {dest_account.name})"
         else:
             try:
                 crud.create_transaction(db=db, transaction=credit_tx)
                 reply_message += f"\n\n🔀 **Linked Transfer**\nCredited: {dest_account.name}"
             except Exception as e:
                 logger.error(f"Failed to create credit leg: {e}")

    # SIGNAL FOR INTERACTIVE SENDER LINKING
    # Condition: 
    # 1. Type is Credit (Incoming)
    # 2. Category is Transfer (Internal/External)
    # 3. Source Account (Sender Internal) is NOT known (source_account here is the Primary/Dest)
    # 4. Sender Name is missing or generic (so we don't know who sent it)
    # 5. Not already linked (we just created it as a single leg or didn't find the source)
    
    should_link_sender = (
        tx_type_value == models.TransactionType.CREDIT.value and
        category == "Transfer" and
        (not result.get('source_account_last4')) and # No specific source identified
        (not result.get('sender_name')) # No external sender name
    )
        
        if should_link_sender:
             reply_message += f"\n❓ [LINK_SENDER:{new_tx.id}]"

        try:
            # Edit if it's a callback query message, else reply
            
            # CHECK FOR LINK_SENDER SIGNAL
            if "❓ [LINK_SENDER:" in reply_message:
                 clean_reply, signal_part = reply_message.split("❓ [LINK_SENDER:")
                 tx_id_str = signal_part.replace("]", "")
                 
                 # Prepare Buttons for Linking Source
                 link_keyboard = []
                 accounts_link = db.query(models.Account).order_by(models.Account.name).all()
                 for i, acc in enumerate(accounts_link):
                     # Use 'link:' prefix for callback handling
                     link_keyboard.append([InlineKeyboardButton(f"{acc.name}", callback_data=f"link:{tx_id_str}:{i}")])
                 
                 link_markup = InlineKeyboardMarkup(link_keyboard)
                 clean_reply += "\n❓ **Link Source Account?**"
                 
                 if hasattr(reply_target, 'edit_text'):
                     await reply_target.edit_text(clean_reply, reply_markup=link_markup)
                 else:
                     await reply_target.reply_text(clean_reply, reply_markup=link_markup)

            else:
                # Normal Reply
                if hasattr(reply_target, 'edit_text'):
                     await reply_target.edit_text(reply_message)
                else:
                     await reply_target.reply_text(reply_message)
        except Exception as e:
            logger.error(f"Reply error: {e}")


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handles category/account selection from buttons.
    """
    query = update.callback_query
    await query.answer() # Acknowledge
    
    data = query.data
    # data format: act:{tx_id}:{acc_index}
    
    try:
        if data.startswith("act:"):
            _, tx_id, acc_idx_str = data.split(":")
            acc_idx = int(acc_idx_str)
            
            db = database.SessionLocal()
            
            # Fetch Accounts safely
            accounts = db.query(models.Account).order_by(models.Account.name).all()
            if acc_idx >= len(accounts):
                 await query.edit_message_text("❌ Error: Account selection invalid.")
                 db.close()
                 return
            
            selected_account = accounts[acc_idx]
            
            # Assign Account to Transaction
            try:
                updated_tx = crud.assign_account_to_transaction(db, tx_id, selected_account.id)
                success_msg = f"✅ Assigned to **{selected_account.name}**. Balance Updated."
                
                # UPDATE LINKED TRANSACTION (If Duplicate/Linked Credit Leg exists)
                # When we resolve the Source (Debit) account, we should verify if there is a Destination (Credit) leg
                # that has "Unknown Account" as the merchant/source name, and update it.
                linked_tx = crud.find_potential_duplicate(
                    db,
                    None, # Verify across ALL accounts? No, we don't know the Dest account easily here unless we query.
                    # Actually, we can just search by 'timestamp' (+/- 1s) and 'amount' and 'type=credit'
                    updated_tx.amount,
                    "credit" if updated_tx.type == "debit" else "debit",
                    updated_tx.timestamp
                )
                
                # Note: find_potential_duplicate usually takes account_id. 
                # If we pass None, we need to ensure crud handles it or we search manually.
                # Let's do a manual search for safety since find_potential_duplicate is specific.
                
                linked_candidates = db.query(models.Transaction).filter(
                    models.Transaction.amount == updated_tx.amount,
                    models.Transaction.type != updated_tx.type,
                    models.Transaction.timestamp == updated_tx.timestamp
                ).all()
                
                for link in linked_candidates:
                    # Update Merchant Name to reflect the now-known source
                    if updated_tx.type == "debit": # This was the Source
                        link.merchant = f"Transfer from {selected_account.name}"
                        # Also Confirm the Linked Credit since Source is now known
                        link.status = "completed"
                        db.commit()
                        success_msg += f"\n🔄 Updated Linked Credit on {link.account.name}"
                    elif updated_tx.type == "credit":
                         link.merchant = f"Transfer to {selected_account.name}"
                         # Also Confirm the Linked Credit since Source is now known
                         link.status = "completed"
                         db.commit()

                await query.edit_message_text(success_msg)
            except Exception as e:
                await query.edit_message_text(f"❌ Error updating transaction: {e}")

            db.close()

        # LINK SENDER CALLBACK
        elif data.startswith("link:"):
             _, tx_id, acc_idx_str = data.split(":")
             acc_idx = int(acc_idx_str)
             
             db = database.SessionLocal()
             accounts = db.query(models.Account).order_by(models.Account.name).all()
             
             if acc_idx >= len(accounts):
                  await query.edit_message_text("❌ Error: Account selection invalid.")
                  db.close()
                  return
             
             source_account = accounts[acc_idx]
             
             # Fetch the Credit Transaction (Destination)
             credit_tx = crud.get_transaction(db, tx_id)
             if not credit_tx:
                  await query.edit_message_text("❌ Error: Original Credit Transaction not found.")
                  db.close()
                  return

             # Create the Debit Leg (Sender)
             try:
                 debit_tx = schemas.TransactionCreate(
                     account_id=source_account.id,
                     amount=credit_tx.amount,
                     merchant=f"Transfer to {credit_tx.account.name}",
                     category="Transfer",
                     type="debit",
                     timestamp=credit_tx.timestamp,
                     raw_sms_content=f"Linked Debit Source for TX {tx_id}",
                     status="completed" # Source linkage confirms both
                 )
                 
                 new_debit = crud.create_transaction(db=db, transaction=debit_tx)
                 
                 # IMPORTANT: Update the Credit Leg's description to show the Source
                 credit_tx.merchant = f"Transfer from {source_account.name}"
                 # credit_tx.status = "completed" # It's likely already created as completed/verified, but ensure it.
                 db.commit()
                 
                 await query.edit_message_text(
                     f"✅ **Source Linked**: {source_account.name}\n"
                     f"🔄 Created Debit Leg: {new_debit.amount}\n"
                     f"✅ Updated Credit Leg: Transfer from {source_account.name}"
                 )
             except Exception as e:
                  await query.edit_message_text(f"❌ Error creating sender leg: {e}")
             
             db.close()

    except Exception as e:
        logger.error(f"Callback Error: {e}")
        if query and query.message:
            await query.edit_message_text(f"❌ System Error: {e}")
        else:
            await context.bot.send_message(chat_id=update.effective_chat.id, text=f"❌ System Error: {e}")


if __name__ == '__main__':
    # Fix for asyncio loop in some environments
    import nest_asyncio
    try:
        nest_asyncio.apply()
    except:
        pass

    if not TELEGRAM_BOT_TOKEN:
        print("Error: TELEGRAM_BOT_TOKEN is missing in .env")
        exit(1)

    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    
    async def debug_log_update(update: Update, context: ContextTypes.DEFAULT_TYPE):
        logger.info(f"raw_update: {update.to_dict()}")

    # Handlers
    app.add_handler(TypeHandler(Update, debug_log_update), group=-1)

    start_handler = MessageHandler(filters.COMMAND & filters.Regex(r"^/start"), lambda u, c: u.message.reply_text("👋 Hello! I am your SMS Finance Agent. Forward me a bank SMS!"))
    
    msg_handler = MessageHandler(~filters.COMMAND, handle_message)
    callback_handler = CallbackQueryHandler(handle_callback)
    
    app.add_handler(start_handler)
    app.add_handler(msg_handler)
    app.add_handler(callback_handler)
    
    # Verify Bot Identity
    print("⏳ verifying token...")
    async def print_bot_info():
         bot = await app.bot.get_me()
         print(f"✅ Bot Connected: @{bot.username} (ID: {bot.id})")

    loop = asyncio.get_event_loop()
    loop.run_until_complete(print_bot_info())

    print("🤖 SMS Agent is polling Telegram...")
    app.run_polling()
