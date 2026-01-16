from backend.sms_parser import parser
import re

sms_text = """Internet Purchase Credit card: 1645 of: 312.22 SAR At PAYPAL *2CO.COM on: 2026-01-17 00:01
Country: NLD 
FX Markup: 7.18 Explanation"""

print(f"Testing SMS:\n---\n{sms_text}\n---")

# Manual Regex Debug
pattern = r"Credit card: (?P<last_4>\d+) of: (?P<amount>[\d\.]+) (?P<currency>\w+) At (?P<merchant>.+?) on:(?P<date>[\d\-\s:]+).*?FX Markup: (?P<fee>[\d\.]+)"
match = re.search(pattern, sms_text, re.IGNORECASE | re.DOTALL)
if match:
    raw_date = match.group("date")
    print(f"DEBUG: Raw captured date string: '{raw_date}'")
    
    # Simulate parser logic
    from datetime import datetime
    try:
        parsed_date = datetime.strptime(raw_date.strip(), "%Y-%m-%d %H:%M")
        print(f"DEBUG: Successfully parsed date: {parsed_date}")
    except ValueError as e:
        print(f"DEBUG: Date parsing FAILED: {e}")
else:
    print("DEBUG: Regex did not match!")

# Full Parser Test
res = parser.parse(sms_text)
print("Parser Final Result:", res)
