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
    You are a financial transaction parser. Extract data from this SMS into JSON.
    
    SMS: "{text}"
    
    Rules:
    1. Ignore "Forwarded message" headers.
    2. Look for keywords like "Purchase", "PoS", "Transfer", "Deposit", "Withdrawal", "Payment".
    3. Merchant is often after "At", "By", "To", or "Store".
    4. If it looks like a card usage (e.g. "mada", "Visa", "MasterCard"), it IS a transaction.
    5. "Amount:" or "SAR" or currency symbols clearly indicate the transaction amount.
    
    Output JSON format:
    {{
      "is_transaction": boolean,
      "merchant": string (or null),
      "amount": float (or null),
      "currency": string (e.g. "SAR"),
      "date": "YYYY-MM-DD" (use today {datetime.today().strftime('%Y-%m-%d')} if not specified),
      "category": string (guess from: Food, Transport, Utilities, Shopping, Transfer, Income, Subscription, Other),
      "transaction_type": "debit" or "credit",
      "account_last4": string (or null)
    }}
    
    If it is NOT a financial transaction, set is_transaction to false.
    Respond ONLY with raw JSON.
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
    Handles incoming Telegram messages.
    """
    user_id = str(update.effective_user.id)
    
    # Extract text from Message (text) or Caption (if photo/media) or effective_message
    msg_text = update.message.text or update.message.caption
    
    if not msg_text:
        logger.info(f"Received non-text message from {user_id}: {update.message}")
        await update.message.reply_text("⚠️ Message received but contained no text/caption. Is it an image?")
        return

    logger.info(f"Received message from {user_id}: {msg_text[:20]}...")
    await update.message.reply_text("⏳ Processing...")

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
         await update.message.reply_text(f"❌ AI Error: {result['error']}")
         raw_msg.status = models.MessageStatus.FAILED
         raw_msg.error_log = result['error']
         db.commit()
         db.close()
         return

    if not result.get("is_transaction"):
        await update.message.reply_text("ℹ️ Not a transaction message. Ignored.")
        raw_msg.status = models.MessageStatus.FAILED # Or IGNORED if enum supports it, usually FAILED or just leave as is? Let's say FAILED for now or add IGNORED status later.
        raw_msg.error_log = "AI determined not a transaction"
        db.commit()
        db.close()
        return

    # 2. Save to DB
    try:
        # Determine Account (Fuzzy match or default)
        account = db.query(models.Account).first()
        if not account:
             await update.message.reply_text("❌ No accounts found in DB to attach transaction.")
             raw_msg.status = models.MessageStatus.FAILED
             raw_msg.error_log = "No accounts found"
             db.commit()
             db.close()
             return

        # Prepare Schema
        tx_data = schemas.TransactionCreate(
            account_id=account.id,
            amount=result['amount'],
            merchant=result['merchant'] or "Unknown",
            category=result.get('category') or "Uncategorized",
            timestamp=datetime.now(), 
            raw_sms_content=msg_text
        )

        # Use CRUD to create (handles balance updates)
        crud.create_transaction(db=db, transaction=tx_data)
        
        # Update Raw Message Status
        raw_msg.status = models.MessageStatus.PARSED
        db.commit()
        
        db.close()
        
        await update.message.reply_text(
            f"✅ **Saved!**\n"
            f"Merchant: {result['merchant']}\n"
            f"Amount: {result['amount']} {result['currency']}\n"
            f"Category: {result['category']}"
        )


    except Exception as e:
        logger.error(f"DB Error: {e}")
        await update.message.reply_text(f"❌ Database Error: {e}")

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
    
    # Handlers
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
