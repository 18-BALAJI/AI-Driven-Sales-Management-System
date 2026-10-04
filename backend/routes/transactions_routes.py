"""Transactions CRUD routes."""
import uuid
from flask import Blueprint, request, jsonify
from db import query, execute
from middleware.auth_middleware import require_auth, require_roles
from realtime import emit_change
from routes.auth_routes import DEFAULT_COMPANY_ID

transactions_bp = Blueprint("transactions", __name__)


@transactions_bp.route("/", methods=["GET"])
@require_auth
def list_transactions():
    """GET /api/transactions — list all, newest first."""
    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    rows = query(
        "SELECT id, date, description, category, amount, type, created_at "
        "FROM transactions WHERE company_id = %s ORDER BY date DESC",
        (company_id,),
    )
    # Convert Decimal / date to JSON-safe types
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "date": str(r["date"]),
            "description": r["description"],
            "category": r["category"],
            "amount": float(r["amount"]),
            "type": r["type"],
            "created_at": str(r["created_at"]),
        })
    return jsonify(result)


@transactions_bp.route("/", methods=["POST"])
@require_roles("owner", "manager", "analyst")
def create_transaction():
    """POST /api/transactions — create a new transaction."""
    body = request.get_json(force=True)
    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    tid = str(uuid.uuid4())
    execute(
        "INSERT INTO transactions (id, date, description, category, amount, type, company_id) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (tid, body["date"], body["description"], body["category"],
         body["amount"], body["type"], company_id),
    )
    emit_change("transactions", "create", {"id": tid})
    return jsonify({"id": tid}), 201


@transactions_bp.route("/<tid>", methods=["PUT"])
@require_roles("owner", "manager", "analyst")
def update_transaction(tid):
    """PUT /api/transactions/<id> — update a transaction."""
    body = request.get_json(force=True)
    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    fields, values = [], []
    for col in ("date", "description", "category", "amount", "type"):
        if col in body:
            fields.append(f"{col} = %s")
            values.append(body[col])
    if not fields:
        return jsonify({"error": "No fields to update"}), 400
    values.extend([company_id, tid])
    execute(f"UPDATE transactions SET {', '.join(fields)} WHERE company_id = %s AND id = %s", values)
    emit_change("transactions", "update", {"id": tid})
    return jsonify({"success": True})


@transactions_bp.route("/<tid>", methods=["DELETE"])
@require_roles("owner", "manager", "analyst")
def delete_transaction(tid):
    """DELETE /api/transactions/<id>."""
    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    execute("DELETE FROM transactions WHERE company_id = %s AND id = %s", (company_id, tid))
    emit_change("transactions", "delete", {"id": tid})
    return jsonify({"success": True})
