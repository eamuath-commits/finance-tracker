import argparse
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime

# Configuration
API_URL = 'http://localhost:8000'

def make_request(url, method='GET', data=None):
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    
    if data:
        json_data = json.dumps(data).encode('utf-8')
        req.data = json_data

    try:
        with urllib.request.urlopen(req) as response:
            if method == 'DELETE':
                return {'status': response.status}
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"   ❌ HTTP Error {e.code}: {e.read().decode('utf-8')}")
        return None
    except urllib.error.URLError as e:
        print(f"   ❌ URL Error: {e.reason}")
        return None

def pay_all_for_month(target_month_str):
    """
    1. Fetch all Obligations.
    2. Fetch all History.
    3. Identify which obligations do NOT have a payment for target_month_str (YYYY-MM).
    4. Pay them.
    """
    print(f"💰 Starting Bulk Pay for {target_month_str}...")
    
    # 1. Fetch Obligations
    obligations = make_request(f"{API_URL}/obligations/")
    if not obligations:
        print("❌ Failed to fetch obligations.")
        return

    # 2. Fetch All History
    # We need to fetch history for each obligation or fetch all. 
    # Since API doesn't have 'get all history' endpoint efficiently exposed as a single list typically,
    # we iterate. Alternatively, if we have a list endpoint, use it.
    # Assuming we iterate based on 'obligations' list which should contain their history or we fetch individually.
    # Let's fetch history individually to be safe and accurate.
    
    count_paid = 0
    count_skipped = 0

    print(f"🔍 Checking {len(obligations)} obligations...")

    for obl in obligations:
        obl_id = obl['id']
        name = obl['name']
        amount = obl['amount']
        
        # Fetch history for this obligation
        history = make_request(f"{API_URL}/obligations/{obl_id}/history")
        if history is None:
            print(f"   ⚠️ Could not fetch history for {name}")
            continue

        # Check if paid
        # history items have 'billing_month' (YYYY-MM-DD)
        is_paid = False
        for h in history:
            if h.get('billing_month', '').startswith(target_month_str):
                is_paid = True
                break
        
        if is_paid:
            count_skipped += 1
            # print(f"   Example: {name} already paid.")
        else:
            # PAY IT
            print(f"   💸 Paying {name} (${amount})...")
            payload = {
                "payment_date": datetime.now().isoformat(),
                "amount": float(amount),
                "billing_month": f"{target_month_str}-01",
                "note": "Bulk Pay Script"
            }
            res = make_request(f"{API_URL}/obligations/{obl_id}/pay", method='POST', data=payload)
            if res:
                count_paid += 1
            else:
                print(f"   ❌ Failed to pay {name}")

    print(f"\n✅ Finished Bulk Pay.")
    print(f"   Paid: {count_paid}")
    print(f"   Skipped (Already Paid): {count_skipped}")


def delete_all_for_month(target_month_str):
    """
    1. Fetch all obligations (to get IDs).
    2. For each, fetch history.
    3. If history item matches month, DELETE it.
    """
    print(f"🗑️  Starting Bulk Delete for {target_month_str}...")

    obligations = make_request(f"{API_URL}/obligations/")
    if not obligations:
        print("❌ Failed to fetch obligations.")
        return

    count_deleted = 0

    for obl in obligations:
        obl_id = obl['id']
        
        # Fetch history
        history = make_request(f"{API_URL}/obligations/{obl_id}/history")
        if not history:
            continue

        for h in history:
            b_month = h.get('billing_month', '')
            if b_month.startswith(target_month_str):
                # Delete this specific history item
                hid = h['id']
                print(f"   Running delete for {obl['name']} - {b_month} (ID: {hid})...")
                res = make_request(f"{API_URL}/obligations/history/{hid}", method='DELETE')
                if res and res.get('status') == 200:
                    count_deleted += 1
                    print(f"     ✅ Deleted.")
                else:
                    print(f"     ❌ Failed to delete.")

    print(f"\n✅ Finished Bulk Delete.")
    print(f"   Deleted {count_deleted} records.")

def main():
    parser = argparse.ArgumentParser(description="Manage Obligation History Bulk Actions")
    parser.add_argument('action', choices=['pay-all', 'delete-month'], help="Action to perform")
    parser.add_argument('month', help="Target month in YYYY-MM format (e.g., 2025-01)")

    args = parser.parse_args()

    # Validate month format
    try:
        datetime.strptime(args.month, "%Y-%m")
    except ValueError:
        print("❌ Invalid month format. Use YYYY-MM (e.g., 2025-01)")
        sys.exit(1)

    if args.action == 'pay-all':
        pay_all_for_month(args.month)
    elif args.action == 'delete-month':
        delete_all_for_month(args.month)

if __name__ == "__main__":
    main()
