import sqlite3
import os

# Adjust path if you are using SQLite. 
# Based on main.py, it imports 'engine' from 'database'.
# Let's assume SQLite for local dev or check database.py.
# If PostgreSQL, I need psycopg2 or sqlalchemy.
# Let's use sqlalchemy to be generic.

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

# Import settings
try:
    from database import SQLALCHEMY_DATABASE_URL
except ImportError:
    # Fallback/Guess if running from scripts dir
    import sys
    import os
    # Add backend directory to sys.path
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend'))
    sys.path.append(backend_dir)
    print(f"Added backend to path: {backend_dir}")
    from database import SQLALCHEMY_DATABASE_URL

def check_schema():
    print(f"Connecting to: {SQLALCHEMY_DATABASE_URL}")
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    inspector = inspect(engine)
    
    columns = inspector.get_columns('obligation_history')
    print("\nColumns in 'obligation_history':")
    found_status = False
    for col in columns:
        print(f" - {col['name']} ({col['type']})")
        if col['name'] == 'status':
            found_status = True
            
    if found_status:
        print("\n✅ 'status' column EXISTS.")
    else:
        print("\n❌ 'status' column MISSING. Migration did not run.")

if __name__ == "__main__":
    check_schema()
