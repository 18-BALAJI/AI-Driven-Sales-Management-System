"""
OTP Authentication & Authorization Service
Provides cryptographically secure OTP generation, hashing, verification,
rate limiting, security logging, and abstract Email/SMS providers.
"""
import os
import re
import secrets
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Tuple, Optional, Dict, Any

from db import query, execute

# Logging configuration for Security Audit Events
logging.basicConfig(level=logging.INFO)
security_logger = logging.getLogger("security_audit")

# Configuration & Environment Variables
AUTH_SECRET = os.environ.get("AUTH_SECRET")
if os.environ.get("FLASK_ENV") == "production" or os.environ.get("NODE_ENV") == "production":
    if not AUTH_SECRET:
        raise RuntimeError("AUTH_SECRET environment variable is required in production environment.")
else:
    AUTH_SECRET = AUTH_SECRET or secrets.token_hex(32)
    os.environ["AUTH_SECRET"] = AUTH_SECRET

OTP_EXPIRATION_SECONDS = int(os.environ.get("OTP_EXPIRATION_SECONDS", "300"))        # 5 minutes
OTP_RESEND_COOLDOWN_SECONDS = int(os.environ.get("OTP_RESEND_COOLDOWN_SECONDS", "60"))   # 60 seconds
MAX_OTP_ATTEMPTS = int(os.environ.get("MAX_OTP_ATTEMPTS", "5"))

EMAIL_SERVICE_PROVIDER = os.environ.get("EMAIL_SERVICE_PROVIDER", "mock").lower()
SMS_SERVICE_PROVIDER = os.environ.get("SMS_SERVICE_PROVIDER", "mock").lower()

# ── Identifier Helpers ─────────────────────────────────────────────────────────

def detect_and_normalize_identifier(raw: str) -> Tuple[str, str]:
    """
    Detects whether an input identifier is an email or a phone number.
    Returns (normalized_identifier, identifier_type) where type is 'email' or 'phone'.
    Raises ValueError if input format is invalid.
    """
    cleaned = (raw or "").strip()
    if not cleaned:
        raise ValueError("Identifier cannot be empty.")

    # Check for email
    if "@" in cleaned:
        email_regex = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        if not re.match(email_regex, cleaned):
            raise ValueError("Please enter a valid email address.")
        return cleaned.lower(), "email"

    # Check for phone number
    digits_and_plus = re.sub(r"[^\d+]", "", cleaned)
    if re.match(r"^\+?[1-9]\d{6,14}$", digits_and_plus):
        normalized_phone = digits_and_plus if digits_and_plus.startswith("+") else "+" + digits_and_plus
        return normalized_phone, "phone"
    elif re.match(r"^\d{10}$", digits_and_plus):
        return "+1" + digits_and_plus if not digits_and_plus.startswith("+") else digits_and_plus, "phone"

    raise ValueError("Please enter a valid email address or phone number.")


def hash_otp(otp: str) -> str:
    """Hashes the plain 6-digit OTP using SHA-256 with server AUTH_SECRET salt."""
    salted = f"{otp}:{AUTH_SECRET}"
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()


def log_security_event(event_type: str, identifier: str, details: Optional[Dict[str, Any]] = None):
    """
    Security Audit Logger. Records auth security events without ever logging
    plain OTPs, passwords, or raw tokens.
    """
    safe_details = details or {}
    for key in ["otp", "password", "token"]:
        if key in safe_details:
            safe_details[key] = "[REDACTED]"
    
    timestamp = datetime.now().isoformat()
    security_logger.info(f"[SECURITY AUDIT] [{timestamp}] Event: {event_type} | Target: {identifier} | Details: {safe_details}")


# ── Email & SMS Provider Services ─────────────────────────────────────────────

class EmailOTPService:
    """Service abstraction for delivering OTP over Email."""

    @staticmethod
    def send_otp(recipient_email: str, otp: str) -> bool:
        if EMAIL_SERVICE_PROVIDER == "smtp":
            smtp_host = os.environ.get("SMTP_HOST")
            smtp_port = int(os.environ.get("SMTP_PORT", "587"))
            smtp_user = os.environ.get("SMTP_USER")
            smtp_pass = os.environ.get("SMTP_PASS")
            smtp_from = os.environ.get("SMTP_FROM", smtp_user)
            
            if smtp_host and smtp_user and smtp_pass:
                try:
                    import smtplib
                    from email.mime.text import MIMEText
                    msg = MIMEText(f"Your Profit Navigator verification code is: {otp}. It expires in 5 minutes.")
                    msg["Subject"] = "Profit Navigator Login OTP Code"
                    msg["From"] = smtp_from
                    msg["To"] = recipient_email

                    with smtplib.SMTP(smtp_host, smtp_port) as server:
                        server.starttls()
                        server.login(smtp_user, smtp_pass)
                        server.send_message(msg)
                    print(f">>> [EmailOTPService] [SMTP SUCCESS] OTP email sent to {recipient_email}", flush=True)
                    return True
                except Exception as e:
                    security_logger.error(f"Failed to send SMTP email to {recipient_email}: {e}")
                    print(f">>> [EmailOTPService] SMTP Error ({e}). Falling back to dev mode console print.", flush=True)
        
        # Development / Mock Mode fallback — Prominently display OTP in terminal console
        print("\n========================================================", flush=True)
        print(f"🔑 [EmailOTPService] MOCK OTP EMAIL DISPATCHED", flush=True)
        print(f"   Target Email : {recipient_email}", flush=True)
        print(f"   OTP Code     : {otp}", flush=True)
        print(f"   Expires In   : 5 Minutes (300s)", flush=True)
        print("========================================================\n", flush=True)
        return True


class SMSOTPService:
    """Service abstraction for delivering OTP over SMS."""

    @staticmethod
    def send_otp(recipient_phone: str, otp: str) -> bool:
        if SMS_SERVICE_PROVIDER == "twilio":
            account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
            auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
            from_number = os.environ.get("TWILIO_PHONE_NUMBER")

            if account_sid and auth_token and from_number:
                try:
                    from twilio.rest import Client
                    client = Client(account_sid, auth_token)
                    client.messages.create(
                        body=f"Your Profit Navigator security verification code is: {otp}. Valid for 5 mins.",
                        from_=from_number,
                        to=recipient_phone
                    )
                    print(f">>> [SMSOTPService] [TWILIO SUCCESS] OTP SMS sent to {recipient_phone}", flush=True)
                    return True
                except Exception as e:
                    security_logger.error(f"Failed to send Twilio SMS to {recipient_phone}: {e}")
                    print(f">>> [SMSOTPService] Twilio Error ({e}). Falling back to dev mode console print.", flush=True)

        # Development / Mock Mode fallback — Prominently display OTP in terminal console
        print("\n========================================================", flush=True)
        print(f"📱 [SMSOTPService] MOCK OTP SMS DISPATCHED", flush=True)
        print(f"   Target Phone : {recipient_phone}", flush=True)
        print(f"   OTP Code     : {otp}", flush=True)
        print(f"   Expires In   : 5 Minutes (300s)", flush=True)
        print("========================================================\n", flush=True)
        return True


# ── Core OTP Manager Logic ───────────────────────────────────────────────────

def create_and_send_otp(raw_identifier: str) -> Dict[str, Any]:
    """
    Generates a cryptographically secure 6-digit OTP, stores its secure hash,
    enforces resend cooldowns, and dispatches via Email or SMS.
    """
    identifier, id_type = detect_and_normalize_identifier(raw_identifier)
    now = datetime.now()

    # Retrieve latest active OTP record for cooldown check
    rows = query(
        "SELECT last_resend_at, expires_at FROM login_otps WHERE identifier = %s AND used = 0 ORDER BY created_at DESC LIMIT 1",
        (identifier,)
    )

    if rows and rows[0].get("last_resend_at"):
        last_resend = rows[0]["last_resend_at"]
        if isinstance(last_resend, str):
            try:
                last_resend = datetime.fromisoformat(last_resend.replace("Z", "").replace("T", " "))
            except Exception:
                last_resend = now
        
        elapsed = (now - last_resend).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            remaining = max(1, int(OTP_RESEND_COOLDOWN_SECONDS - elapsed))
            log_security_event("RATE_LIMIT_TRIGGERED", identifier, {"reason": "cooldown_active", "remaining": remaining})
            
            res = {
                "success": True,
                "cooldownActive": True,
                "message": f"An OTP code was already sent to {identifier}. Please enter your code.",
                "cooldown": remaining,
                "expiresIn": max(10, OTP_EXPIRATION_SECONDS - int(elapsed)),
            }
            if os.environ.get("NODE_ENV") != "production" and os.environ.get("FLASK_ENV") != "production":
                # In dev mode, return fallback active notice
                res["debugOtpNotice"] = "Active OTP code ready for verification"
            return res

    # Find registered user if exists
    user_rows = query("SELECT id FROM users WHERE email = %s OR phone = %s", (identifier, identifier))
    user_id = user_rows[0]["id"] if user_rows else None

    # Invalidate prior active OTPs for this identifier
    execute("UPDATE login_otps SET used = 1 WHERE identifier = %s AND used = 0", (identifier,))

    # Generate 6-digit cryptographically secure OTP
    plain_otp = f"{secrets.randbelow(900000) + 100000}"
    hashed = hash_otp(plain_otp)
    expires_at = now + timedelta(seconds=OTP_EXPIRATION_SECONDS)

    import uuid
    otp_id = str(uuid.uuid4())

    execute(
        "INSERT INTO login_otps (id, identifier, user_id, otp_hash, expires_at, attempts, used, last_resend_at, created_at) "
        "VALUES (%s, %s, %s, %s, %s, 0, 0, %s, %s)",
        (
            otp_id,
            identifier,
            user_id,
            hashed,
            expires_at.strftime("%Y-%m-%d %H:%M:%S"),
            now.strftime("%Y-%m-%d %H:%M:%S"),
            now.strftime("%Y-%m-%d %H:%M:%S")
        )
    )

    # Send OTP via abstract service
    if id_type == "email":
        EmailOTPService.send_otp(identifier, plain_otp)
    else:
        SMSOTPService.send_otp(identifier, plain_otp)

    log_security_event("OTP_REQUESTED", identifier, {"delivery_type": id_type})

    provider_is_mock = (
        (id_type == "email" and EMAIL_SERVICE_PROVIDER == "mock")
        or (id_type == "phone" and SMS_SERVICE_PROVIDER == "mock")
    )

    res = {
        "success": True,
        "message": f"An OTP verification code has been generated.",
        "cooldown": OTP_RESEND_COOLDOWN_SECONDS,
        "expiresIn": OTP_EXPIRATION_SECONDS,
    }

    # When the app is running with the default mock delivery provider, expose the
    # generated code in the API response so the login UI can surface it clearly for
    # local testing without a real email/SMS provider being configured.
    if provider_is_mock or (os.environ.get("NODE_ENV") != "production" and os.environ.get("FLASK_ENV") != "production"):
        res["debugOtp"] = plain_otp
        res["debugMode"] = True
        res["message"] = "An OTP verification code has been generated. Mock delivery mode is active."

    return res


def verify_otp_attempt(raw_identifier: str, input_otp: str) -> Dict[str, Any]:
    """
    Verifies input OTP against stored hash, enforcing expiration, attempt limits,
    and single-use security policies.
    """
    identifier, _ = detect_and_normalize_identifier(raw_identifier)
    input_otp = (input_otp or "").strip()
    now = datetime.now()

    if not input_otp or len(input_otp) != 6 or not input_otp.isdigit():
        raise ValueError("OTP must be a 6-digit numeric code.")

    # Retrieve latest active OTP for identifier
    rows = query(
        "SELECT * FROM login_otps WHERE identifier = %s AND used = 0 ORDER BY created_at DESC LIMIT 1",
        (identifier,)
    )

    if not rows:
        log_security_event("OTP_FAILED", identifier, {"reason": "no_active_otp"})
        raise ValueError("OTP has expired or is invalid. Please request a new OTP.")

    record = rows[0]
    otp_id = record["id"]
    attempts = record["attempts"]
    expires_at = record["expires_at"]
    
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "").replace("T", " "))
        except Exception:
            expires_at = now

    # Check expiration
    if now > expires_at:
        execute("UPDATE login_otps SET used = 1 WHERE id = %s", (otp_id,))
        log_security_event("OTP_FAILED", identifier, {"reason": "expired"})
        raise ValueError("OTP has expired. Please request a new OTP.")

    # Check max attempt limit
    if attempts >= MAX_OTP_ATTEMPTS:
        execute("UPDATE login_otps SET used = 1 WHERE id = %s", (otp_id,))
        log_security_event("OTP_FAILED", identifier, {"reason": "max_attempts_exceeded"})
        raise ValueError("Too many failed attempts. Please request a new OTP.")

    # Check hash match
    input_hash = hash_otp(input_otp)
    if input_hash != record["otp_hash"]:
        new_attempts = attempts + 1
        remaining = MAX_OTP_ATTEMPTS - new_attempts
        
        if new_attempts >= MAX_OTP_ATTEMPTS:
            execute("UPDATE login_otps SET attempts = %s, used = 1 WHERE id = %s", (new_attempts, otp_id))
            log_security_event("OTP_FAILED", identifier, {"reason": "max_attempts_reached", "attempts": new_attempts})
            raise ValueError("Too many failed attempts. Please request a new OTP.")
        else:
            execute("UPDATE login_otps SET attempts = %s WHERE id = %s", (new_attempts, otp_id))
            log_security_event("OTP_FAILED", identifier, {"reason": "invalid_code", "attempts": new_attempts})
            raise ValueError(f"Invalid OTP. {remaining} attempt{'s' if remaining > 1 else ''} remaining.")

    # OTP match successful! Mark used and resolve user
    execute("UPDATE login_otps SET used = 1 WHERE id = %s", (otp_id,))
    
    # Resolve associated user
    user_rows = query("SELECT * FROM users WHERE email = %s OR phone = %s", (identifier, identifier))
    if not user_rows:
        log_security_event("OTP_VERIFIED_NO_USER", identifier)
        raise ValueError("Account not registered. Please sign up to create an account.")

    user = user_rows[0]
    log_security_event("OTP_VERIFIED", identifier, {"user_id": user["id"], "role": user["role"]})

    return {
        "success": True,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user.get("phone"),
            "role": user["role"],
            "avatarUrl": user.get("avatar_url")
        }
    }
