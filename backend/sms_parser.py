import re
from typing import Optional, Dict

class SMSParser:
    def __init__(self):
        # List of regex patterns to try
        # Example 1: "Purchase of AED 50.00 on card ending 1234 at WALMART"
        # Example 2: "Paid AED 20.00 to AWS using card 8888"
        self.patterns = [
            r"Purchase of (?P<currency>\w+) (?P<amount>[\d\.]+) on card ending (?P<last_4>\d+) at (?P<merchant>.+)",
            r"Paid (?P<currency>\w+) (?P<amount>[\d\.]+) to (?P<merchant>.+) using card (?P<last_4>\d+)",
            # Apple Pay / Online Purchase Format
            # "Online Purchase Apple Pay Credit Card: 1645 at :HUNGERSTATION LLC of : 154.00 SAR on ..."
            r"Credit Card: (?P<last_4>\d+) at :(?P<merchant>.+?) of : (?P<amount>[\d\.]+) (?P<currency>\w+)",
            # Generic catch-all attempt (more risky)
            r"Authori[sz]ed: (?P<currency>\w+) (?P<amount>[\d\.]+) at (?P<merchant>.+) on card (?P<last_4>\d+)",
            # PoS Format: By:9365... Amount:SAR 57.04 ... At:StoreName ...
            r"By:(?P<last_4>\d+).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d\.]+)\s*At:(?P<merchant>.+)"
        ]

    def parse(self, text: str) -> Optional[Dict]:
        """
        Parses SMS text and returns a dictionary with:
        - last_4
        - amount
        - merchant
        Or None if no match found.
        """
        for pattern in self.patterns:
            # Use DOTALL to allow . to match newlines (crucial for multi-line SMS)
            match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if match:
                data = match.groupdict()
                return {
                    "last_4": data.get("last_4"),
                    "amount": float(data.get("amount")),
                    "merchant": data.get("merchant").strip(),
                    "currency": data.get("currency")
                }
        return None

# Singleton instance
parser = SMSParser()
