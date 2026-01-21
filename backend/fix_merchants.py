import os
import sys
import logging
import google.generativeai as genai
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# Setup paths and logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sys.path.append(os.path.dirname(__file__)) # Add backend to path

import database
import models
import crud

load_dotenv()

# Configure AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.error("No API Key found")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")

async def fix_merchant_names():
    db = database.SessionLocal()
    try:
        # Fetch candidate transactions (exclude known generic ones or transfers)
        txs = db.query(models.Transaction).filter(
            models.Transaction.category != 'Transfer',
            models.Transaction.merchant != None
        ).order_by(models.Transaction.timestamp.desc()).limit(100).all()

        print(f"Scanning {len(txs)} reent transactions...")

        for tx in txs:
            original = tx.merchant
            
            # Simple Heuristic Check first
            if ":" in original or len(original) < 5 or original.isupper() or " " not in original:
                print(f"\nChecking: '{original}'...")
                
                prompt = f"""
                You are a merchant name cleaner.
                Task: Guess the full, clean Brand Name from this raw transaction text.
                Input: "{original}"
                
                Rules:
                1. If it's truncated (e.g. "HUNGERSTA"), complete it (e.g. "HungerStation").
                2. If it has garbage (e.g. ":HUNGERSTATION"), strip it.
                3. If it looks like a proper name already, return "SAME".
                4. Output ONLY the clean name or "SAME". No markdown.
                
                Examples:
                "first str" -> "First Street"
                "GOT COOKI" -> "Got Cookie"
                "JARIR B" -> "Jarir Bookstore"
                "Uber Rides" -> "SAME"
                """
                
                try:
                    response = model.generate_content(prompt)
                    clean_name = response.text.strip()
                    
                    if clean_name and clean_name != "SAME" and clean_name != original:
                        print(f"✨ Fixing: '{original}' -> '{clean_name}'")
                        tx.merchant = clean_name
                        # Reset logo url so frontend fetches new one
                        tx.logo_url = None 
                        db.commit()
                    else:
                        print(f"Skipping (kept as '{original}')")
                        
                except Exception as e:
                    print(f"AI Error: {e}")

    finally:
        db.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(fix_merchant_names())
