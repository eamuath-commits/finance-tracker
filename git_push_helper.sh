#!/bin/bash
set -e

echo ">>> Configuring Git and Pushing to GitHub..."

# 1. Configure Git (if missing)
if [ -z "$(git config user.email)" ]; then
    echo ">>> Git user.email not set. Setting a default for this repo..."
    read -p "Enter your email for Git: " git_email
    git config user.email "$git_email"
fi

if [ -z "$(git config user.name)" ]; then
    echo ">>> Git user.name not set. Setting a default for this repo..."
    read -p "Enter your name for Git: " git_name
    git config user.name "$git_name"
fi

# 2. Add Remote (if missing)
if ! git remote | grep -q origin; then
    git remote add origin https://github.com/eamuath-commits/finance-tracker.git
fi

# 3. Add and Commit
git add .
git commit -m "Initial commit: Phase 1 Core Backend & SMS Parsing" || echo "Nothing to commit"

# 4. Push
echo ">>> Pushing to GitHub (You may be asked for credentials)..."
git branch -M main
git push -u origin main

echo ">>> Done! Now go to your Ubuntu VM and clone using:"
echo "git clone https://github.com/eamuath-commits/finance-tracker.git"
