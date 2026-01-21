import sys
import os
import asyncio
import logging
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.INFO)

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), '../backend/.env'))

from sms_agent import parse_with_ai
from database import SessionLocal
import crud
import models

sms_c = """Online Purchase Apple Pay Credit Card: 1645 at :HUNGERSTATION LLC of : 154.00 SAR on : 2026-01-16 18:05 Available Balance is: 13098.16 SAR Due Amount: 31746.84 SAR"""

async def run_test():
    print(f"Testing SMS C:\n{sms_c}\n")
    
    # 1. AI Parsing
    try:
        result = await parse_with_ai(sms_c)
        print("AI Result:", result)
    except Exception as e:
        print("AI Error:", e)

    # 2. Database Lookup
    db = SessionLocal()
    try:
        print("\nChecking Account Lookup for '1645':")
        # Check explicit logic
        acc = crud.get_account_by_last_4(db, "1645")
        if acc:
            print(f"✅ Found Account via CRUD: {acc.name} (ID: {acc.id})")
        else:
            print("❌ CRUD Lookup Failed")
            
        print("\n--- Raw DB Inspection ---")
        # Check all accounts
        all_accounts = db.query(models.Account).all()
        for a in all_accounts:
            print(f"Account: '{a.name}' | Last4: '{a.last_4_digits}' | ID: {a.id}")
            
        # Check aliases
        all_aliases = db.query(models.AccountAlias).all()
        for a in all_aliases:
            print(f"Alias: '{a.alias_name}' | Last4: '{a.last_4_digits}' -> AccID: {a.account_id}")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_test())
