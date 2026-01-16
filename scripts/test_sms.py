import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '../backend'))

from sms_parser import parser

def test_sms(text):
    print(f"Testing SMS: '{text}'")
    result = parser.parse(text)
    if result:
        print("✅ Match Found:")
        print(result)
    else:
        print("❌ No Match Found")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        sms_text = sys.argv[1]
        test_sms(sms_text)
    else:
        print("Usage: python test_sms.py 'Your SMS Text Here'")
        # Test default patterns
        print("\n--- Running Default Tests ---")
        test_sms("Purchase of USD 10.50 on card ending 1234 at STARBUCKS")
        test_sms("Paid AED 100.00 to DEWA using card 5678")
