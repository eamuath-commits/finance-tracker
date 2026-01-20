from database import SessionLocal
from models import Transaction
from sqlalchemy import desc

db = SessionLocal()
print("Querying recent transactions...")
txs = db.query(Transaction).order_by(desc(Transaction.timestamp)).limit(10).all()

print(f"{'ID':<10} {'Date':<20} {'Amount':<10} {'Merchant':<25}")
print("-" * 80)
for tx in txs:
    short_id = str(tx.id)[:8]
    print(f"{short_id:<10} {str(tx.timestamp):<20} {tx.amount:<10} {tx.merchant:<25}")

db.close()
