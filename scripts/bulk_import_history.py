import json
import sys
import os
import urllib.request
import urllib.error
from datetime import datetime

# Configuration
API_URL = 'http://localhost:8000'
DEFAULT_DATA_FILE = os.path.join(os.path.dirname(__file__), 'import_data.json')

def make_request(url, method='GET', data=None):
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    
    if data:
        json_data = json.dumps(data).encode('utf-8')
        req.data = json_data

    try:
        with urllib.request.urlopen(req) as response:
            if method == 'DELETE':
                return response.status
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"   ❌ HTTP Error {e.code}: {e.read().decode('utf-8')}")
        raise e
    except urllib.error.URLError as e:
        print(f"   ❌ URL Error: {e.reason}")
        raise e

def main():
    print("🚀 Starting Bulk Import (Python/urllib)...")
    
    # 1. Determine Data File
    data_file = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DATA_FILE
    print(f"📂 Reading from: {data_file}")

    # 2. Read Data
    try:
        with open(data_file, 'r') as f:
            data = json.load(f)
        print(f"✅ Loaded data for {len(data)} obligations.")
    except Exception as e:
        print(f"❌ Error reading data file: {e}")
        sys.exit(1)

    # 3. Fetch Existing Obligations
    try:
        obligations = make_request(f"{API_URL}/obligations/")
        print(f"✅ Fetched {len(obligations)} existing obligations from API.")
    except Exception as e:
        print(f"❌ Error fetching obligations from API: {e}")
        sys.exit(1)

    # Map Name -> ID
    obl_map = {o['name']: o['id'] for o in obligations}

    # 4. Import Data
    for name, entries in data.items():
        obl_id = obl_map.get(name)

        if not obl_id:
            print(f"⚠️  Skipping '{name}': Obligation not found in system.")
            continue
        
        print(f"\nProcessing '{name}' (ID: {obl_id})...")

        if not isinstance(entries, list):
            print(f"   ⚠️  Invalid format for '{name}'. Expected list of objects.")
            continue

        for entry in entries:
            month = entry.get('month')
            amount = entry.get('amount')
            
            # Basic Validation
            if not month or not amount:
                print(f"   ⚠️  Skipping entry. Missing month or amount: {entry}")
                continue

            # API expects YYYY-MM-01
            billing_month = f"{month}-01"
            
            payload = {
                "payment_date": datetime.now().isoformat(),
                "amount": float(amount),
                "billing_month": billing_month,
                "note": "Bulk Import"
            }

            try:
                res = make_request(f"{API_URL}/obligations/{obl_id}/pay", method='POST', data=payload)
                print(f"   ✅ Paid {month}: {amount}")
            except Exception as e:
                print(f"   ❌ Error calling API for {month} (Import continues...)")

    print("\n✨ Import Complete.")

if __name__ == "__main__":
    main()
