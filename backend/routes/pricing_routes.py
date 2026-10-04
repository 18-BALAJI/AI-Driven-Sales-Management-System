"""
Pricing routes — AI pricing suggestions (XGBoost) + Analyst approval workflow.

Flow:
  1. POST /api/pricing/generate  -> runs XGBoost on current products, replaces the
     pending recommendations in MySQL, returns them.
  2. GET  /api/pricing           -> list stored recommendations (filter by ?status=).
  3. POST /api/pricing/<id>/approve -> applies suggested price to the product,
     marks the recommendation 'approved'.
  4. POST /api/pricing/<id>/reject  -> marks the recommendation 'rejected'.

Every mutation broadcasts a real-time "data_changed" event for the
"pricing" (and "products" on approve) resources.
"""
import json
import sys
import os
import uuid
from datetime import date
from flask import Blueprint, request, jsonify
from db import query, execute
from middleware.auth_middleware import require_auth, require_roles
from realtime import emit_change

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from python.pricing_model import run_pricing_model

pricing_bp = Blueprint("pricing", __name__)


def _company_id():
    return request.current_user.get("company_id") or os.environ.get("DEFAULT_COMPANY_ID", "default-company")


def _serialize(row):
    return {
        "id": row["id"],
        "productId": row["product_id"],
        "product": row["product_name"],
        "currentPrice": float(row["current_price"]),
        "suggestedPrice": float(row["suggested_price"]),
        "reason": row["reason"],
        "confidence": int(row["confidence"]),
        "expectedImpact": row["expected_impact"],
        "priceElasticity": float(row["price_elasticity"]) if row.get("price_elasticity") is not None else None,
        "projectedUnits": int(row["projected_units"]) if row.get("projected_units") is not None else None,
        "projectedRevenue": float(row["projected_revenue"]) if row.get("projected_revenue") is not None else None,
        "modelFitR2": float(row["model_fit_r2"]) if row.get("model_fit_r2") is not None else None,
        "sampleCount": int(row["sample_count"]) if row.get("sample_count") is not None else None,
        "modelUsed": row["model_used"],
        "status": row["status"],
        "createdAt": str(row["created_at"]),
        "reviewedAt": str(row["reviewed_at"]) if row["reviewed_at"] else None,
    }


@pricing_bp.route("/observations", methods=["POST"])
@require_roles("owner", "manager")
def record_price_observation():
    """Record units sold at a price over an explicit comparable date range."""
    body = request.get_json(silent=True) or {}
    try:
        product_id = str(body["product_id"])
        price = float(body["price"])
        units_sold = int(body["units_sold"])
        period_start = date.fromisoformat(body["period_start"])
        period_end = date.fromisoformat(body["period_end"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Provide product_id, positive price, non-negative units_sold, and ISO period_start/period_end dates."}), 400

    if price <= 0 or units_sold < 0 or period_end < period_start:
        return jsonify({"error": "Price must be positive, units cannot be negative, and the period end must not precede its start."}), 400

    company_id = _company_id()
    product = query("SELECT id FROM products WHERE id = %s AND company_id = %s", (product_id, company_id))
    if not product:
        return jsonify({"error": "Product not found for this company."}), 404

    observation_id = str(uuid.uuid4())
    execute(
        "INSERT INTO product_price_observations "
        "(id, product_id, price, units_sold, period_start, period_end, company_id) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (observation_id, product_id, price, units_sold, period_start.isoformat(), period_end.isoformat(), company_id),
    )
    return jsonify({"id": observation_id}), 201


@pricing_bp.route("/generate", methods=["POST"])
@require_roles("owner", "manager")
def generate_pricing():
    """Estimate elasticity and generate bounded, evidence-backed price tests."""
    try:
        company_id = _company_id()
        rows = query(
            "SELECT id, name, price FROM products WHERE company_id = %s",
            (company_id,),
        )
        if not rows:
            return jsonify({"suggestions": [], "skipped": [], "model_used": "observed_log_log_elasticity"})

        observation_rows = query(
            "SELECT product_id, price, units_sold, period_start, period_end "
            "FROM product_price_observations WHERE company_id = %s ORDER BY period_end ASC",
            (company_id,),
        )
        observations_by_product = {}
        for observation in observation_rows:
            start = date.fromisoformat(str(observation["period_start"])[:10])
            end = date.fromisoformat(str(observation["period_end"])[:10])
            observations_by_product.setdefault(observation["product_id"], []).append({
                "price": float(observation["price"]),
                "units_sold": int(observation["units_sold"]),
                "period_days": (end - start).days + 1,
            })

        products = [{
            "id": row["id"],
            "name": row["name"],
            "price": float(row["price"]),
            "observations": observations_by_product.get(row["id"], []),
        } for row in rows]
        result = run_pricing_model({"products": products})
        suggestions = result["suggestions"]

        execute(
            "DELETE FROM pricing_recommendations WHERE status = 'pending' AND company_id = %s",
            (company_id,),
        )
        for suggestion in suggestions:
            explanation = suggestion["explanation"]
            execute(
                "INSERT INTO pricing_recommendations "
                "(id, product_id, product_name, current_price, suggested_price, reason, confidence, "
                "expected_impact, model_used, status, company_id, price_elasticity, projected_units, "
                "projected_revenue, model_fit_r2, sample_count) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s, %s, %s, %s, %s)",
                (str(uuid.uuid4()), suggestion["productId"], suggestion["product"],
                 suggestion["currentPrice"], suggestion["suggestedPrice"], suggestion["reason"],
                 suggestion["confidence"], suggestion["expectedImpact"], suggestion["modelUsed"],
                 company_id, suggestion["priceElasticity"], suggestion["projectedUnits"],
                 suggestion["projectedRevenue"], explanation["fit_r2"], explanation["observations"]),
            )

        emit_change("pricing", "generate", {"count": len(suggestions)})

        stored = query(
            "SELECT * FROM pricing_recommendations WHERE status = 'pending' "
            "AND company_id = %s ORDER BY created_at DESC",
            (company_id,),
        )
        return jsonify({
            "suggestions": [_serialize(r) for r in stored],
            "skipped": result["skipped"],
            "model_used": result["model_used"],
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@pricing_bp.route("/", methods=["GET"])
@require_auth
def list_pricing():
    """GET /api/pricing[?status=pending] — list stored recommendations."""
    status = request.args.get("status")
    company_id = _company_id()
    if status:
        rows = query(
            "SELECT * FROM pricing_recommendations WHERE status = %s AND company_id = %s ORDER BY created_at DESC",
            (status, company_id),
        )
    else:
        rows = query("SELECT * FROM pricing_recommendations WHERE company_id = %s ORDER BY created_at DESC", (company_id,))
    return jsonify([_serialize(r) for r in rows])


# Backward-compat: old frontend POSTed to /api/pricing to get live suggestions.
@pricing_bp.route("/", methods=["POST"])
@require_roles("owner", "manager")
def get_pricing():
    """POST /api/pricing — alias for /generate."""
    return generate_pricing()


@pricing_bp.route("/<rec_id>/approve", methods=["POST"])
@require_roles("analyst")
def approve_pricing(rec_id):
    """POST /api/pricing/<id>/approve — apply the suggested price and mark approved."""
    company_id = _company_id()
    rows = query("SELECT * FROM pricing_recommendations WHERE id = %s AND company_id = %s", (rec_id, company_id))
    if not rows:
        return jsonify({"error": "Recommendation not found"}), 404
    rec = rows[0]

    # Apply the suggested price to the product, recomputing revenue.
    execute(
        "UPDATE products SET price = %s, revenue = %s * units_sold WHERE id = %s AND company_id = %s",
        (rec["suggested_price"], rec["suggested_price"], rec["product_id"], company_id),
    )
    execute(
        "UPDATE pricing_recommendations SET status = 'approved', "
        "reviewed_at = CURRENT_TIMESTAMP WHERE id = %s AND company_id = %s",
        (rec_id, company_id),
    )

    emit_change("pricing", "approve", {"id": rec_id})
    emit_change("products", "update", {"id": rec["product_id"]})
    return jsonify({"success": True, "status": "approved"})


@pricing_bp.route("/<rec_id>/reject", methods=["POST"])
@require_roles("analyst")
def reject_pricing(rec_id):
    """POST /api/pricing/<id>/reject — mark recommendation rejected (no price change)."""
    company_id = _company_id()
    affected = query("SELECT id FROM pricing_recommendations WHERE id = %s AND company_id = %s", (rec_id, company_id))
    if not affected:
        return jsonify({"error": "Recommendation not found"}), 404

    execute(
        "UPDATE pricing_recommendations SET status = 'rejected', "
        "reviewed_at = CURRENT_TIMESTAMP WHERE id = %s AND company_id = %s",
        (rec_id, company_id),
    )
    emit_change("pricing", "reject", {"id": rec_id})
    return jsonify({"success": True, "status": "rejected"})
