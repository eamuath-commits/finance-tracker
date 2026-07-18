"""
Test suite for Statement Enhancement Features
Tests: Commit & Approve, Reconciliation, Transaction Notes, PDF Preview, Validate
"""
import os
import json
import requests
import sys

BASE_URL = os.getenv("API_URL", "http://10.10.80.150:8000")
USERNAME = os.getenv("TEST_USER", "test")
# Never hardcode a credential here — this file is committed and pushed. Supply it
# via the environment:  TEST_USER_PASSWORD=... python tests/test_statement_features.py
PASSWORD = os.getenv("TEST_USER_PASSWORD")

# ─────── Auth ───────
def get_token():
    # Checked here rather than at import: pytest imports this module during
    # collection, so raising at import time breaks the whole suite.
    if not PASSWORD:
        raise SystemExit(
            "TEST_USER_PASSWORD is not set. Export it before running this script, e.g.\n"
            "  TEST_USER_PASSWORD='...' python tests/test_statement_features.py"
        )
    res = requests.post(f"{BASE_URL}/auth/token", data={"username": USERNAME, "password": PASSWORD})
    assert res.status_code == 200, f"Login failed: {res.text}"
    return res.json()["access_token"]

def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def run_tests():
    results = {"passed": 0, "failed": 0, "errors": []}
    
    def test(name, func):
        try:
            func()
            results["passed"] += 1
            print(f"  ✅ {name}")
        except AssertionError as e:
            results["failed"] += 1
            results["errors"].append(f"{name}: {e}")
            print(f"  ❌ {name}: {e}")
        except Exception as e:
            results["failed"] += 1
            results["errors"].append(f"{name}: EXCEPTION {e}")
            print(f"  💥 {name}: {e}")
    
    token = get_token()
    headers = auth_headers(token)
    
    # ─────── 1. List Statements ───────
    print("\n📋 Statement List & Filtering")
    
    statements = []
    def test_list_statements():
        nonlocal statements
        res = requests.get(f"{BASE_URL}/api/statements/", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        statements = res.json()
        assert isinstance(statements, list), "Expected a list"
        print(f"     → Found {len(statements)} statements")
    test("List all statements", test_list_statements)
    
    # ─────── 2. Statement Detail & Transactions ───────
    print("\n📄 Statement Detail & Transactions")
    
    if len(statements) > 0:
        stmt = statements[0]
        stmt_id = stmt["id"]
        
        def test_get_detail():
            res = requests.get(f"{BASE_URL}/api/statements/{stmt_id}", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert "id" in data
            assert "status" in data
            assert "original_filename" in data
            print(f"     → Statement: {data['original_filename']} (status={data['status']})")
        test("Get statement detail", test_get_detail)
        
        transactions_data = None
        def test_get_transactions():
            nonlocal transactions_data
            res = requests.get(f"{BASE_URL}/api/statements/{stmt_id}/transactions", headers=headers)
            assert res.status_code == 200
            transactions_data = res.json()
            assert "transactions" in transactions_data
            assert "match_summary" in transactions_data
            txns = transactions_data["transactions"]
            print(f"     → {len(txns)} parsed transactions")
            if transactions_data.get("match_summary"):
                ms = transactions_data["match_summary"]
                print(f"     → Match summary: {ms.get('matched', 0)} matched, {ms.get('new', 0)} new")
        test("Get transactions with match summary", test_get_transactions)
        
        # Verify committed_transactions includes notes field
        def test_committed_tx_has_notes():
            res = requests.get(f"{BASE_URL}/api/statements/{stmt_id}/transactions", headers=headers)
            data = res.json()
            ctx = data.get("committed_transactions", [])
            if len(ctx) > 0:
                assert "notes" in ctx[0], "committed_transactions should include 'notes' field"
                print(f"     → {len(ctx)} committed transactions with notes field ✓")
            else:
                print(f"     → No committed transactions (statement may be draft)")
        test("Committed transactions include notes", test_committed_tx_has_notes)
    
    # ─────── 3. PDF Serve ───────
    print("\n📎 PDF Serve Endpoint")
    
    if len(statements) > 0:
        stmt_id = statements[0]["id"]
        
        def test_pdf_serve():
            res = requests.get(f"{BASE_URL}/api/statements/{stmt_id}/pdf", headers=headers)
            # Could be 200 (file exists) or 404 (file not on server)
            assert res.status_code in [200, 404], f"Expected 200 or 404, got {res.status_code}"
            if res.status_code == 200:
                assert res.headers.get("content-type", "").startswith("application/pdf"), \
                    "Expected PDF content type"
                print(f"     → PDF served, {len(res.content)} bytes")
            else:
                print(f"     → PDF file not found on server (expected for test data)")
        test("Serve PDF with auth", test_pdf_serve)
        
        def test_pdf_no_auth():
            res = requests.get(f"{BASE_URL}/api/statements/{stmt_id}/pdf")
            assert res.status_code == 401, f"Expected 401 without auth, got {res.status_code}"
        test("PDF requires authentication", test_pdf_no_auth)
    
    # ─────── 4. Validate Endpoint ───────
    print("\n✅ Validate Endpoint")
    
    if len(statements) > 0:
        stmt_id = statements[0]["id"]
        
        def test_validate():
            res = requests.get(f"{BASE_URL}/api/statements/{stmt_id}/validate", headers=headers)
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            data = res.json()
            assert "valid" in data, "Response should have 'valid' field"
            assert "checks" in data, "Response should have 'checks' field"
            print(f"     → Valid: {data['valid']}, {len(data['checks'])} checks performed")
        test("Validate statement balance chain", test_validate)
    
    # ─────── 5. Reconciliation Timeline ───────
    print("\n🔗 Reconciliation Timeline")
    
    if len(statements) > 0:
        # Find a statement with account_id
        stmt_with_acct = None
        for s in statements:
            res = requests.get(f"{BASE_URL}/api/statements/{s['id']}", headers=headers)
            if res.status_code == 200:
                detail = res.json()
                if detail.get("account_id"):
                    stmt_with_acct = detail
                    break
        
        if stmt_with_acct:
            def test_reconciliation():
                acct_id = stmt_with_acct["account_id"]
                res = requests.get(f"{BASE_URL}/api/statements/reconciliation/{acct_id}", headers=headers)
                assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
                data = res.json()
                assert "timeline" in data, "Response should have 'timeline' field"
                print(f"     → Timeline: {len(data['timeline'])} blocks, account={acct_id[:8]}...")
                if data.get("gaps"):
                    print(f"     → {len(data['gaps'])} gap(s) detected")
            test("Get reconciliation timeline", test_reconciliation)
        else:
            print("  ⏭  Skipped (no statement with linked account)")
    
    # ─────── 6. Transaction Notes ───────
    print("\n📝 Transaction Notes")
    
    # Find a committed transaction to test notes on
    committed_tx_id = None
    for s in statements:
        res = requests.get(f"{BASE_URL}/api/statements/{s['id']}/transactions", headers=headers)
        if res.status_code == 200:
            data = res.json()
            ctx = data.get("committed_transactions", [])
            if ctx:
                committed_tx_id = ctx[0]["id"]
                break
    
    if committed_tx_id:
        def test_add_note():
            res = requests.patch(
                f"{BASE_URL}/api/statements/transaction/{committed_tx_id}/notes",
                json={"notes": "Test note from automated test"},
                headers=headers
            )
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            data = res.json()
            assert data["notes"] == "Test note from automated test"
            print(f"     → Note saved on tx {committed_tx_id[:8]}...")
        test("Add transaction note", test_add_note)
        
        def test_update_note():
            res = requests.patch(
                f"{BASE_URL}/api/statements/transaction/{committed_tx_id}/notes",
                json={"notes": "Updated test note"},
                headers=headers
            )
            assert res.status_code == 200
            assert res.json()["notes"] == "Updated test note"
        test("Update transaction note", test_update_note)
        
        def test_clear_note():
            res = requests.patch(
                f"{BASE_URL}/api/statements/transaction/{committed_tx_id}/notes",
                json={"notes": None},
                headers=headers
            )
            assert res.status_code == 200
            assert res.json()["notes"] is None
        test("Clear transaction note", test_clear_note)
        
        def test_note_no_auth():
            res = requests.patch(
                f"{BASE_URL}/api/statements/transaction/{committed_tx_id}/notes",
                json={"notes": "should fail"}
            )
            assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        test("Notes require authentication", test_note_no_auth)
        
        def test_note_invalid_tx():
            res = requests.patch(
                f"{BASE_URL}/api/statements/transaction/non-existent-id/notes",
                json={"notes": "test"},
                headers=headers
            )
            assert res.status_code == 404
        test("Notes 404 for invalid transaction", test_note_invalid_tx)
    else:
        print("  ⏭  Skipped (no committed transactions found)")
    
    # ─────── 7. Statement Update (PATCH) ───────
    print("\n✏️  Statement Update (PATCH)")
    
    if len(statements) > 0:
        stmt_id = statements[0]["id"]
        
        def test_update_notes():
            res = requests.patch(
                f"{BASE_URL}/api/statements/{stmt_id}",
                json={"notes": "Test statement note"},
                headers=headers
            )
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            # Verify
            detail = requests.get(f"{BASE_URL}/api/statements/{stmt_id}", headers=headers).json()
            assert detail.get("notes") == "Test statement note"
        test("Update statement notes", test_update_notes)
        
        def test_clear_stmt_notes():
            res = requests.patch(
                f"{BASE_URL}/api/statements/{stmt_id}",
                json={"notes": ""},
                headers=headers
            )
            assert res.status_code == 200
        test("Clear statement notes", test_clear_stmt_notes)
    
    # ─────── 8. Cross-User Isolation ───────
    print("\n🔒 Cross-User Isolation")
    
    def test_no_cross_user():
        # Attempt to access with invalid token
        bad_headers = {"Authorization": "Bearer invalid_token_12345"}
        res = requests.get(f"{BASE_URL}/api/statements/", headers=bad_headers)
        assert res.status_code == 401, f"Expected 401 with bad token, got {res.status_code}"
    test("Invalid token rejected", test_no_cross_user)
    
    def test_no_anon():
        res = requests.get(f"{BASE_URL}/api/statements/")
        assert res.status_code == 401, f"Expected 401 without token, got {res.status_code}"
    test("Anonymous access blocked", test_no_anon)
    
    # ─────── Summary ───────
    print(f"\n{'='*50}")
    total = results["passed"] + results["failed"]
    print(f"📊 Results: {results['passed']}/{total} passed, {results['failed']} failed")
    if results["errors"]:
        print("\n❌ Failures:")
        for e in results["errors"]:
            print(f"   • {e}")
    print(f"{'='*50}")
    
    return results["failed"] == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
