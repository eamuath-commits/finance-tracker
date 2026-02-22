---
description: How to deploy the SIT environment to the remote Linux VM (10.10.80.150)
---

# SIT Deployment Workflow

// turbo-all

## 1. Dump local database
```bash
cd /Users/muathalasiri/finance-tracker/finance-tracker && docker compose exec db pg_dump -U postgres -d finance_db --no-owner --no-acl > /tmp/finance_db_sit_dump.sql
```

## 2. Copy files to VM
```bash
scp /tmp/finance_db_sit_dump.sql sysadmin@10.10.80.150:/tmp/
scp /Users/muathalasiri/finance-tracker/finance-tracker/backend/.env sysadmin@10.10.80.150:/tmp/backend.env
```

## 3. SSH into the VM
```bash
ssh sysadmin@10.10.80.150
```

## 4. On the VM — Clone/update repo
```bash
cd ~/finance-tracker && git pull origin main || (cd ~ && git clone https://github.com/eamuath-commits/finance-tracker.git && cd finance-tracker)
cp /tmp/backend.env ~/finance-tracker/backend/.env
```

## 5. On the VM — Start Docker
```bash
cd ~/finance-tracker && docker compose up -d --build
```

## 6. On the VM — Restore database
```bash
docker compose exec db psql -U postgres -c "DROP DATABASE IF EXISTS finance_db;"
docker compose exec db psql -U postgres -c "CREATE DATABASE finance_db;"
docker compose exec -T db psql -U postgres -d finance_db < /tmp/finance_db_sit_dump.sql
docker compose restart backend sms-agent
```

## 7. Verify
- Frontend: http://10.10.80.150:3000
- Backend API: http://10.10.80.150:8000/docs
