"""
Authentication routes — register / login / OTP authentication / logout / current-user
Supports Email & Phone OTP verification, role-based access control, session revocation,
and user profile updates.
"""
import os
import uuid
import hashlib
import secrets

from flask import Blueprint, request, jsonify
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.security import generate_password_hash, check_password_hash

from db import execute, is_sqlite, query
from services.otp_service import (
    create_and_send_otp,
    verify_otp_attempt,
    detect_and_normalize_identifier,
    log_security_event,
)

auth_bp = Blueprint("auth", __name__)

VALID_ROLES = ("owner", "manager", "analyst")
DEFAULT_COMPANY_ID = os.environ.get("DEFAULT_COMPANY_ID", "default-company")

_is_prod_env = os.environ.get("FLASK_ENV") == "production" or os.environ.get("NODE_ENV") == "production"
_SECRET = os.environ.get("AUTH_SECRET")
if _is_prod_env and not _SECRET:
    raise RuntimeError("AUTH_SECRET environment variable is required in production environment.")
if not _SECRET:
    _SECRET = secrets.token_hex(32)
    os.environ["AUTH_SECRET"] = _SECRET

_TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 days
_serializer = URLSafeTimedSerializer(_SECRET, salt="auth-token")


def _make_token(user_id: str) -> str:
    return _serializer.dumps(user_id)


def _read_token(token: str):
    """Return the user id for a valid token, else None."""
    try:
        return _serializer.loads(token, max_age=_TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def _is_token_revoked(token: str) -> bool:
    if not token:
        return True
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    rows = query("SELECT token_hash FROM revoked_tokens WHERE token_hash = %s", (token_hash,))
    return len(rows) > 0


def _revoke_token(token: str):
    if not token:
        return
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    statement = "INSERT OR IGNORE" if is_sqlite() else "INSERT IGNORE"
    execute(f"{statement} INTO revoked_tokens (token_hash) VALUES (%s)", (token_hash,))


def _public_user(row: dict) -> dict:
    """Strip the password hash before sending a user object to client."""
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row.get("phone"),
        "role": row["role"],
        "company_id": row.get("company_id") or DEFAULT_COMPANY_ID,
        "avatarUrl": row.get("avatar_url"),
    }


def _find_by_id(user_id: str):
    rows = query("SELECT * FROM users WHERE id = %s", (user_id,))
    return rows[0] if rows else None


def _current_user_id():
    """Resolve the user id from the request's bearer token if valid and unrevoked."""
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or _is_token_revoked(token):
        return None
    return _read_token(token)


def _find_by_email_or_phone(identifier: str):
    rows = query("SELECT * FROM users WHERE email = %s OR phone = %s", (identifier, identifier))
    return rows[0] if rows else None


# ── OTP AUTHENTICATION ENDPOINTS ──────────────────────────────────────────────

@auth_bp.route("/request-otp", methods=["POST"])
def request_otp():
    """
    POST /api/auth/request-otp
    Input: { "identifier": "user@example.com" } or { "identifier": "+15550100001" }
    Generates a cryptographically secure 6-digit OTP, saves hash, sends email/SMS.
    Does NOT leak the OTP in response.
    """
    body = request.get_json(force=True) or {}
    raw_identifier = body.get("identifier") or body.get("email") or body.get("phone")

    if not raw_identifier:
        return jsonify({"error": "Email address or phone number is required."}), 400

    try:
        res = create_and_send_otp(raw_identifier)
        return jsonify(res), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 429 if "wait" in str(e).lower() else 400
    except Exception as e:
        log_security_event("OTP_REQUEST_ERROR", str(raw_identifier), {"error": str(e)})
        return jsonify({"error": "Failed to send OTP. Please try again."}), 500


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    """
    POST /api/auth/verify-otp
    Input: { "identifier": "user@example.com", "otp": "123456" }
    Verifies OTP hash, expiration, attempt limit, and creates authenticated session.
    """
    body = request.get_json(force=True) or {}
    raw_identifier = body.get("identifier") or body.get("email") or body.get("phone")
    input_otp = body.get("otp") or ""

    if not raw_identifier or not input_otp:
        return jsonify({"error": "Identifier and 6-digit OTP code are required."}), 400

    try:
        res = verify_otp_attempt(raw_identifier, input_otp)
        user_data = res["user"]
        token = _make_token(user_data["id"])
        
        return jsonify({
            "message": "Authentication successful.",
            "token": token,
            "user": user_data
        }), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        log_security_event("OTP_VERIFY_ERROR", str(raw_identifier), {"error": str(e)})
        return jsonify({"error": "An unexpected error occurred during verification."}), 500


@auth_bp.route("/resend-otp", methods=["POST"])
def resend_otp():
    """
    POST /api/auth/resend-otp
    Input: { "identifier": "user@example.com" }
    Invalidates previous active OTP and sends a fresh 6-digit OTP.
    """
    return request_otp()


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """
    POST /api/auth/logout
    Invalidates current bearer session token on server.
    """
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if token:
        user_id = _read_token(token)
        _revoke_token(token)
        log_security_event("LOGOUT", user_id or "unknown_user")

    return jsonify({"message": "Successfully logged out."}), 200


# ── EXISTING AUTH & USER MANAGEMENT ENDPOINTS ────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
def register():
    """POST /api/auth/register — create an account for a given role."""
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    raw_phone = body.get("phone")
    password = body.get("password") or "OtpAuthPassword123!"
    role = body.get("role") or "owner"
    company_id = (body.get("company_id") or DEFAULT_COMPANY_ID).strip() or DEFAULT_COMPANY_ID

    if not name or not email:
        return jsonify({"error": "Name and email are required."}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": "Role must be owner, manager or analyst."}), 400
    
    phone = None
    if raw_phone:
        try:
            phone, _ = detect_and_normalize_identifier(raw_phone)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    if _find_by_email_or_phone(email):
        return jsonify({"error": "An account with this email already exists."}), 409
    if phone and _find_by_email_or_phone(phone):
        return jsonify({"error": "An account with this phone number already exists."}), 409

    user_id = str(uuid.uuid4())
    execute(
        "INSERT INTO users (id, name, email, phone, password_hash, role, company_id) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (user_id, name, email, phone, generate_password_hash(password), role, company_id),
    )
    user = {"id": user_id, "name": name, "email": email, "phone": phone, "role": role, "company_id": company_id}
    log_security_event("USER_REGISTERED", email, {"role": role, "user_id": user_id})
    return jsonify({"token": _make_token(user_id), "user": user}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """POST /api/auth/login — fallback email/password or phone login."""
    body = request.get_json(force=True) or {}
    identifier = (body.get("email") or body.get("identifier") or "").strip().lower()
    password = body.get("password") or ""

    user = _find_by_email_or_phone(identifier)
    if not user or not check_password_hash(user["password_hash"], password):
        log_security_event("LOGIN_FAILED", identifier)
        return jsonify({"error": "Invalid login credentials."}), 401

    log_security_event("LOGIN_SUCCESS", identifier, {"user_id": user["id"]})
    return jsonify({"token": _make_token(user["id"]), "user": _public_user(user)})


@auth_bp.route("/me", methods=["GET"])
def me():
    """GET /api/auth/me — resolve current user from unrevoked bearer token."""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "Not authenticated."}), 401

    user = _find_by_id(user_id)
    if not user:
        return jsonify({"error": "Not authenticated."}), 401
    return jsonify({"user": _public_user(user)})


@auth_bp.route("/profile", methods=["PUT"])
def update_profile():
    """PUT /api/auth/profile — edit signed-in user's own profile."""
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"error": "Not authenticated."}), 401

    user = _find_by_id(user_id)
    if not user:
        return jsonify({"error": "Not authenticated."}), 401

    body = request.get_json(force=True) or {}
    fields, params = [], []

    if "name" in body:
        name = (body.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Name cannot be empty."}), 400
        fields.append("name = %s")
        params.append(name)

    if "phone" in body:
        raw_p = body.get("phone")
        if raw_p:
            try:
                p, _ = detect_and_normalize_identifier(raw_p)
                fields.append("phone = %s")
                params.append(p)
            except ValueError as e:
                return jsonify({"error": str(e)}), 400
        else:
            fields.append("phone = %s")
            params.append(None)

    if "avatarUrl" in body:
        avatar = body.get("avatarUrl")
        if avatar is not None and not isinstance(avatar, str):
            return jsonify({"error": "avatarUrl must be a string or null."}), 400
        fields.append("avatar_url = %s")
        params.append(avatar)

    if not fields:
        return jsonify({"error": "Nothing to update."}), 400

    params.append(user_id)
    execute(f"UPDATE users SET {', '.join(fields)} WHERE id = %s", params)

    updated = _find_by_id(user_id)
    return jsonify({"user": _public_user(updated)})
