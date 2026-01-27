"""
Migration script to create credit_cards table and migrate existing credit card accounts.

Run with: python migrations/migrate_credit_cards.py
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from database import SessionLocal, engine
import models

def run_migration():
    db = SessionLocal()
    
    try:
        # Check if credit_cards table already exists
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        if 'credit_cards' in existing_tables:
            print("✅ credit_cards table already exists")
        else:
            # Create the credit_cards table
            print("📦 Creating credit_cards table...")
            db.execute(text("""
                CREATE TABLE credit_cards (
                    id VARCHAR PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    bank_name VARCHAR,
                    bank_logo_url VARCHAR,
                    last_4_digits VARCHAR UNIQUE,
                    current_balance FLOAT DEFAULT 0.0,
                    credit_limit FLOAT DEFAULT 0.0,
                    statement_day INTEGER,
                    due_day INTEGER,
                    apr FLOAT,
                    minimum_payment_percent FLOAT DEFAULT 5.0,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            db.execute(text("CREATE INDEX ix_credit_cards_last_4_digits ON credit_cards(last_4_digits)"))
            db.commit()
            print("✅ credit_cards table created")
        
        # Check if credit_card_id column exists in transactions
        columns = [c['name'] for c in inspector.get_columns('transactions')]
        if 'credit_card_id' not in columns:
            print("📦 Adding credit_card_id column to transactions...")
            db.execute(text("ALTER TABLE transactions ADD COLUMN credit_card_id VARCHAR"))
            db.execute(text("ALTER TABLE transactions ADD CONSTRAINT fk_transaction_credit_card FOREIGN KEY (credit_card_id) REFERENCES credit_cards(id)"))
            db.commit()
            print("✅ credit_card_id column added")
        else:
            print("✅ credit_card_id column already exists")
        
        # Migrate existing credit card accounts
        print("\n📦 Checking for credit card accounts to migrate...")
        
        # Find all Credit Card type accounts
        credit_card_accounts = db.execute(text("""
            SELECT id, name, bank_name, bank_logo_url, last_4_digits, current_balance, 
                   credit_limit, interest_rate, minimum_payment, notes
            FROM accounts 
            WHERE account_type = 'CREDIT_CARD'
        """)).fetchall()
        
        if not credit_card_accounts:
            print("ℹ️ No credit card accounts found to migrate")
        else:
            print(f"Found {len(credit_card_accounts)} credit card accounts to migrate")
            
            for acc in credit_card_accounts:
                acc_id, name, bank_name, bank_logo_url, last_4_digits, balance, limit, apr, min_payment, notes = acc
                
                # Check if already migrated
                existing = db.execute(text("SELECT id FROM credit_cards WHERE last_4_digits = :last4"), 
                                     {"last4": last_4_digits}).fetchone()
                if existing:
                    print(f"  ⏭️ Skipping {name} (already migrated)")
                    continue
                
                # Insert into credit_cards
                import uuid
                new_id = str(uuid.uuid4())
                db.execute(text("""
                    INSERT INTO credit_cards (id, name, bank_name, bank_logo_url, last_4_digits, 
                                             current_balance, credit_limit, apr, minimum_payment_percent, notes)
                    VALUES (:id, :name, :bank_name, :bank_logo_url, :last_4_digits, 
                            :balance, :limit, :apr, :min_payment, :notes)
                """), {
                    "id": new_id,
                    "name": name,
                    "bank_name": bank_name,
                    "bank_logo_url": bank_logo_url,
                    "last_4_digits": last_4_digits,
                    "balance": balance or 0,
                    "limit": limit or 0,
                    "apr": apr,
                    "min_payment": min_payment or 5.0,
                    "notes": notes
                })
                
                # Update transactions to point to new credit card
                db.execute(text("""
                    UPDATE transactions 
                    SET credit_card_id = :new_id, account_id = NULL
                    WHERE account_id = :old_id
                """), {"new_id": new_id, "old_id": acc_id})
                
                print(f"  ✅ Migrated {name} ({last_4_digits})")
                
            db.commit()
            
            # Ask before deleting old accounts
            print("\n⚠️  Migration complete. Old credit card accounts can now be deleted from the accounts table.")
            print("    Run the following SQL manually if you want to remove them:")
            print("    DELETE FROM accounts WHERE account_type = 'Credit Card';")
        
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
