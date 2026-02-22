#!/bin/bash
# SIT Deployment Script for Finance Tracker
# Target: sysadmin@10.10.80.150

set -e
VM="sysadmin@10.10.80.150"
REMOTE_DIR="finance-tracker"

echo "========================================="
echo " Finance Tracker SIT Deployment"
echo "========================================="

# Step 1: Copy SSH key (one-time, requires password)
echo ""
echo "[1/5] Setting up SSH key auth..."
ssh-copy-id -i ~/.ssh/id_ed25519.pub $VM 2>/dev/null || echo "Key may already be installed"

# Step 2: Copy DB dump and .env
echo ""
echo "[2/5] Copying DB dump and .env to VM..."
scp /tmp/finance_db_sit_dump.sql $VM:/tmp/
scp ~/finance-tracker/finance-tracker/backend/.env $VM:/tmp/backend.env
echo "  ✅ Files copied"

# Step 3: Clone/update repo on VM
echo ""
echo "[3/5] Setting up code on VM..."
ssh $VM "
  if [ -d ~/$REMOTE_DIR ]; then
    echo '  Repo exists, pulling latest...'
    cd ~/$REMOTE_DIR && git pull origin main
  else
    echo '  Cloning repo...'
    cd ~ && git clone https://github.com/eamuath-commits/finance-tracker.git
  fi
  cp /tmp/backend.env ~/$REMOTE_DIR/backend/.env
  echo '  ✅ Code ready'
"

# Step 4: Start Docker
echo ""
echo "[4/5] Starting Docker containers..."
ssh $VM "
  cd ~/$REMOTE_DIR
  docker compose down 2>/dev/null || true
  docker compose up -d --build
  echo '  Waiting for containers to start...'
  sleep 10
  docker compose ps
"

# Step 5: Restore database
echo ""
echo "[5/5] Restoring database..."
ssh $VM "
  cd ~/$REMOTE_DIR
  docker compose exec db psql -U postgres -c 'DROP DATABASE IF EXISTS finance_db;'
  docker compose exec db psql -U postgres -c 'CREATE DATABASE finance_db;'
  docker compose exec -T db psql -U postgres -d finance_db < /tmp/finance_db_sit_dump.sql
  docker compose restart backend sms-agent
  echo '  ✅ Database restored'
"

echo ""
echo "========================================="
echo " ✅ SIT Deployment Complete!"
echo "========================================="
echo ""
echo " Frontend:  http://10.10.80.150:3000"
echo " API Docs:  http://10.10.80.150:8000/docs"
echo ""
