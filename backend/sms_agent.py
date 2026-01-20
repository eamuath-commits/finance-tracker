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

    prompt = f"""
    You are a generic financial expert. Your job is to extract FULL details from banking SMS messages.

    SMS: "{text}"

    **Extraction Rules:**
    1. **Identify Type**: Is this a Purchase, Transfer (In/Out), Bill Payment, Cash Withdrawal, Deposit, or Decline/Failed transaction?
    2. **Merchant/Counterparty**: 
       - For Purchases: Store Name (e.g. "Starbucks", "Uber").
       - For Transfers: Recipient Name or Account (e.g. "Ahmed", "Account 1234").
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
        
        # DEDUPLICATION CHECK
        # Check if this exact message body from this sender was already processed/pending
        # This prevents loops if Telegram resends distinct updates for same message or bot restarts
        existing_msg = db.query(models.RawMessage).filter(
            models.RawMessage.sender == f"Telegram-{user_id}",
            models.RawMessage.body == msg_text,
            models.RawMessage.status.in_([models.MessageStatus.PARSED, models.MessageStatus.PENDING])
        ).first()

        if existing_msg:
             logger.info(f"Skipping duplicate message from {user_id} (ID: {existing_msg.id})")
             await message.reply_text("ℹ️ Skipped duplicate message.")
             db.close()
             return

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

    if not clean_merchant or clean_merchant == "null":
        clean_merchant = merchant_raw

    # Ensure "Account" suffix if it's a known internal account name but missing the suffix
    # This covers cases where AI extracts "Daily Expense" but user wants "Daily Expense Account"
    # We check if clean_merchant matches any existing account name
    known_account = crud.get_account_by_name(db, clean_merchant)
    if known_account and not merchant_raw.endswith(" Account"):
        merchant_raw = f"{known_account.name} Account"

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
        except:
             logger.warning(f"Could not parse date: {result['date']}, using now()")

    transaction = schemas.TransactionCreate(
        account_id=source_account.id,
        amount=result['amount'], 
        merchant=merchant_raw,
        category=category,
        type=tx_type_value,
        timestamp=tx_timestamp,
        raw_sms_content=msg_text 
    )

    try:
        crud.create_transaction(db=db, transaction=transaction)
    except Exception as e:
        logger.error(f"Failed to create main transaction: {e}")
        return f"Error creating transaction: {str(e)}"

    reply_message = f"✅ Transaction Added\nAmount: {result['amount']}\nMerchant: {merchant_raw}\nCategory: {category}\nDate: {tx_timestamp.strftime('%Y-%m-%d %H:%M')}"

    # Handle Internal Transfer (Credit Leg)
    # 1. Try explicit AI extraction
    dest_last4 = result.get('destination_account_last4')
    dest_account = None
    
    if dest_last4:
         dest_account = crud.get_account_by_last_4(db, str(dest_last4))
    
    # 2. Fallback: If we resolved the merchant to an account earlier
    if not dest_account and 'dest_acc' in locals() and dest_acc:
        dest_account = dest_acc

    if dest_account and dest_account.id != source_account.id:
         credit_tx = schemas.TransactionCreate(
             account_id=dest_account.id,
             amount=result['amount'], 
             merchant=f"{source_account.name} Account",
             category="Transfer", 
             type=models.TransactionType.CREDIT.value,
             timestamp=tx_timestamp, # Use same timestamp
             raw_sms_content=f"Auto-credit from transfer: {msg_text}"
         )
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
