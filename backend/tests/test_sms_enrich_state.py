"""
API tests for the persistent SMS-enrichment dashboard: the /state buckets and the
single-transaction undo. The bucketing itself (ready/review/no_match) is exercised
by the pure matcher tests; these lock the endpoints' shape and the undo behaviour.
"""
import uuid
from datetime import datetime

import models


def _uid(client, db):
    return db.query(models.User).filter_by(username=client.test_username).first().id


def _mk_tx(db, uid, merchant, amount=1500.0, enriched=False, original=None):
    tx = models.Transaction(
        id=str(uuid.uuid4()), user_id=uid, amount=amount, merchant=merchant,
        type="debit", source="statement", status="completed",
        timestamp=datetime(2026, 3, 1, 12, 0, 0),
        merchant_original=original,
        enriched_at=datetime(2026, 8, 1) if enriched else None,
        enrichment_batch_id="b1" if enriched else None,
    )
    db.add(tx)
    db.commit()
    return tx


class TestEnrichState:
    def test_no_sources_returns_empty_buckets(self, client):
        r = client.get("/api/sms/enrich/state")
        assert r.status_code == 200
        d = r.json()
        assert d["has_sources"] is False
        assert d["ready"] == [] and d["review"] == [] and d["no_match"] == []
        assert d["counts"]["ready"] == 0

    def test_enriched_row_shows_in_the_enriched_bucket(self, client, db_session):
        uid = _uid(client, db_session)
        _mk_tx(db_session, uid, "MAE CLAIRE BARQUILLA", original="Musaned", enriched=True)
        d = client.get("/api/sms/enrich/state").json()
        assert "MAE CLAIRE BARQUILLA" in [e["merchant"] for e in d["enriched"]]
        assert d["counts"]["enriched"] >= 1


class TestSingleUndo:
    def test_reverts_one_enriched_row(self, client, db_session):
        uid = _uid(client, db_session)
        tx = _mk_tx(db_session, uid, "NORMA CAFE", original="Musaned", enriched=True)
        r = client.post(f"/api/sms/enrich/undo-transaction/{tx.id}")
        assert r.status_code == 200
        db_session.refresh(tx)
        assert tx.merchant == "Musaned" and tx.enriched_at is None

    def test_rejects_a_row_that_is_not_enriched(self, client, db_session):
        uid = _uid(client, db_session)
        tx = _mk_tx(db_session, uid, "Sadad Payment")
        assert client.post(f"/api/sms/enrich/undo-transaction/{tx.id}").status_code == 400

    def test_a_missing_row_is_404(self, client):
        assert client.post(f"/api/sms/enrich/undo-transaction/{uuid.uuid4()}").status_code == 404
