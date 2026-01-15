import urllib.request
import json
import os

API_URL = "http://localhost:8000"

def get_obligations():
    try:
        with urllib.request.urlopen(f"{API_URL}/obligations/") as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching obligations: {e}")
        return []

def get_history(obl_id):
    try:
        with urllib.request.urlopen(f"{API_URL}/obligations/{obl_id}/history") as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching history for {obl_id}: {e}")
        return []

def delete_history_item(history_id):
    opener = urllib.request.build_opener()
    req = urllib.request.Request(f"{API_URL}/obligations/history/{history_id}", method='DELETE')
    try:
        with opener.open(req) as response:
            return True
    except Exception as e:
        print(f"Error deleting history {history_id}: {e}")
        return False

def main():
    print("🧹 Starting Duplicate Cleanup...")
    obligations = get_obligations()
    
    total_deleted = 0
    
    for obl in obligations:
        print(f"Checking {obl['name']}...")
        history = get_history(obl['id'])
        
        # Group by billing_month
        by_month = {}
        for item in history:
            b_month = item.get('billing_month')
            if not b_month:
                continue # Skip items without billing month (auto-logs?) or treat differently
                
            if b_month not in by_month:
                by_month[b_month] = []
            by_month[b_month].append(item)
            
        # Check for duplicates
        for month, items in by_month.items():
            if len(items) > 1:
                print(f"  ⚠️ Found {len(items)} records for {month}")
                
                # Sort by ID (assuming higher ID = later/newer). 
                # We want to keep ONE. Usually the first one created is fine, or the last one.
                # Since the issue was running the script twice, the duplicates are identical.
                # Let's keep the one with the lowest ID (original) and delete the others (newer/duplicates).
                # Actually, `bulk_import` likely added later IDs as dupes.
                
                items.sort(key=lambda x: x['id'])
                
                # Keep the first one (original)
                original = items[0]
                duplicates = items[1:]
                
                for dup in duplicates:
                    print(f"    Deleting duplicate ID {dup['id']} (Amount: {dup['amount']})...")
                    if delete_history_item(dup['id']):
                        total_deleted += 1
                        print("    ✅ Deleted.")
                        
    print(f"\n✨ Cleanup Complete. Deleted {total_deleted} duplicate records.")

if __name__ == "__main__":
    main()
