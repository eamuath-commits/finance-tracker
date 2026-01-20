from database import SessionLocal
from models import Transaction
from sqlalchemy import desc

db = SessionLocal()
print("Querying recent transactions...")
txs = db.query(Transaction).order_by(desc(Transaction.timestamp)).limit(10).all()

print(f"{'ID':<5} {'Date':<20} {'Amount':<10} {'Merchant':<20} {'Created At'}")
print("-" * 80)
for tx in txs:
    print(f"{tx.id:<5} {str(tx.timestamp):<20} {tx.amount:<10} {tx.merchant:<20} {str(tx.created_at)}")

db.close()
