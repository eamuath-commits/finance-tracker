import re

sms_text = """PoS
By:9365;mada-Apple Pay
Amount:SAR 57.04
At:Alsawadi R
15\\1\\26 23:20"""

# The pattern I added to sms_parser.py
pattern = r"By:(?P<last_4>\d+).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d\.]+)\s*At:(?P<merchant>.+)"

print(f"--- Text Code Points ---")
print(repr(sms_text))
print(f"------------------------")

match = re.search(pattern, sms_text, re.IGNORECASE | re.DOTALL) 
# I used re.DOTALL in the script? No, standard parser doesn't use DOTALL usually, but wait.
# The code in sms_parser.py is: match = re.search(pattern, text, re.IGNORECASE)
# without DOTALL, . does NOT match newline.
# But "At:Alsawadi R" is on its own line. So `.+` should match `Alsawadi R` and stop at newline.
# However, the pattern has `By:... .*? Amount:...`.
# `.*?` (non-greedy match all) needs to match newlines if there are newlines between them?
# Let's look at the string:
# Line 1: PoS
# Line 2: By:9365;mada-Apple Pay
# Line 3: Amount:SAR 57.04
# Line 4: At:Alsawadi R
#
# `By:` is on line 2. `Amount:` is on line 3.
# Between `9365` and `Amount:` there is `;mada-Apple Pay\n`.
# The `.` in `.*?` will fail to match `\n` if DOTALL is not set!
#
# AHA! The issue is likely `.*?` not matching the newline between "Apple Pay" and "Amount".

print("Attempting match WITHOUT re.DOTALL (Standard Mode)...")
match_standard = re.search(pattern, sms_text, re.IGNORECASE)
if match_standard:
    print("✅ Standard Match Success:", match_standard.groupdict())
else:
    print("❌ Standard Match Failed (Likely due to newline)")

print("\nAttempting match WITH re.DOTALL...")
match_dotall = re.search(pattern, sms_text, re.IGNORECASE | re.DOTALL)
if match_dotall:
    print("✅ DOTALL Match Success:", match_dotall.groupdict())
else:
    print("❌ DOTALL Match Failed")
