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

# --- Configuration ---
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Gemini Setup
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        logger.info("Gemini AI Configured Successfully (Model: gemini-2.0-flash-exp).")
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
        # Heuristic: Try to find any account number in the result fields
        source_last4 = result.get('source_account_last4') or result.get('destination_account_last4')
        
        if source_last4:
            # Sanitize: Remove spaces, ensure only digits
            clean_source = "".join(filter(str.isdigit, str(source_last4)))
            if len(clean_source) >= 4:
                source_last4 = clean_source[-4:]
                source_account = crud.get_account_by_last_4(db, source_last4)
                if source_account:
                    logger.info(f"DEBUG: Source Logic -> Extracted: {source_last4}, Account: {source_account.name}")

        # Fallback: Check card_info for digits if source undefined (e.g. "By: 9365" or "mada x4390")
        if not source_account and result.get('card_info'):
             # Extract digits from card_info (e.g. "mada 9365" -> "9365")
             card_digits = "".join(filter(str.isdigit, str(result.get('card_info'))))
             if len(card_digits) >= 4:
                 source_last4 = card_digits[-4:]
                 source_account = crud.get_account_by_last_4(db, source_last4)
                 if source_account:
                    logger.info(f"DEBUG: Source Logic -> Fallback to Card Info: {source_last4}, Account: {source_account.name}")

        # Last Resort: Manual Regex extraction from raw text if AI and card_info failed
        if not source_account:
            # Look for "By:4390" or similar
            regex_match = re.search(r"By:(\d{4})", msg_text)
            if regex_match:
                source_last4 = regex_match.group(1)
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
        
        if not source_account:
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
                # Exchange rate will be calculated on confirmation or stored now if we want
                # For now, let's keep it simple.

            # We need to bypass the 'transaction.account_id' requirement in models? No, it's nullable in SQL but Schema might strict.
            # Schema 'TransactionCreate' has account_id: str. 
            # We need a Dummy Account or allow None. 
            # Let's create a "Pending Buffer" transaction.
            # Actually, looking at `crud.create_transaction`, it requires account_id to update balance.
            # If account_id is None, it just saves the TX.
            
            # NOTE: TransactionCreate schema enforces account_id: str.
            # We will use the ID of the first account as a placeholder? No, dangerous.
            # We will catch this in the UI. 
            # Better: Let's create a "System Pending" account in seed? Or just pass a dummy GUID if we have to.
            # But proper fix: Make account_id Optional in schema? Yes.
            
            # Hack for now: Use a special "UNKNOWN" ID if possible, or just fail safely.
            # Let's reply to user to manual link.
            
            db.close() # Close DB before async wait
            button_rows = [] 
            # Creating Inline Keyboard is complex without callback query handler setup globally.
            # For this MVP agent, we will just reply with text instructions.
            
            await message.reply_text(
                f"❓ **Unknown Account**\n"
                f"I parsed this as: {result.get('transaction_type')} of {result.get('amount')} {result.get('currency', 'SAR')}.\n"
                f"But I couldn't match it to any linked account.\n\n"
                f"Please add the account ending in relevant digits, or forward a clearer message."
            )
            
            raw_msg.status = models.MessageStatus.FAILED
            raw_msg.error_log = "Unknown Account - pending user action"
            
            # Re-open DB to save status
            db = database.SessionLocal()
            db_msg = db.query(models.RawMessage).filter(models.RawMessage.id == raw_msg.id).first()
            if db_msg:
                db_msg.status = models.MessageStatus.FAILED
                db_msg.error_log = "Unknown Account"
                db.commit()
            db.close()
            return

        # 3. Create Transaction Logic
        await _create_transaction_logic(db, result, source_account, msg_text, message)
        
        # Update Raw Message Status
        raw_msg.status = models.MessageStatus.PARSED
        db.commit()
        db.close()

    except Exception as e:
        logger.error(f"DB Error: {e}")
        try: await message.reply_text(f"❌ Database Error: {e}")
        except: pass
        if 'db' in locals(): db.close()

async def _create_transaction_logic(db, result, source_account, msg_text, reply_target=None):
    # --- 0. Multi-Currency Handling & Conversion ---
    original_amount = result.get('amount')
    original_currency = result.get('currency', 'SAR').upper()
    sar_amount = original_amount
    exchange_rate = 1.0

    if original_currency != 'SAR':
        # Fetch exchange rate
        # Prioritize card's bank if known, otherwise bank identified by AI
        bank_name = source_account.bank_name if source_account else result.get('source_bank')
        exchange_rate = exchange_rate_service.get_rate(original_currency, "SAR", bank_name)
        
        if exchange_rate:
            sar_amount = round(original_amount * exchange_rate, 2)
            logger.info(f"Converted {original_amount} {original_currency} to {sar_amount} SAR using rate {exchange_rate}")
            # Update reply message if possible later
        else:
            logger.warning(f"Could not find exchange rate for {original_currency}. Using original amount as fallback.")

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
            if ai_source_last4:
                # Try finding the sender account
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

    # --- 4. Create Transaction Record ---
    transaction_data = schemas.TransactionCreate(
        account_id=source_account.id,
        amount=sar_amount,
        original_amount=original_amount,
        original_currency=original_currency,
        exchange_rate=exchange_rate if original_currency != 'SAR' else None,
        merchant=merchant_raw,
        raw_sms_content=msg_text,
        timestamp=datetime.strptime(result['timestamp'], "%Y-%m-%d %H:%M") if result.get('timestamp') else datetime.now(),
        category=category,
        type=tx_type_str,
        status="completed"
    )
    
    tx = crud.create_transaction(db, transaction_data)
    
    # --- 5. Notifications & Feedback ---
    if reply_target:
        # Build success message
        response_txt = f"✅ **Success!**\n"
        response_txt += f"Account: {source_account.name}\n"
        response_txt += f"Amount: {sar_amount} SAR\n"
        if original_currency != 'SAR':
             response_txt += f"(Original: {original_amount} {original_currency})\n"
        response_txt += f"Merchant: {merchant_raw}\n"
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
