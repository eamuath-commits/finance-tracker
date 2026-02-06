# Cloudflare Tunnel Setup Guide

## Prerequisites
- Cloudflare account with a domain
- `cloudflared` CLI installed

## 1. Install cloudflared

```bash
# macOS
brew install cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

## 2. Authenticate with Cloudflare

```bash
cloudflared tunnel login
# This opens browser to authorize - select your domain
```

## 3. Create Tunnel

```bash
cloudflared tunnel create finance-tracker
# Note the tunnel ID (e.g., a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
```

## 4. Configure DNS

```bash
cloudflared tunnel route dns finance-tracker finance.yourdomain.com
# Replace with your actual subdomain
```

## 5. Create Config File

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: finance-tracker
credentials-file: /path/to/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: finance.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

## 6. Run Tunnel

```bash
# Development (foreground)
cloudflared tunnel run finance-tracker

# Production (as service)
sudo cloudflared service install
sudo systemctl start cloudflared
```

## 7. Configure iOS Shortcut

Create a Shortcut with:

1. **Trigger**: Automation → When SMS received
2. **Action**: Get Contents of URL
   - URL: `https://finance.yourdomain.com/webhook/sms`
   - Method: POST
   - Headers:
     - `Content-Type`: `application/json`
     - `X-Webhook-Secret`: `your-secret-key`
   - Body (JSON):
     ```json
     {
       "message": "[SMS Body]",
       "sender": "[SMS Sender]"
     }
     ```

## 8. Set Webhook Secret

Update `.env`:
```bash
WEBHOOK_SECRET=your-very-secure-secret-key-here
```

Generate a secure secret:
```bash
openssl rand -hex 32
```

## Test Commands

```bash
# Health check
curl https://finance.yourdomain.com/webhook/health

# Test SMS (replace with your secret)
curl -X POST https://finance.yourdomain.com/webhook/sms \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret-key" \
  -d '{"message": "Test transaction", "sender": "TestBank"}'
```
