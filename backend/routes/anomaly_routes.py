import json
import sys
import os
from flask import Blueprint, jsonify, request
from db import query
from middleware.auth_middleware import require_auth
from routes.auth_routes import DEFAULT_COMPANY_ID

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from python.anomaly import run_anomaly_detection

anomaly_bp = Blueprint("anomaly", __name__)


@anomaly_bp.route("/", methods=["POST"])
@require_auth
def detect_anomalies():
    """POST /api/anomaly — detect anomalies from transaction data."""
    try:
        company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
        transactions = query(
            "SELECT id, date, description, category, amount, type "
            "FROM transactions WHERE company_id = %s ORDER BY date ASC",
            (company_id,),
        )

        if not transactions:
            return jsonify({"anomalies": [], "model_used": "none"})

        # Group by month
        monthly_map = {}
        for t in transactions:
            month = str(t["date"])[:7]
            if month not in monthly_map:
                monthly_map[month] = {"income": 0, "expense": 0}
            if t["type"] == "income":
                monthly_map[month]["income"] += float(t["amount"])
            else:
                monthly_map[month]["expense"] += float(t["amount"])

        monthly_data = [
            {"month": m, "income": monthly_map[m]["income"], "expense": monthly_map[m]["expense"]}
            for m in sorted(monthly_map.keys())
        ]

        result = run_anomaly_detection({"monthly_data": monthly_data})
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500
