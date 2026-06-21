"""
Statement Type Line → Transaction Category Mapper.

Maps Al Rajhi bank statement type_line values to the application's
category taxonomy. Falls back to "Other" for unrecognized types.
"""

# Exact match table (checked first)
TYPE_LINE_EXACT = {
    "Salary Transfer": "Income",
    "ATM Cash Withdrawal": "Cash",
    "Bill Payment": "Bills",
    "Direct Debit": "Bills",
    "Sadad Payment": "Bills",
    "Standing Order": "Bills",
    "Government Payment": "Government",
    "Fund Transfer": "Transfer",
    "SPAN-Debit Transfer": "Transfer",
    "SPAN Credit Transfer": "Transfer",
    "International Wire Transfer": "Transfer",
    "Local Transfer": "Transfer",
    "Debit Transfer Local": "Transfer",
    "Credit Transfer Local": "Transfer",
    "Credit Profit": "Income",
    "Interest Payment": "Income",
}

# Prefix match table (checked if no exact match)
TYPE_LINE_PREFIX = [
    ("POS purchase", "Shopping"),
    ("POS Purchase", "Shopping"),
    ("POS refund", "Refund"),
    ("POS Refund", "Refund"),
    ("ATM", "Cash"),
    ("Bill Payment", "Bills"),
    ("Sadad", "Bills"),
    ("Transfer", "Transfer"),
    ("Fund Transfer", "Transfer"),
    ("Wire Transfer", "Transfer"),
    ("SPAN", "Transfer"),
    ("Government", "Government"),
    ("Salary", "Income"),
    ("Refund", "Refund"),
    ("Reversal", "Refund"),
    ("Charge", "Fees"),
    ("Fee", "Fees"),
    ("Commission", "Fees"),
]


def map_type_to_category(type_line: str) -> str:
    """
    Map a statement type_line to a category.
    
    Args:
        type_line: The raw type line from the PDF, e.g. "POS purchase Apple pay (Domestic)"
    
    Returns:
        Category string, e.g. "Shopping", "Bills", "Transfer", "Income", etc.
    """
    if not type_line:
        return "Other"
    
    stripped = type_line.strip()
    
    # Check exact match first
    if stripped in TYPE_LINE_EXACT:
        return TYPE_LINE_EXACT[stripped]
    
    # Check prefix match
    for prefix, category in TYPE_LINE_PREFIX:
        if stripped.startswith(prefix):
            return category
    
    return "Other"
