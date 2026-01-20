
import os
import asyncio
import nest_asyncio
import google.generativeai as genai
from dotenv import load_dotenv
import json
from datetime import datetime

# Load env from backend
load_dotenv(dotenv_path="backend/.env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY not found")
    exit(1)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-flash-latest')

async def test_parse():
    text = """PoS
By:9365;mada-Apple Pay
Amount:SAR 17
At:first str
18/1/26 22:45"""

    print(f"--- Input SMS ---\n{text}\n-----------------")

    prompt = f"""
    You are a financial transaction parser. Extract data from this SMS into JSON.
    
    SMS: "{text}"
    
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
        response = await model.generate_content_async(prompt)
        print("--- AI Raw Response ---")
        print(response.text)
        
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_text)
        print("\n--- Parsed JSON ---")
        print(json.dumps(data, indent=2))
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    nest_asyncio.apply()
    asyncio.run(test_parse())
