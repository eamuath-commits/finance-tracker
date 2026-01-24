import database
import models
import crud
from sqlalchemy.orm import Session
import os

print(f"DEBUG: DATABASE_URL used: {database.DATABASE_URL}")

db = database.SessionLocal()


try:
    tx_count = db.query(models.Transaction).count()
    print(f"DEBUG: Transaction Count: {tx_count}")
    
    txs = db.query(models.Transaction).limit(5).all()
    for t in txs:
        print(f" - [{t.id}] {t.amount} {t.type} {t.merchant}")

    # Check Allocation Logic
    acc_count = db.query(models.Account).count()
    print(f"DEBUG: Account Count: {acc_count}")
    
    obl_count = db.query(models.Obligation).count()
    print(f"DEBUG: Obligation Count: {obl_count}")

    if acc_count > 0:
        print("Accounts found:")
        for a in db.query(models.Account).all():
             print(f" - {a.name} ({a.bank_name})")
    else:
        print("WARNING: No Accounts Found! Database might be fresh.")

    
except Exception as e:
    print(f"ERROR: {e}")
finally:
    db.close()
