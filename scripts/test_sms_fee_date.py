from backend.sms_parser import parser
import re

sms_text = """Internet Purchase Credit card: 1645 of: 312.22 SAR At PAYPAL *2CO.COM on: 2026-01-17 00:01
Country: NLD 
FX Markup: 7.18 Exchange Rate: 1.0
Available Balance: 12778.76 SAR Due Amount: 31746.84 SAR"""

print(f"Testing SMS:\n{sms_text}\n")
result = parser.parse(sms_text)
if result:
    print("✅ Generic Parse Result:", result)
    expected_amount = 312.22 + 7.18
    if abs(result['amount'] - expected_amount) < 0.01:
        print(f"✅ Amount Matches: {result['amount']}")
    else:
        print(f"❌ Amount Mismatch: Got {result['amount']}, Expected {expected_amount}")
        
    if str(result['timestamp']) == '2026-01-17 00:01:00':
        print(f"✅ Timestamp Matches: {result['timestamp']}")
    else:
        print(f"❌ Timestamp Mismatch: Got {result['timestamp']}")

else:
    print("❌ Generic Parse Failed")
