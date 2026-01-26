import logging
from datetime import datetime
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

class ExchangeRateService:
    def __init__(self):
        # Cache for rates: { "USD": { "rate": 3.75, "timestamp": ... } }
        self._cache = {}
        # Hardcoded fallback rates
        self._fallback_rates = {
            "USD": 3.75,
            "EUR": 4.05,
            "GBP": 4.75,
            "AED": 1.02,
            "SAR": 1.0
        }

    def get_rate(self, from_currency: str, to_currency: str = "SAR", bank_name: str = None) -> float:
        """
        Get exchange rate. 
        Priority:
        1. Bank specific rate (if implemented)
        2. Live/Daily Rate (SAMA/API)
        3. Hardcoded Fallback
        """
        from_currency = from_currency.upper()
        to_currency = to_currency.upper()
        
        if from_currency == to_currency:
            return 1.0

        # Try Cache (Mock 24h validity)
        if from_currency in self._cache:
             # Check expiry (skipped for now)
             return self._cache[from_currency]["rate"]

        rate = None
        
        # 1. Bank Specific (Mock)
        if bank_name and "Rajhi" in bank_name and from_currency == "USD":
             rate = 3.79 # Rajhi slightly higher example
        
        # 2. SAMA / Public Scrape (Mocked for stability, but we can try basic requests)
        # For this implementation, we will use stable fallbacks to prevent "0" rates.
        if not rate:
            # Check SAMA website for official pegged rates? 
            # Actually Saudi USD is pegged at 3.75.
            pass

        # 3. Fallback
        if not rate:
            rate = self._fallback_rates.get(from_currency, 1.0) # Default to 1.0 if unknown to avoid crashes, but warn
            if from_currency not in self._fallback_rates:
                logger.warning(f"Unknown currency {from_currency}. Using 1:1 fallback.")
        
        # Update Cache
        self._cache[from_currency] = {"rate": rate, "timestamp": datetime.now()}
        
        return rate

exchange_rate_service = ExchangeRateService()
