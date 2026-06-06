# backend/webhook.py
"""
SMS Webhook endpoint for Cloudflare Tunnel integration.
Receives SMS messages from iOS Shortcuts and processes them using AI parsing.
"""
import os
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
import crud
import sms_agent

logger = logging.getLogger("webhook")

# Webhook secret from environment
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")

router = APIRouter(prefix="/webhook", tags=["Webhook"])


class SMSWebhookRequest(BaseModel):
    """Request body for SMS webhook."""
    message: str
    sender: Optional[str] = "Unknown"
    timestamp: Optional[str] = None  # Optional ISO timestamp from Shortcut


class SMSWebhookResponse(BaseModel):
    """Response from SMS webhook."""
    status: str
    message: str
    transaction_id: Optional[str] = None
    parsed_data: Optional[dict] = None


def verify_secret(x_webhook_secret: str = Header(default="")):
    """Verify the webhook secret header."""
    if not WEBHOOK_SECRET:
        logger.warning("WEBHOOK_SECRET not configured - webhook is OPEN (dev mode)")
        return True
    
    if x_webhook_secret != WEBHOOK_SECRET:
        logger.warning(f"Invalid webhook secret attempted")
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    
    return True


@router.post("/sms", response_model=SMSWebhookResponse)
async def receive_sms(
    request: SMSWebhookRequest,
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret)
):
    """
    Receive SMS message from iOS Shortcut via Cloudflare Tunnel.
    
    Expected headers:
    - X-Webhook-Secret: Your secret key
    
    Expected body:
    - message: The SMS content
    - sender: The SMS sender (e.g., "AlRajhiBank")
    - timestamp: Optional ISO timestamp
    """
    logger.info(f"Webhook received SMS from {request.sender}: {request.message[:50]}...")
    
    # Log to SMS logger if available
    if hasattr(sms_agent, 'sms_logger'):
        sms_agent.sms_logger.info(f"FROM: Webhook-{request.sender} | SMS: {request.message.replace(chr(10), ' | ')}")
    
    # --- OTP Detection: Skip OTP/Verification messages ---
    otp_keywords = ['otp', 'verification code', 'verify code', 'security code', 'one-time password',
                    'one time password', 'رمز التحقق', 'رمز التفعيل', 'كود التحقق', 'verification pin',
                    'authentication code', 'login code', 'signin code', 'sign-in code', '2fa code']
    msg_lower = request.message.lower()
    if any(kw in msg_lower for kw in otp_keywords):
        logger.info(f"Skipping OTP/verification message")
        return SMSWebhookResponse(
            status="skipped",
            message="OTP/verification message detected - not processed"
        )
    
    try:
        # Save raw message to database
        raw_msg = models.RawMessage(
            sender=request.sender or "Unknown",
            body=request.message,
            status=models.MessageStatus.PENDING,
            timestamp=datetime.now()
        )
        db.add(raw_msg)
        db.commit()
        db.refresh(raw_msg)

        # Default user: admin (will be overridden when account is matched)
        default_user = db.query(models.User).filter(models.User.username == "admin").first()
        resolved_user_id = default_user.id if default_user else None
        
        # Use bank-specific parser based on sender
        from bank_parsers import get_parser
        parser = get_parser(request.sender or "Unknown")
        result = await parser.parse(db, request.message)
        
        if "error" in result:
            raw_msg.status = models.MessageStatus.FAILED
            raw_msg.error_log = result['error']
            db.commit()
            return SMSWebhookResponse(
                status="error",
                message=f"AI parsing failed: {result['error']}"
            )
        
        # Validate parsed digits
        result = sms_agent.validate_parsed_digits(request.message, result)
        
        if not result.get("is_financial_event"):
            raw_msg.status = models.MessageStatus.FAILED
            raw_msg.error_log = "Not a financial event"
            db.commit()
            return SMSWebhookResponse(
                status="skipped",
                message="Not a financial event",
                parsed_data=result
            )
        
        # Check for declines
        if result.get("status") == "failed" or result.get("sub_type") == "decline":
            raw_msg.status = models.MessageStatus.PARSED
            raw_msg.error_log = "Transaction Declined (Not added to ledger)"
            db.commit()
            return SMSWebhookResponse(
                status="declined",
                message=f"Transaction declined: {result.get('merchant')} - {result.get('amount')} {result.get('currency', 'SAR')}",
                parsed_data=result
            )
        
        # Find source account/credit card
        source_account = None
        source_credit_card = None
        source_last4 = result.get('source_account_last4') or result.get('destination_account_last4')
        
        if source_last4:
            clean_source = "".join(filter(str.isdigit, str(source_last4)))
            if len(clean_source) >= 4:
                source_last4 = clean_source[-4:]
                source_credit_card = crud.get_credit_card_by_last4(db, source_last4)
                if not source_credit_card:
                    source_account = crud.get_account_by_last_4(db, source_last4)
        
        # Fallback to card_info
        if not source_account and not source_credit_card and result.get('card_info'):
            card_digits = "".join(filter(str.isdigit, str(result.get('card_info'))))
            if len(card_digits) >= 4:
                source_last4 = card_digits[-4:]
                source_credit_card = crud.get_credit_card_by_last4(db, source_last4)
                if not source_credit_card:
                    source_account = crud.get_account_by_last_4(db, source_last4)
        
        # Resolve user_id from matched account/card owner
        if source_credit_card and hasattr(source_credit_card, 'user_id') and source_credit_card.user_id:
            resolved_user_id = source_credit_card.user_id
        elif source_account and hasattr(source_account, 'user_id') and source_account.user_id:
            resolved_user_id = source_account.user_id
        
        # Tag the raw message with the resolved user
        raw_msg.user_id = resolved_user_id
        db.commit()
        
        if not source_account and not source_credit_card:
            # Account not found - tag with default user and mark pending
            raw_msg.status = models.MessageStatus.PENDING
            raw_msg.error_log = "Account not found - needs manual assignment"
            raw_msg.user_id = resolved_user_id
            db.commit()
            return SMSWebhookResponse(
                status="pending",
                message=f"Account not found for {source_last4 or 'unknown'}. Transaction saved as pending.",
                parsed_data=result
            )
        
        # Create transaction using existing logic
        await sms_agent._create_transaction_logic(
            db, result, source_account, source_credit_card, 
            request.message, reply_target=None, source="webhook",
            user_id=resolved_user_id
        )
        
        raw_msg.status = models.MessageStatus.PARSED
        db.commit()
        
        account_name = source_credit_card.name if source_credit_card else source_account.name
        return SMSWebhookResponse(
            status="success",
            message=f"Transaction created: {result.get('amount')} {result.get('currency', 'SAR')} at {result.get('merchant', 'Unknown')}",
            parsed_data=result
        )
        
    except Exception as e:
        logger.error(f"Webhook processing error: {e}", exc_info=True)
        if 'raw_msg' in locals():
            raw_msg.status = models.MessageStatus.FAILED
            raw_msg.error_log = str(e)
            db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def webhook_health():
    """Health check for webhook endpoint."""
    return {
        "status": "ok",
        "service": "sms-webhook",
        "secret_configured": bool(WEBHOOK_SECRET)
    }
