import asyncio
import os
import sys
from dotenv import load_dotenv

# Add backend to path
sys.path.append(os.path.dirname(__file__))

# Load env (needs GEMINI_API_KEY)
load_dotenv()

from sms_agent import parse_with_ai

# Estimated SMS based on user context
sms_text = "Purchase of SAR 174.00 with Card 1645 at first str on 2026-01-18 22:45. Avail Bal: 5000"

async def test():
    print(f"Testing SMS: '{sms_text}'\n")
    try:
        result = await parse_with_ai(sms_text)
        print("--- AI Result ---")
        print(f"Merchant Raw: {result.get('merchant')}")
        print(f"Brand Name:   {result.get('brand_name')}")
        print(f"Full Result:  {result}")
        
        if result.get('brand_name') == "First Street":
            print("\n✅ SUCCESS: 'First Street' guessed correctly.")
        else:
            print("\n❌ FAILURE: AI did not guess 'First Street'.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
