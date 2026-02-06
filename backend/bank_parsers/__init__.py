# backend/bank_parsers/__init__.py
"""
Bank-specific SMS parser router.
Routes incoming SMS to the appropriate bank parser based on sender name.
"""
from typing import Optional
import logging

logger = logging.getLogger("bank_parsers")

# Import parsers - they'll be added as we create them
def get_parser(sender: str):
    """
    Get the appropriate parser for the given SMS sender.
    
    Args:
        sender: SMS sender name (e.g., "AlRajhiBank", "STC Bank")
    
    Returns:
        BankParser instance for the sender, or DefaultParser if unknown.
    """
    from .alrajhi import AlRajhiParser
    from .stc import STCParser
    from .default import DefaultParser
    
    # Mapping of sender patterns to parser classes
    PARSER_MAP = {
        "AlRajhiBank": AlRajhiParser,
        "AlRajhi Bank": AlRajhiParser,
        "Rajhi": AlRajhiParser,
        "STC Bank": STCParser,
        "STC BANK": STCParser,
        "stc bank": STCParser,
        "stc": STCParser,
    }
    
    # Try exact match first
    if sender in PARSER_MAP:
        parser = PARSER_MAP[sender]()
        logger.info(f"[{sender}] Using {parser.__class__.__name__}")
        return parser
    
    # Try partial match
    sender_lower = sender.lower() if sender else ""
    for key, parser_class in PARSER_MAP.items():
        if key.lower() in sender_lower or sender_lower in key.lower():
            parser = parser_class()
            logger.info(f"[{sender}] Matched to {parser.__class__.__name__}")
            return parser
    
    # Fallback to default
    logger.info(f"[{sender}] No specific parser found, using DefaultParser")
    return DefaultParser()
