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
            r"By:(?P<last_4>\d+).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d\.]+)\s*At:(?P<merchant>.+)",
            # Jazira Internet Purchase: Credit card: 1645 of: 312.22 SAR At PAYPAL ... (Optional FX Markup)
            r"Credit card: (?P<last_4>\d+) of: (?P<amount>[\d\.]+) (?P<currency>\w+) At (?P<merchant>.+?) on:.*?(?:FX Markup: (?P<fee>[\d\.]+))?"
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
                amount = float(data.get("amount"))
                
                # Add FX Fee if present
                if data.get("fee"):
                    amount += float(data.get("fee"))
                    
                return {
                    "last_4": data.get("last_4"),
                    "amount": amount,
                    "merchant": data.get("merchant").strip(),
                    "currency": data.get("currency")
                }
        return None

# Singleton instance
parser = SMSParser()
