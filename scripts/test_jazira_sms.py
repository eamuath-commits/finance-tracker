from backend.sms_parser import parser
import re

sms_text = """Internet Purchase Credit card: 1645 of: 312.22 SAR At PAYPAL *2CO.COM on: 2026-01-17 00:01
Country: NLD 
FX Markup: 7.18 Exchange Rate: 1.0
Available Balance: 12778.76 SAR Due Amount: 31746.84 SAR"""

print(f"Testing SMS:\n{sms_text}\n")
result = parser.parse(sms_text)
if result:
    print("✅ Generic Parse Success:", result)
else:
    print("❌ Generic Parse Failed")

# Proposing new regex
# Internet Purchase Credit card: 1645 of: 312.22 SAR At PAYPAL *2CO.COM on: ...
# Note: The "At" might be case sensitive or not. Parser uses re.IGNORECASE.
pattern = r"Credit card: (?P<last_4>\d+) of: (?P<amount>[\d\.]+) (?P<currency>\w+) At (?P<merchant>.+?) on:"

match = re.search(pattern, sms_text, re.IGNORECASE)
if match:
    print("✅ New Regex Match:", match.groupdict())
else:
    print("❌ New Regex Failed")
