"""Products CRUD routes."""
import uuid
from flask import Blueprint, request, jsonify
from db import query, execute
from middleware.auth_middleware import require_auth, require_roles
from realtime import emit_change
from routes.auth_routes import DEFAULT_COMPANY_ID

products_bp = Blueprint("products", __name__)


@products_bp.route("/", methods=["GET"])
@require_auth
def list_products():
    """GET /api/products — list all, ordered by revenue DESC."""
    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    rows = query(
        "SELECT id, name, category, price, units_sold, revenue, trend, cluster, created_at "
        "FROM products WHERE company_id = %s ORDER BY revenue DESC",
        (company_id,),
    )
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "price": float(r["price"]),
            "units_sold": int(r["units_sold"]),
            "revenue": float(r["revenue"]),
            "trend": r["trend"],
            "cluster": r["cluster"],
            "created_at": str(r["created_at"]),
        })
    return jsonify(result)


@products_bp.route("/", methods=["POST"])
@require_roles("owner", "manager", "analyst")
def create_product():
    """POST /api/products — create a new product."""
    body = request.get_json(force=True)
    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    pid = str(uuid.uuid4())
    price = float(body["price"])
    units_sold = int(body.get("units_sold", 0))
    revenue = body.get("revenue", price * units_sold)
    execute(
        "INSERT INTO products (id, name, category, price, units_sold, revenue, trend, cluster, company_id) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (pid, body["name"], body["category"], price, units_sold,
         revenue, body.get("trend", "stable"), body.get("cluster", "question-mark"), company_id),
    )
    emit_change("products", "create", {"id": pid})
    return jsonify({"id": pid}), 201


@products_bp.route("/<pid>", methods=["PUT"])
@require_roles("owner", "manager", "analyst")
def update_product(pid):
    """PUT /api/products/<id> — update a product."""
    body = request.get_json(force=True)
    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    fields, values = [], []
    for col in ("name", "category", "price", "units_sold", "revenue", "trend", "cluster"):
        if col in body:
            fields.append(f"{col} = %s")
            values.append(body[col])
    if not fields:
        return jsonify({"error": "No fields to update"}), 400
    values.extend([company_id, pid])
    execute(f"UPDATE products SET {', '.join(fields)} WHERE company_id = %s AND id = %s", values)
    emit_change("products", "update", {"id": pid})
    return jsonify({"success": True})


@products_bp.route("/<pid>", methods=["DELETE"])
@require_roles("owner", "manager", "analyst")
def delete_product(pid):
    """DELETE /api/products/<id>."""
    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    execute("DELETE FROM products WHERE company_id = %s AND id = %s", (company_id, pid))
    emit_change("products", "delete", {"id": pid})
    return jsonify({"success": True})
