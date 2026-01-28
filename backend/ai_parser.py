
import os
import json
import logging
import google.generativeai as genai
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
logger = logging.getLogger(__name__)

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL)
    logger.info(f"AI Parser Configured (Model: {GEMINI_MODEL}).")
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
        # Using async generate_content if available, but standard lib is sync for now in some versions.
        # Check if generate_content_async exists, else run in executor if needed.
        # For simplicity in this env, we assume standard call is fine or wrap it.
        # Actually google.generativeai latest supports async.
        response = await model.generate_content_async(prompt)
        
        # Cleanup code blocks
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_text)
        return data
    except Exception as e:
        logger.error(f"AI Parse Error: {e}")
        return {"error": str(e)}
