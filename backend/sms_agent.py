import os
import asyncio
import json
import logging
import google.generativeai as genai
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, filters
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from datetime import datetime

# Import local backend modules
import database
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, filters, TypeHandler
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
    model = genai.GenerativeModel('gemini-flash-latest')
else:
    logger.warning("GEMINI_API_KEY not found. AI parsing will fail.")
    model = None

async def parse_with_ai(text: str):
    """
    Sends SMS text to Gemini AI and expects a JSON response.
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

    **Output JSON Schema:**
    {{
      "is_financial_event": boolean, (True for ANY money related message, including declines)
      "is_transaction": boolean, (True ONLY if money actually moved. False for Declines or purely informational msgs)
      "transaction_type": "debit" | "credit",
      "sub_type": "purchase" | "transfer" | "payment" | "withdrawal" | "deposit" | "internal_transfer" | "decline",
      "merchant": string (The entity paid OR the person sent to/received from),
      "amount": number,
      "currency": string,
      "date": "YYYY-MM-DD",
      "category": string (Best guess: Food, Transport, Bills, Transfer, Income, etc.),
      "account_last4": string,
      "status": "success" | "failed"
    }}

    Respond ONLY with valid JSON.
    """

    try:
        response = model.generate_content(prompt)
        # Cleanup code blocks if AI wraps in ```json ... ```
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_text)
        return data
    except Exception as e:
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
        # Only reply if it's not a channel (to avoid spamming channels if they post pure images)
        # But for debugging we reply.
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
        # Continue processing anyway, just logging issues replying


    db = database.SessionLocal()
    raw_msg = models.RawMessage(
        sender=f"Telegram-{user_id}",
        body=msg_text,
        status=models.MessageStatus.PENDING,
        timestamp=datetime.now()
    )
    db.add(raw_msg)
    db.commit()
    db.refresh(raw_msg)

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
        # Log as parsed but don't add to Ledger
        raw_msg.status = models.MessageStatus.PARSED # We successfully parsed it as a decline
        raw_msg.error_log = "Transaction Declined (Not added to ledger)"
        db.commit()
        db.close()
        return

    # 2. Save to DB (Only Success Transactions)
    try:
        # Determine Account (Fuzzy match or default)
        account = db.query(models.Account).first()
        if not account:
             try: await message.reply_text("❌ No accounts found in DB to attach transaction.")
             except: pass
             raw_msg.status = models.MessageStatus.FAILED
             raw_msg.error_log = "No accounts found"
             db.commit()
             db.close()
             return

        # Prepare Schema
        # Use sub_type for category if category is generic, or append it
        category = result.get('category') or "Uncategorized"
        if result.get('sub_type') == 'internal_transfer':
            category = "Transfer"
        
        tx_data = schemas.TransactionCreate(
            account_id=account.id,
            amount=result['amount'],
            merchant=result['merchant'] or "Unknown",
            category=category,
            timestamp=datetime.now(), 
            raw_sms_content=msg_text
        )

        # Use CRUD to create (handles balance updates)
        crud.create_transaction(db=db, transaction=tx_data)
        
        # Update Raw Message Status
        raw_msg.status = models.MessageStatus.PARSED
        db.commit()
        
        db.close()
        
        try:
            await message.reply_text(
                f"✅ **Saved!**\n"
                f"Type: {result.get('sub_type', 'transaction').title()}\n"
                f"Merchant: {result['merchant']}\n"
                f"Amount: {result['amount']} {result.get('currency', '')}\n"
                f"Category: {category}"
            )
        except Exception as e:
             logger.error(f"Could not send success reply: {e}")

    except Exception as e:
        logger.error(f"DB Error: {e}")
        try: await message.reply_text(f"❌ Database Error: {e}")
        except: pass

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
    # Add debug handler FIRST to catch everything
    app.add_handler(TypeHandler(Update, debug_log_update), group=-1)

    start_handler = MessageHandler(filters.COMMAND & filters.Regex(r"^/start"), lambda u, c: u.message.reply_text("👋 Hello! I am your SMS Finance Agent. Forward me a bank SMS!"))
    
    # Catch ALL non-command updates to debug why forwards are missed
    # We will filter for text inside the handler
    echo_handler = MessageHandler(~filters.COMMAND, handle_message)
    
    app.add_handler(start_handler)
    app.add_handler(echo_handler)
    
    # Verify Bot Identity
    print("⏳ verifying token...")
    async def print_bot_info():
         bot = await app.bot.get_me()
         print(f"✅ Bot Connected: @{bot.username} (ID: {bot.id})")
         print("👉 Please make sure you are messaging THIS bot.")

    loop = asyncio.get_event_loop()
    loop.run_until_complete(print_bot_info())

    print("🤖 SMS Agent is polling Telegram...")
    app.run_polling()
