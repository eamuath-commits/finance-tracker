import re
from typing import Optional, Dict

class SMSParser:
    def __init__(self):
        # List of regex patterns to try (Order matters - more specific first)
        self.patterns = [
            # --- AlRajhi Bank Formats ---
            # PoS: "PoS\nBy:4390;mada-Atheer\nAmount:SAR 131\nAt:SASCO Qen\n26/1/26 10:52"
            r"PoS.*?By:(?P<last_4>\d{4}).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?At:(?P<merchant>.+?)(?:\n|$)",
            # PoS with Balance: "PoS\nBy:9365...\nAmount:SAR 57.04\nAt:Store\nBal:1000.00"
            r"PoS.*?By:(?P<last_4>\d{4}).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?At:(?P<merchant>.+?).*?Bal:(?P<balance>[\d,\.]+)",
            # Transfer: "Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19"
            r"Transfer.*?Amount:\s*(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?(?:To|From):\s*(?P<last_4>\d{4})",
            # Credit Transfer: "Credit Transfer\nTo:7772\nAmount:SAR 500\nFrom:SENDER NAME"
            r"Credit Transfer.*?To:(?P<last_4>\d{4}).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?From:(?P<merchant>.+?)(?:\n|$)",
            # ATM Withdrawal: "ATM\nBy:4390\nAmount:SAR 500\nAt:ATM Location"
            r"ATM.*?By:(?P<last_4>\d{4}).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d,\.]+)",
            
            # --- AlAhli (SNB) Bank Formats ---
            # "NCB: Purchase SAR 50.00 at MERCHANT using card *1234 on 01/01/2026"
            r"NCB:.*?(?:Purchase|Payment)\s*(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?at\s*(?P<merchant>.+?)\s*using\s*card\s*\*(?P<last_4>\d{4})",
            # "SNB: Debit SAR 100.00 from account *5678 to BENEFICIARY"
            r"SNB:.*?Debit\s*(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?from\s*account\s*\*(?P<last_4>\d{4}).*?to\s*(?P<merchant>.+?)(?:\n|$)",
            
            # --- Riyad Bank Formats ---
            # "RIBL: POS Purchase SAR 100.00 Card: 1234 at MERCHANT"
            r"RIBL:.*?POS.*?(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?Card:\s*(?P<last_4>\d{4}).*?at\s*(?P<merchant>.+?)(?:\n|$)",
            
            # --- Bank Al-Jazira Formats ---
            # With FX Fee: "Credit card: 1234 of: 50.00 USD At MERCHANT on: 2026-01-17 00:01...FX Markup: 1.50"
            r"Credit card:\s*(?P<last_4>\d+)\s*of:\s*(?P<amount>[\d,\.]+)\s*(?P<currency>\w+)\s*At\s*(?P<merchant>.+?)\s*on:\s*(?P<date>(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+\d{2}:\d{2}).*?FX Markup:\s*(?P<fee>[\d\.]+)",
            # Standard: "Credit card: 1234 of: 50.00 SAR At MERCHANT on: 2026-01-17 00:01"
            r"Credit card:\s*(?P<last_4>\d+)\s*of:\s*(?P<amount>[\d,\.]+)\s*(?P<currency>\w+)\s*At\s*(?P<merchant>.+?)\s*on:\s*(?P<date>(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+\d{2}:\d{2})",
            
            # --- Credit Card Payment Formats ---
            # "Credit Card:Payment\nCard:Visa 1234\nAmount:USD 800\nBalance:800 USD"
            r"Credit Card:\s*Payment.*?Card:.*?(?P<last_4>\d{4}).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?Balance:(?P<balance>[\d,\.]+)",
            
            # --- Generic International Formats ---
            # Apple Pay / Online: "Credit Card: 1645 at :HUNGERSTATION LLC of : 154.00 SAR"
            r"Credit Card:\s*(?P<last_4>\d+)\s*at\s*:(?P<merchant>.+?)\s*of\s*:\s*(?P<amount>[\d,\.]+)\s*(?P<currency>\w+)",
            # Purchase: "Purchase of USD 50.00 on card ending 1234 at STARBUCKS"
            r"Purchase of\s*(?P<currency>\w+)\s*(?P<amount>[\d,\.]+)\s*on\s*card\s*ending\s*(?P<last_4>\d+)\s*at\s*(?P<merchant>.+)",
            # Paid: "Paid AED 20.00 to AWS using card 5678"
            r"Paid\s*(?P<currency>\w+)\s*(?P<amount>[\d,\.]+)\s*to\s*(?P<merchant>.+?)\s*using\s*card\s*(?P<last_4>\d+)",
            # Authorized: "Authorized: SAR 100.00 at MERCHANT on card 1234"
            r"Authori[sz]ed:\s*(?P<currency>\w+)\s*(?P<amount>[\d,\.]+)\s*at\s*(?P<merchant>.+?)\s*on\s*card\s*(?P<last_4>\d+)",
            
            # --- Fallback: By/Amount/At pattern ---
            r"By:(?P<last_4>\d+).*?Amount:(?P<currency>\w+)\s*(?P<amount>[\d,\.]+).*?At:(?P<merchant>.+)",
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
                
                # Parse amount (handle commas in numbers like 1,500.00)
                amount_str = data.get("amount", "0").replace(",", "")
                amount = float(amount_str)
                
                # Add FX Fee if present
                if data.get("fee"):
                    fee_str = data.get("fee").replace(",", "")
                    amount += float(fee_str)
                
                # Parse Balance if present
                balance = None
                if data.get("balance"):
                    balance_str = data.get("balance").replace(",", "")
                    balance = float(balance_str)
                
                # Parse Date if present
                parsed_date = None
                raw_date = data.get("date")
                if raw_date:
                    raw_date = raw_date.strip()
                    print(f"[SMS Parser] Found raw date string: '{raw_date}'")
                    
                    # Try common formats (including short year formats)
                    date_formats = [
                        "%Y-%m-%d %H:%M",   # 2026-01-17 00:01
                        "%d/%m/%Y %H:%M",   # 17/01/2026 00:01
                        "%m/%d/%Y %H:%M",   # 01/17/2026 00:01
                        "%Y/%m/%d %H:%M",   # 2026/01/17 00:01
                        "%d-%m-%Y %H:%M",   # 17-01-2026 00:01
                        "%d/%m/%y %H:%M",   # 17/01/26 00:01 (short year)
                        "%m/%d/%y %H:%M",   # 01/17/26 00:01 (short year)
                        "%d-%m-%y %H:%M",   # 17-01-26 00:01 (short year)
                        "%Y-%m-%d",         # 2026-01-17 (no time)
                        "%d/%m/%Y",         # 17/01/2026 (no time)
                        "%d/%m/%y",         # 17/01/26 (no time, short year)
                    ]
                    
                    for fmt in date_formats:
                        try:
                            parsed_date = datetime.strptime(raw_date, fmt)
                            print(f"[SMS Parser] Successfully parsed date: {parsed_date}")
                            break
                        except ValueError:
                            continue
                            
                    if not parsed_date:
                        print(f"[SMS Parser] Failed to parse date '{raw_date}' with any known format.")
                
                # Get merchant - handle None case
                merchant = data.get("merchant")
                if merchant:
                    merchant = merchant.strip()
                else:
                    merchant = "Unknown"
                
                return {
                    "last_4": data.get("last_4"),
                    "amount": amount,
                    "merchant": merchant,
                    "currency": data.get("currency"),
                    "timestamp": parsed_date,
                    "balance": balance
                }
        return None

# Singleton instance
parser = SMSParser()
