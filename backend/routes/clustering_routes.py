import json
import sys
import os
from flask import Blueprint, jsonify, request
from db import query, execute
from middleware.auth_middleware import require_auth
from routes.auth_routes import DEFAULT_COMPANY_ID

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from python.clustering import run_kmeans_clustering

clustering_bp = Blueprint("clustering", __name__)


@clustering_bp.route("/", methods=["POST"])
@require_auth
def run_clustering():
    """POST /api/clustering — assign explainable catalog-relative segments."""
    try:
        company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
        rows = query(
            "SELECT id, name, price, units_sold, revenue, trend, cluster FROM products WHERE company_id = %s",
            (company_id,),
        )

        if not rows:
            return jsonify({"clusters": [], "model_used": "none"})

        # Convert Decimals for JSON serialization
        products = []
        for r in rows:
            products.append({
                "id": r["id"],
                "name": r["name"],
                "price": float(r["price"]),
                "units_sold": int(r["units_sold"]),
                "revenue": float(r["revenue"]),
                "trend": r["trend"],
                "cluster": r["cluster"],
            })

        result = run_kmeans_clustering({"products": products})

        # Update cluster labels in MySQL
        for item in result.get("clusters", []):
            execute(
                "UPDATE products SET cluster = %s WHERE company_id = %s AND id = %s",
                (item["cluster"], company_id, item["id"]),
            )

        return jsonify(result)


    except Exception as e:
        return jsonify({"error": str(e)}), 500
