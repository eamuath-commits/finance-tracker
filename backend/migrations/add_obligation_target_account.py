"""
Migration: Add target_account_id to obligations, obligation_id to distributions.
Also auto-migrates existing AllocationRule data to per-obligation target_account_id.

Run: docker exec -it finance-backend python migrations/add_obligation_target_account.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        # 1. Add target_account_id to obligations table
        try:
            conn.execute(text("""
                ALTER TABLE obligations
                ADD COLUMN IF NOT EXISTS target_account_id VARCHAR REFERENCES accounts(id)
            """))
            print("✅ Added target_account_id to obligations")
        except Exception as e:
            print(f"⚠️  target_account_id on obligations: {e}")

        # 2. Add obligation_id to distributions table
        try:
            conn.execute(text("""
                ALTER TABLE distributions
                ADD COLUMN IF NOT EXISTS obligation_id VARCHAR REFERENCES obligations(id)
            """))
            print("✅ Added obligation_id to distributions")
        except Exception as e:
            print(f"⚠️  obligation_id on distributions: {e}")

        conn.commit()

        # 3. Auto-migrate existing AllocationRule data
        # For each rule, find matching obligations by category and set their target_account_id
        try:
            rules = conn.execute(text("""
                SELECT id, rule_type, identifier, target_account_id
                FROM allocation_rules
            """)).fetchall()

            migrated = 0
            for rule in rules:
                rule_type = rule[1]
                identifier = rule[2]
                target_acct = rule[3]

                if rule_type == 'CATEGORY':
                    # Set target_account_id for all obligations in this category
                    result = conn.execute(text("""
                        UPDATE obligations
                        SET target_account_id = :target_acct
                        WHERE category = :category
                        AND target_account_id IS NULL
                    """), {"target_acct": target_acct, "category": identifier})
                    migrated += result.rowcount

                elif rule_type == 'LOAN':
                    # Set target_account_id for obligations matching this loan name
                    result = conn.execute(text("""
                        UPDATE obligations
                        SET target_account_id = :target_acct
                        WHERE name ILIKE :name
                        AND target_account_id IS NULL
                    """), {"target_acct": target_acct, "name": f"%{identifier}%"})
                    migrated += result.rowcount

            conn.commit()
            print(f"✅ Migrated {migrated} obligations from {len(rules)} allocation rules")

        except Exception as e:
            print(f"⚠️  Rule migration: {e}")
            conn.rollback()

        print("\n🎉 Migration complete!")

if __name__ == "__main__":
    run_migration()
