# SMS Automation Guide 📲

This guide explains how to automatically push your bank SMS notifications to the Finance Tracker to track debits and credits in real-time.

## 1. The Webhook Endpoint
The system has a dedicated endpoint to receive SMS messages.

- **URL**: `http://<YOUR_SERVER_IP>:8000/webhook/sms`
- **Method**: `POST`
- **Header**: `Content-Type: application/json`
- **Body Schema**:
  ```json
  {
    "body": "Your SMS content here...",
    "sender": "BankName"
  }
  ```

### Supported SMS Formats
The system currently parses messages matching these patterns:
1.  **Purchase**: `Purchase of <Currency> <Amount> on card ending <Last4> at <Merchant>`
    *   *Example*: "Purchase of SAR 50.00 on card ending 1234 at ALBAIK"
2.  **Payment**: `Paid <Currency> <Amount> to <Merchant> using card <Last4>`
    *   *Example*: "Paid SAR 200.00 to STC using card 8888"

> **Note**: You can add more patterns by editing `backend/sms_parser.py`.

---

## 2. Automating from iPhone (iOS Shortcuts) 
If you receive bank SMS on your iPhone, you can use the **Shortcuts** app to forward them automatically.

### Step-by-Step Setup:
1.  Open the **Shortcuts** app.
2.  Tap **Automation** (bottom center) -> **New Automation**.
3.  Search for **"Message"** and select it.
4.  **Triggers**:
    *   **Sender**: Choose your Bank's SMS sender name (e.g., "AlRajhi", "SNB").
    *   **Message Contains**: Leave blank (or filter if needed).
    *   **Run Immediately**: ✅ Check this (so it runs in the background).
5.  Tap **Next**.
6.  **Action**: Search for **"Get Contents of URL"**.
7.  Configure the action:
    *   **URL**: `http://<YOUR_SERVER_IP>:8000/webhook/sms` (Use your local IP or public URL if exposed).
    *   **Method**: `POST`
    *   **Headers**: Add `Content-Type`: `application/json`.
    *   **Request Body**: Select **JSON**.
        *   Add Field `sender`: Text -> "BankName"
        *   Add Field `body`: Key `Shortcut Input` (Select the message content variable).
8.  Tap **Done**.

Now, every time you receive an SMS from that bank, it will be pushed to your tracker!

---

## 3. Automating from Android 🤖
You can use apps like **Tasker**, **Macrodroid**, or **IFTTT**.

### Example with Macrodroid:
1.  **Trigger**: SMS Received (Select Sender).
2.  **Action**: HTTP Request.
    *   **Url**: `http://<YOUR_SERVER_IP>:8000/webhook/sms`
    *   **Method**: `POST`
    *   **Content Type**: `application/json`
    *   **Body**: `{"body": "{sms_message}", "sender": "{sms_number}"}`

---

## 4. Testing Manually (cURL) 💻
You can test the system manually using your terminal.

```bash
curl -X POST http://localhost:8000/webhook/sms \
     -H "Content-Type: application/json" \
     -d '{
           "body": "Purchase of SAR 150.00 on card ending 8812 at STARBUCKS",
           "sender": "TestBank"
         }'
```

Returns:
```json
{
  "status": "success",
  "message": "Logged 150.0 at STARBUCKS for account Chase"
}
```
*(Note: Ensure you have an Account created with the matching last 4 digits "8812").*
