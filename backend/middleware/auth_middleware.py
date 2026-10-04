"""
Authentication & Authorization Middleware / Decorators for Flask
Provides @require_auth and @require_roles guards for backend endpoints.
"""
import hashlib
from functools import wraps
from flask import request, jsonify

from db import query
from routes.auth_routes import _read_token, _find_by_id

def is_token_revoked(token: str) -> bool:
    """Checks if a bearer token has been revoked (e.g., via logout)."""
    if not token:
        return True
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    rows = query("SELECT token_hash FROM revoked_tokens WHERE token_hash = %s", (token_hash,))
    return len(rows) > 0


def get_authenticated_user():
    """Resolves current user from request Authorization header or returns None."""
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or is_token_revoked(token):
        return None, None
    user_id = _read_token(token)
    if not user_id:
        return None, None
    user = _find_by_id(user_id)
    return user, token


def require_auth(fn):
    """Decorator to require any valid authenticated user session."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user, _ = get_authenticated_user()
        if not user:
            return jsonify({"error": "Authentication required. Please log in with OTP."}), 401
        request.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def require_roles(*allowed_roles):
    """
    Decorator for Role-Based Access Control (Authorization).
    Example: @require_roles("owner", "analyst")
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user, _ = get_authenticated_user()
            if not user:
                return jsonify({"error": "Authentication required. Please log in."}), 401
            
            user_role = user.get("role")
            if user_role not in allowed_roles:
                return jsonify({
                    "error": f"Unauthorized. Your role ({user_role}) does not have permission to access this resource."
                }), 403
            
            request.current_user = user
            return fn(*args, **kwargs)
        return wrapper
    return decorator
