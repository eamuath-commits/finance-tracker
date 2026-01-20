import os
import asyncio
import json
import logging
import google.generativeai as genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, filters, CallbackQueryHandler, TypeHandler
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from datetime import datetime

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
    # Allow model to be configured via ENV, default to 1.5-flash (Standard Stable Model)
    model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
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

async def parse_with_ai(text: str):
    """
    Sends SMS text to Gemini AI and expects a JSON response.
    Retries on 429 errors.
    """
    if not model:
        return {"error": "AI_NOT_CONFIGURED"}

    today_date = datetime.now().strftime("%Y-%m-%d")
    prompt = f"""
    You are a generic financial expert. Your job is to extract FULL details from banking SMS messages.
    
    Context:
    - Current Date: {today_date} (Use this to resolve ambiguous years, e.g. '26' -> '2026')

    SMS: "{text}"

    **Extraction Rules:**
    1. **Identify Type**: Is this a Purchase, Transfer (In/Out), Bill Payment, Cash Withdrawal, Deposit, or Decline/Failed transaction?
    2. **Merchant/Counterparty**: 
       - For Purchases: Store Name (e.g. "Starbucks", "Uber").
       - For Transfers: Recipient Name or Account (e.g. "Ahmed", "Account 7772"). 
       - If message says "To: 1234", "1234" is the Recipient.
       - For Government/Bills: Entity Name (e.g. "STC", "MOI").
    3. **Internal Transfers**: If it says "Internal Transfer" or transfer between your own accounts, set merchant to "Self" or "Internal".
    4. **Declines**: If the message says "Declined", "Failed", or "Insufficient Funds", set `status` to "failed".
    5. **Amount**: Extract the numerical amount. Ignore currency symbols in the number, but capture the currency code separately.
    6. **Accounts**:
        - **Source Account**: Look for "From Account", "Account:", ending digits.
        - **Destination Account**: Look for "To", "To Account", ending digits (Common in internal transfers).
    7. **Brand Name (Strict)**: 
        - Extract the clean BRAND NAME for the merchant.
        - REMOVE location data, store IDs, terminal codes, and city names (e.g. "Starbucks Riyadh #123" -> "Starbucks").
        - If the merchant is a person (Transfer), use their name.
        - DO NOT guess. If you cannot extract a clean name, use null.
        - DO NOT hallucinate. Only use text present in the SMS.

    **Output JSON Schema:**
    {{
      "is_financial_event": boolean, (True for ANY money related message, including declines)
      "is_transaction": boolean, (True ONLY if money actually moved. False for Declines or purely informational msgs)
      "transaction_type": "debit" | "credit",
      "sub_type": "purchase" | "transfer" | "payment" | "withdrawal" | "deposit" | "internal_transfer" | "decline",
      "merchant": string (The RAW merchant string found in the text),
      "brand_name": string (The CLEAN brand name for logo fetching, e.g. "Uber", "Netflix"),
      "amount": number,
      "currency": string,
      "date": "YYYY-MM-DD",
      "time": "HH:MM", (24-hour format)
      "category": string (Best guess: Food, Transport, Bills, Transfer, Income, etc.),
      "source_account_last4": string,
      "destination_account_last4": stringOrNull,
      "status": "success" | "failed"
    }}

    Respond ONLY with valid JSON.
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
    result = await parse_with_ai(msg_text)

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
            source_account = crud.get_account_by_last_4(db, str(source_last4))

        # Smart Handling for Incoming Credits (Swap Source if Destination account is owned by user)
        # E.g. SMS says "To: 7772", AI parses Dest=7772. If 7772 is ours, we should credit IT.
        dest_last4 = result.get('destination_account_last4')
        # Fallback: If AI put account number in merchant field (common in credits)
        if not dest_last4 and result.get('merchant') and str(result.get('merchant')).isdigit():
             dest_last4 = result.get('merchant')

        if result.get('transaction_type') == 'credit' and dest_last4:
             dest_last4 = str(dest_last4)
             # Clean digits just in case
             dest_last4 = "".join(filter(str.isdigit, dest_last4))[-4:]
             if len(dest_last4) == 4:
                 dest_acc_obj = crud.get_account_by_last_4(db, dest_last4)
                 if dest_acc_obj:
                     logger.info(f"Incoming Credit detected to own account {dest_acc_obj.name}. Swapping primary account.")
                     source_account = dest_acc_obj
        
        if not source_account:
            # INTERACTIVE FALLBACK
            # Force user to select account if ambiguous
            accounts = db.query(models.Account).order_by(models.Account.name).all()
            
            if not accounts:
                await message.reply_text("❌ No accounts in database. Please add accounts in the Web UI first.")
                raw_msg.status = models.MessageStatus.FAILED
                raw_msg.error_log = "No accounts (Ambiguous)"
                db.commit()
                db.close()
                return

            keyboard = []
            for i, acc in enumerate(accounts):
                # Callback data: act:{raw_msg_id}:{index}
                # Using index to keep payload short
                keyboard.append([InlineKeyboardButton(f"{acc.name} (...{acc.last_4_digits or '?'})", callback_data=f"act:{raw_msg.id}:{i}")])
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await message.reply_text(
                f"❓ **Ambiguous Account**\n"
                f"I couldn't identify the source account for this {result.get('amount')} transaction.\n"
                f"Please select the **Source Account**:",
                reply_markup=reply_markup
            )
            
            # We leave raw_msg as PENDING.
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
    # Prepare Schema
    category = result.get('category') or "Uncategorized"
    if result.get('sub_type') == 'internal_transfer':
        category = "Transfer"
    
    clean_merchant = result.get('brand_name')
    merchant_raw = result.get('merchant') or "Unknown"

    # Optimization: If merchant is numeric (e.g. '1505'), try to find the account name
    if merchant_raw.isdigit() or (len(merchant_raw) < 6 and merchant_raw.isnumeric()):
         dest_acc = crud.get_account_by_last_4(db, merchant_raw)
         if dest_acc:
             merchant_raw = f"{dest_acc.name} Account"
             clean_merchant = dest_acc.name # For logo lookup

    # Optimization: If AI identified a destination account Last 4, check if it matches a known account
    # This fixes cases where AI extracts "MUATH" (sender) instead of "7772" (recipient)
    dest_last4 = result.get('destination_account_last4')
    if dest_last4:
         # Clean digits only just in case
         clean_last4 = "".join(filter(str.isdigit, str(dest_last4)))[-4:]
         if len(clean_last4) == 4:
             dest_acc = crud.get_account_by_last_4(db, clean_last4)
             if dest_acc:
                 # Found the destination account! Use it as the Merchant/Counterparty
                 merchant_raw = f"{dest_acc.name} Account"
                 clean_merchant = dest_acc.name
                 category = "Transfer" # Ensure category is correct

    if not clean_merchant or clean_merchant == "null":
        clean_merchant = merchant_raw

    # Ensure "Account" suffix if it's a known internal account name but missing the suffix
    # This covers cases where AI extracts "Daily Expense" but user wants "Daily Expense Account"
    # We check if clean_merchant matches any existing account name
    known_account = crud.get_account_by_name(db, clean_merchant)
    # Only append " Account" if it is a Transfer (to distinguish internal transfer vs external merchant)
    if known_account and not merchant_raw.endswith(" Account") and category == "Transfer":
        merchant_raw = f"{known_account.name} Account"
    
    # NEW: If AI returned "Account" suffix for a non-transfer (e.g. "STC Account" for a Bill), strip it
    if category != "Transfer" and merchant_raw.endswith(" Account"):
        merchant_raw = merchant_raw[:-8]

    # Determine Transaction Type
    tx_type_str = result.get('transaction_type', 'debit').lower()
    tx_type = models.TransactionType.CREDIT if tx_type_str == 'credit' else models.TransactionType.DEBIT
    
    # FIX: Explicitly convert Enum to string value for Pydantic/SQLAlchemy compatibility
    tx_type_value = tx_type.value

    # Parse Date from AI result or use current time
    tx_timestamp = datetime.now()
    if 'date' in result and result['date']:
        try:
            # AI usually returns ISO format or YYYY-MM-DD
            # We can use a lenient parser or try standard formats
            from dateutil import parser
            tx_timestamp = parser.parse(result['date'])
            # Combine with time if available
            if 'time' in result and result['time']:
                 try:
                     time_part = parser.parse(result['time']).time()
                     tx_timestamp = datetime.combine(tx_timestamp.date(), time_part)
                 except:
                     pass # Keep just the date part if time fails 
        except Exception as e:
             logger.warning(f"Could not parse date: {result.get('date')}, error: {e}. AI response was: {json.dumps(result)}")
             tx_timestamp = datetime.now()
    else:
        logger.info(f"No date returned by AI. Using now(). AI Output: {json.dumps(result)}")

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
    if dest_account and dest_account.id != source_account.id:
         tx_status = "pending"

    transaction = schemas.TransactionCreate(
        account_id=source_account.id,
        amount=result['amount'], 
        merchant=merchant_raw,
        category=category,
        type=tx_type_value,
        timestamp=tx_timestamp,
        raw_sms_content=msg_text,
        status=tx_status 
    )

    # Check for Duplicate Main Transaction (e.g. Dual SMS for same transfer)
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
        crud.create_transaction(db=db, transaction=transaction)
    except Exception as e:
        logger.error(f"Failed to create main transaction: {e}")
        return f"Error creating transaction: {str(e)}"

    status_icon = "⏳" if tx_status == "pending" else "✅"
    status_text = "Pending (Waiting for Confirmation)" if tx_status == "pending" else "Added"
    reply_message = f"{status_icon} Transaction {status_text}\nAmount: {result['amount']}\nMerchant: {merchant_raw}\nCategory: {category}\nDate: {tx_timestamp.strftime('%Y-%m-%d %H:%M')}"

    # Handle Internal Transfer (Credit Leg)
    # dest_account already resolved above

    if dest_account and dest_account.id != source_account.id:
         credit_tx = schemas.TransactionCreate(
             account_id=dest_account.id,
             amount=result['amount'], 
             merchant=f"{source_account.name} Account",
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

    try:
        # Edit if it's a callback query message, else reply
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
    # data format: act:{raw_msg_id}:{acc_index}
    
    try:
        if data.startswith("act:"):
            _, raw_id, acc_idx_str = data.split(":")
            acc_idx = int(acc_idx_str)
            
            db = database.SessionLocal()
            raw_msg = db.query(models.RawMessage).filter(models.RawMessage.id == raw_id).first()
            
            if not raw_msg:
                await query.edit_text("❌ Error: Message not found in DB.")
                db.close()
                return

            # Fetch Accounts safely
            accounts = db.query(models.Account).order_by(models.Account.name).all()
            if acc_idx >= len(accounts):
                 await query.edit_text("❌ Error: Account selection invalid.")
                 db.close()
                 return
            
            selected_account = accounts[acc_idx]
            
            # Re-parse AI (Safest way to get data back)
            result = await parse_with_ai(raw_msg.body)
            
            if "error" in result:
                 await query.edit_text(f"❌ AI Re-parse Error: {result['error']}")
                 db.close()
                 return

            # Create Transaction with Selected Account
            await _create_transaction_logic(db, result, selected_account, raw_msg.body, query.message)
            
            raw_msg.status = models.MessageStatus.PARSED
            db.commit()
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
