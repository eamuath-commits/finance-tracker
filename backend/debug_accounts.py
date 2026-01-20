from database import SessionLocal
from models import Account, AccountAlias

db = SessionLocal()

print(f"{'Account Name':<20} | {'Last 4':<10} | {'Type':<10}")
print("-" * 50)
for acc in db.query(Account).all():
    print(f"{acc.name:<20} | {str(acc.last_4_digits):<10} | {acc.type}")

print("\nAliases:")
for alias in db.query(AccountAlias).all():
    print(f"{alias.alias:<20} -> {alias.account.name} (Last 4: {alias.last_4_digits})")

db.close()
