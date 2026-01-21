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

sms_b = """Credit Transfer Local
Via:BJAZ
Amount:SAR 1000
To:7772
From:MUATH AMER MOHAMMED ALASIRI
From:8001
26/1/20 12:15"""

async def run_test():
    print(f"Testing SMS B:\n{sms_b}\n")
    try:
        result = await parse_with_ai(sms_b)
        print("AI Result:", result)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(run_test())
