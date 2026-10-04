"""
Page-visibility routes — the Financial Analyst controls which pages each
role (owner / manager) is allowed to see. Pages default to visible when no
row exists, so the table only stores explicit overrides.
"""
from flask import Blueprint, request, jsonify
from db import query, execute
from realtime import emit_change
from middleware.auth_middleware import require_roles

visibility_bp = Blueprint("visibility", __name__)


@visibility_bp.route("/", methods=["GET"])
def get_visibility():
    """GET /api/visibility[?role=owner|manager] — list visibility overrides."""
    role = request.args.get("role")
    if role in ("owner", "manager"):
        rows = query(
            "SELECT page_url, role, visible FROM page_visibility WHERE role = %s",
            (role,),
        )
    else:
        rows = query("SELECT page_url, role, visible FROM page_visibility")
    return jsonify([
        {"pageUrl": r["page_url"], "role": r["role"], "visible": bool(r["visible"])}
        for r in rows
    ])


@visibility_bp.route("/", methods=["PUT"])
@require_roles("analyst", "owner")
def set_visibility():
    """PUT /api/visibility — upsert a page/role visibility flag.

    Body: { "pageUrl": "/products", "role": "manager", "visible": false }
    """
    body = request.get_json(force=True)
    page_url = body.get("pageUrl")
    role = body.get("role")
    if not page_url or role not in ("owner", "manager"):
        return jsonify({"error": "pageUrl and a valid role are required"}), 400

    visible = 1 if body.get("visible", True) else 0
    execute(
        "INSERT INTO page_visibility (page_url, role, visible) VALUES (%s, %s, %s) "
        "ON DUPLICATE KEY UPDATE visible = VALUES(visible)",
        (page_url, role, visible),
    )
    emit_change("visibility", "update", {"pageUrl": page_url, "role": role})
    return jsonify({"success": True, "pageUrl": page_url, "role": role, "visible": bool(visible)})
