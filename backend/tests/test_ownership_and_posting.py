"""
Regression tests for per-user scoping and the statement posting lifecycle.

Two classes of bug this session produced, both silent:
  - an endpoint that forgot to scope to the caller and reported every user's
    money summed together;
  - a bulk delete that violated a NO ACTION foreign key, so re-posting a
    statement raised instead of replacing.
"""
import uuid
from datetime import date, datetime

import models


def _user_id(db_session, username):
    return db_session.query(models.User).filter(models.User.username == username).first().id


def _make_statement(db_session, user_id, account_id, lines):
    stmt = models.Statement(id=str(uuid.uuid4()), user_id=user_id, account_id=account_id,
                            status="draft", original_filename="test.pdf")
    db_session.add(stmt)
    db_session.flush()
    for i, (amount, direction) in enumerate(lines):
        db_session.add(models.StatementLine(
            id=str(uuid.uuid4()), statement_id=stmt.id, row_index=i,
            txn_date=date(2026, 4, 10 + i), amount=amount, direction=direction,
            type_line=f"Line {i}", counterparty_name=f"Shop {i}",
            match_status="pending", is_fee=False))
    db_session.flush()
    return stmt


class TestAllocationIsScopedToTheCaller:
    """/analysis/allocation once had no current_user dependency at all, so every
    user saw the sum of everyone's balances and obligations."""

    def test_a_fresh_user_sees_zero_not_the_global_total(self, client):
        res = client.get("/analysis/allocation")
        assert res.status_code == 200
        body = res.json()
        assert body["liquid_cash"] == 0.0
        assert body["unpaid_obligations_this_month"] == 0.0

    def test_one_user_never_sees_another_users_money(self, client, other_client):
        client.post("/accounts/", json={
            "name": "Mine", "account_type": "Checking", "current_balance": 5000.0,
        })
        mine = client.get("/analysis/allocation").json()
        theirs = other_client.get("/analysis/allocation").json()
        assert mine["liquid_cash"] == 5000.0
        assert theirs["liquid_cash"] == 0.0, "another user's balance leaked into this account"

    def test_requires_authentication(self):
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as anon:
            assert anon.get("/analysis/allocation").status_code in (401, 403)

    def test_paid_bills_are_excluded_from_what_is_still_owed(self, client):
        obl = client.post("/obligations/", json={
            "name": "Rent", "due_day": 5, "category": "House", "amount": 1000.0,
        }).json()
        before = client.get("/analysis/allocation").json()["unpaid_obligations_this_month"]
        assert before == 1000.0

        billing = datetime.now().strftime("%Y-%m-01")
        client.post(f"/obligations/{obl['id']}/pay", json={
            "amount": 1000.0, "billing_month": billing,
            "payment_date": datetime.now().isoformat(), "status": "PAID",
        })
        after = client.get("/analysis/allocation").json()
        assert after["unpaid_obligations_this_month"] == 0.0, "a paid bill is still being charged against the balance"
        assert after["bills_paid"] == 1


class TestPostingLifecycle:
    def test_posting_writes_the_lines_to_the_ledger(self, client, db_session):
        uid = _user_id(db_session, client.test_username)
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        stmt = _make_statement(db_session, uid, acct["id"], [(100.0, "debit"), (250.0, "credit")])

        res = client.post(f"/api/statements/{stmt.id}/post")
        assert res.status_code == 200, res.text
        assert res.json()["posted"] == 2
        assert db_session.query(models.Transaction).filter(
            models.Transaction.statement_id == stmt.id).count() == 2

    def test_reposting_replaces_instead_of_raising(self, client, db_session):
        # Regression: statement_lines.posted_transaction_id is a NO ACTION FK and
        # posting always sets it, so the old bulk delete raised ForeignKeyViolation.
        uid = _user_id(db_session, client.test_username)
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        stmt = _make_statement(db_session, uid, acct["id"], [(100.0, "debit"), (250.0, "credit")])

        assert client.post(f"/api/statements/{stmt.id}/post").status_code == 200
        second = client.post(f"/api/statements/{stmt.id}/post")
        assert second.status_code == 200, f"re-posting failed: {second.text}"
        assert second.json()["posted"] == 2
        assert db_session.query(models.Transaction).filter(
            models.Transaction.statement_id == stmt.id).count() == 2, "re-posting duplicated the ledger"

    def test_unpost_preview_changes_nothing(self, client, db_session):
        uid = _user_id(db_session, client.test_username)
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        stmt = _make_statement(db_session, uid, acct["id"], [(100.0, "debit")])
        client.post(f"/api/statements/{stmt.id}/post")

        res = client.post(f"/api/statements/{stmt.id}/unpost?preview=true")
        assert res.status_code == 200
        assert res.json()["transactions"] == 1
        assert db_session.query(models.Transaction).filter(
            models.Transaction.statement_id == stmt.id).count() == 1, "preview deleted something"

    def test_unpost_removes_the_ledger_entries_and_returns_to_draft(self, client, db_session):
        uid = _user_id(db_session, client.test_username)
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        stmt = _make_statement(db_session, uid, acct["id"], [(100.0, "debit"), (250.0, "credit")])
        client.post(f"/api/statements/{stmt.id}/post")

        res = client.post(f"/api/statements/{stmt.id}/unpost")
        assert res.status_code == 200, res.text
        assert res.json()["removed_transactions"] == 2
        db_session.expire_all()
        assert db_session.query(models.Transaction).filter(
            models.Transaction.statement_id == stmt.id).count() == 0
        refreshed = db_session.query(models.Statement).filter(models.Statement.id == stmt.id).first()
        assert refreshed.status == "draft"
        lines = db_session.query(models.StatementLine).filter(
            models.StatementLine.statement_id == stmt.id).all()
        assert all(l.posted_transaction_id is None for l in lines)
        assert all(l.match_status == "pending" for l in lines)

    def test_can_post_again_after_reversing(self, client, db_session):
        uid = _user_id(db_session, client.test_username)
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        stmt = _make_statement(db_session, uid, acct["id"], [(100.0, "debit")])
        client.post(f"/api/statements/{stmt.id}/post")
        client.post(f"/api/statements/{stmt.id}/unpost")
        again = client.post(f"/api/statements/{stmt.id}/post")
        assert again.status_code == 200, again.text
        assert again.json()["posted"] == 1

    def test_a_draft_cannot_be_reversed(self, client, db_session):
        uid = _user_id(db_session, client.test_username)
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        stmt = _make_statement(db_session, uid, acct["id"], [(100.0, "debit")])
        assert client.post(f"/api/statements/{stmt.id}/unpost").status_code == 400

    def test_another_user_cannot_reverse_someone_elses_statement(self, client, other_client, db_session):
        uid = _user_id(db_session, client.test_username)
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        stmt = _make_statement(db_session, uid, acct["id"], [(100.0, "debit")])
        client.post(f"/api/statements/{stmt.id}/post")
        assert other_client.post(f"/api/statements/{stmt.id}/unpost").status_code == 404


class TestTransactionSearchPaging:
    """The link modal capped browsing at 50 with no total, so it looked as though
    there were no more transactions to link."""

    def test_returns_a_total_alongside_the_page(self, client):
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        for i in range(12):
            client.post("/transactions/", json={
                "account_id": acct["id"], "amount": 10.0 + i, "merchant": f"Shop {i}",
                "type": "debit", "timestamp": datetime(2026, 4, 1, 12, i).isoformat(),
            })
        res = client.get("/transactions/search?limit=5&offset=0")
        assert res.status_code == 200
        body = res.json()
        assert isinstance(body, dict) and "transactions" in body and "total" in body
        assert len(body["transactions"]) == 5
        assert body["total"] >= 12, "total must report the full match count, not the page size"

    def test_paging_reaches_every_transaction_without_overlap(self, client):
        acct = client.post("/accounts/", json={"name": "Main", "account_type": "Checking"}).json()
        for i in range(12):
            client.post("/transactions/", json={
                "account_id": acct["id"], "amount": 10.0 + i, "merchant": f"Shop {i}",
                "type": "debit", "timestamp": datetime(2026, 4, 1, 12, i).isoformat(),
            })
        seen = set()
        for offset in (0, 5, 10):
            page = client.get(f"/transactions/search?limit=5&offset={offset}").json()
            seen.update(t["id"] for t in page["transactions"])
        assert len(seen) >= 12

    def test_limit_is_capped(self, client):
        assert client.get("/transactions/search?limit=99999").json()["limit"] == 500
