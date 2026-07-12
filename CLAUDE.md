# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-hosted personal finance tracker (SMS-driven transaction logging, accounts, credit cards, loans, obligations, bank statement PDF import). Runs entirely via Docker Compose. Production is served at `qayd.io` through the `cloudflared` tunnel container. Timezone is `Asia/Riyadh` everywhere (all containers set `TZ`); be careful with date handling.

## Running and developing

Everything runs through Docker Compose from the repo root:

```bash
docker compose up -d --build       # start the full stack
docker compose logs -f backend     # tail a service (backend | sms-agent | frontend | db)
docker compose restart backend sms-agent
```

- Backend (FastAPI): http://localhost:8000, Swagger at `/docs`
- Frontend (Vite/React): http://localhost:3000
- Postgres 15: localhost:5432, `postgres/postgres`, db `finance_db`

Both `./backend` and `./frontend` are volume-mounted into their containers, so code edits hot-reload — no rebuild needed for code changes (rebuild only for dependency changes).

Secrets (GEMINI_API_KEY, ALRAJHI_API_*, WEBHOOK_SECRET, etc.) live in `backend/.env` (git-ignored), loaded by both `backend` and `sms-agent` services.

## Tests

Backend tests use pytest and connect to the **real Postgres database** (`DATABASE_URL` defaults to the in-Docker `db` host), wrapping each test in a rolled-back transaction/savepoint (see `backend/tests/conftest.py`). Run them inside the backend container:

```bash
docker compose exec backend pytest tests/ -v
docker compose exec backend pytest tests/test_transfers.py -v            # one file
docker compose exec backend pytest tests/test_transfers.py::test_name -v # one test
```

The frontend has no test suite or linter configured.

## Architecture

Five Compose services: `db` (Postgres), `backend` (FastAPI API), `sms-agent` (same image as backend, runs `sms_agent.py` — a Telegram bot loop), `frontend` (Vite dev server), `cloudflared` (public tunnel).

### Backend (`backend/`)

Flat module layout, no package nesting. Core: `models.py` (all SQLAlchemy models — ~25 entities including Account, CreditCard, Transaction, Loan, MonthlyObligation, Payment, TransactionQueue, Statement), `schemas.py` (Pydantic), `crud.py`, `database.py`. `main.py` wires everything and mounts routers: `webhook.py`, `auth_router.py`, `alrajhi_router.py` (AlRajhi bank OAuth API), `statement_router.py`, `settlement_service.py`.

**SMS ingestion pipeline** (the heart of the app):
1. iOS Shortcuts posts bank SMS to `POST /webhook/sms` (`webhook.py`), or messages arrive via the Telegram bot in `sms_agent.py`.
2. Parsing tries bank-specific regex parsers in `bank_parsers/` (`alrajhi.py`, `jazira.py`, `stc.py`, `default.py` — dispatch via `base.py`), falling back to Gemini AI parsing (`ai_parser.py`, model from `GEMINI_MODEL` env var). Raw Gemini I/O is logged to `backend/gemini_responses.log`, raw SMS to `sms_messages.log`.
3. Parsed transactions go through `queue_processor.py` (`TransactionQueue`), which enforces chronological processing so account balances stay consistent.

**Statement PDF import**: `statement_router.py` + `statement_parser.py` (pdfplumber) parse uploaded bank statement PDFs into draft transactions that the user reviews and commits (auto-approved on commit). `statement_category_mapper.py` maps statement categories. AlRajhi timestamps parse with `dayfirst=True`.

**Auth**: JWT (pyjwt + passlib/bcrypt) via `auth.py` / `auth_middleware.py` / `auth_router.py`; most endpoints depend on `get_current_user`.

**Migrations**: schema changes are applied by `run_migrations()` in `main.py` at startup — inspector-guarded `ALTER TABLE` statements. Follow that pattern for new columns rather than Alembic (an `alembic/` dir and one-off scripts in `backend/migrations/` exist but the startup function is the live convention).

Note: `finance.db`, `finance_tracker.db`, `test_finance.db` (SQLite) in `backend/` are legacy leftovers — Postgres is the real database. The various `debug_*.py`, `fix_*.py`, `test_*.py` files at the backend root and in `scripts/` are one-off debugging/maintenance utilities, not part of the app.

### Frontend (`frontend/`)

React 18 + Vite + Tailwind + react-router. One page per feature in `src/pages/` (Dashboard, Transactions, Accounts, CreditCards, Loans, Obligations, Statements, ...), shared components in `src/components/`, shell in `src/layouts/MainLayout.jsx` + `Sidebar.jsx`. All API calls go through the axios instance in `src/utils/api.js` — `API_URL` is `VITE_API_URL` or `http://<hostname>:8000`. Charts use Recharts; drag-and-drop uses dnd-kit.

## Deployment

- `deploy.sh` — production install (installs Docker, starts stack).
- `deploy-sit.sh` — deploys to the SIT VM (`sysadmin@10.10.80.150`) over SSH: pushes code + `backend/.env` + a DB dump, rebuilds containers, restores the database. Expects the dump at `/tmp/finance_db_sit_dump.sql`.
