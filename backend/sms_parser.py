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
            # Jazira Internet Purchase (With FX Fee) - PRIORITIZED
            r"Credit card: (?P<last_4>\d+) of: (?P<amount>[\d\.]+) (?P<currency>\w+) At (?P<merchant>.+?) on:\s*(?P<date>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}).*?FX Markup: (?P<fee>[\d\.]+)",
            # Jazira Internet Purchase (Standard)
            r"Credit card: (?P<last_4>\d+) of: (?P<amount>[\d\.]+) (?P<currency>\w+) At (?P<merchant>.+?) on:\s*(?P<date>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})"
        ]

    def parse(self, text: str) -> Optional[Dict]:
        """
        Parses SMS text and returns transaction data incl. timestamp if found.
        """
        from datetime import datetime
        
        for pattern in self.patterns:
            # Use DOTALL to allow . to match newlines (crucial for multi-line SMS)
            match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if match:
                data = match.groupdict()
                amount = float(data.get("amount"))
                
                # Add FX Fee if present
                if data.get("fee"):
                    amount += float(data.get("fee"))
                
                # Parse Date if present
                parsed_date = None
                raw_date = data.get("date")
                if raw_date:
                    raw_date = raw_date.strip()
                    # Try common formats
                    # 1. 2026-01-17 00:01 (ISO-like)
                    try:
                        parsed_date = datetime.strptime(raw_date, "%Y-%m-%d %H:%M")
                    except ValueError:
                        pass
                    
                    # Add more formats here if needed
                
                return {
                    "last_4": data.get("last_4"),
                    "amount": amount,
                    "merchant": data.get("merchant").strip(),
                    "currency": data.get("currency"),
                    "timestamp": parsed_date 
                }
        return None

# Singleton instance
parser = SMSParser()
