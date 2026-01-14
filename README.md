# Personal Finance Manager (Self-Hosted)

A personal finance system running on Docker + Python FastAPI + PostgreSQL.

## Features (Phase 1)
- **SMS Transaction Parsing**: Automatically logs transactions from bank SMS texts.
- **Account Tracking**: Tracks balances for checking, savings, and credit cards.
- **Loan Management**: Keeps track of your loans.

## Installation on Ubuntu (Proxmox VM)

1.  **Clone the Repository** (or copy files):
    ```bash
    git clone <your-repo-url>
    cd finance-tracker
    ```
    *If you don't have a repo yet, just copy the folder `finance-tracker` to your VM.*

2.  **Run the Deployment Script**:
    ```bash
    chmod +x deploy.sh
    ./deploy.sh
    ```
    This script will automatically install Docker and start the application.

3.  **Verify**:
    Open your browser and visit: `http://<YOUR_VM_IP>:8000/docs`
    You should see the Swagger UI.

## Initial Setup (Manual via Swagger)

Since we don't have a Frontend yet (Phase 2), use the Swagger UI to set up your accounts:

1.  **Create an Account**:
    - `POST /accounts/`
    - JSON Payload:
      ```json
      {
        "name": "My Bank Card",
        "account_type": "Checking",
        "last_4_digits": "1234",
        "current_balance": 5000.00
      }
      ```

2.  **Test SMS Parsing**:
    - `POST /webhook/sms`
    - JSON Payload:
      ```json
      {
        "body": "Purchase of AED 50.00 on card ending 1234 at STARBUCKS",
        "sender": "Bank"
      }
      ```
    - Check if it returned "success".

3.  **Check Balance**:
    - `GET /accounts/`
    - The balance should be `4950.00`.

## Next Steps (Phase 2)
- Dashboard UI (React)
- Deep Analysis & Charts
