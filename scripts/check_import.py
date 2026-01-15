import sys
import json
import urllib.request
import urllib.error

API_URL = 'http://localhost:8000'

def make_request(url):
    try:
        with urllib.request.urlopen(url) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.URLError as e:
        print(f"❌ Error connecting to API: {e}")
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/check_import.py \"Obligation Name\"")
        sys.exit(1)

    target_name = sys.argv[1]
    print(f"🔎 Checking history for '{target_name}'...")

    # 1. Find the ID
    obligations = make_request(f"{API_URL}/obligations/")
    target = next((o for o in obligations if o['name'] == target_name), None)

    if not target:
        print(f"❌ Obligation '{target_name}' not found.")
        sys.exit(1)

    print(f"✅ Found ID: {target['id']}")

    # 2. Get History
    history = make_request(f"{API_URL}/obligations/{target['id']}/history")
    
    if not history:
        print("⚠️  No payment history found.")
        return

    print(f"\nExample History (Total: {len(history)} records):")
    print("-" * 40)
    print(f"{'Billing Month':<15} | {'Amount':<10} | {'Note'}")
    print("-" * 40)

    # Sort by billing month
    history.sort(key=lambda x: x['billing_month'] or "", reverse=True)

    for record in history:
        b_month = record.get('billing_month', 'N/A')
        amt = record.get('amount', 0)
        note = record.get('note', '')
        print(f"{b_month:<15} | {amt:<10.2f} | {note}")

if __name__ == "__main__":
    main()
