import uuid
import sys
import os
from flask import Blueprint, request, jsonify
from db import query, execute
from middleware.auth_middleware import require_auth
from routes.auth_routes import DEFAULT_COMPANY_ID

# Add parent directory to sys.path if needed
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from python.forecast import run_forecast_model

forecast_bp = Blueprint("forecast", __name__)


@forecast_bp.route("/", methods=["POST"])
@require_auth
def run_forecast():
    """POST /api/forecast — build forecast from transactions, save to MySQL."""
    try:
        company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
        transactions = query(
            "SELECT id, date, description, category, amount, type "
            "FROM transactions WHERE company_id = %s ORDER BY date ASC",
            (company_id,),
        )

        if not transactions:
            return jsonify({
                "forecasts": [],
                "daily_forecast": [],
                "model_used": "none",
                "metrics": {
                    "revenue": {"mae": None, "rmse": None, "mape": None, "sample_count": 0},
                    "expenses": {"mae": None, "rmse": None, "mape": None, "sample_count": 0},
                },
                "interval_method": "unavailable_insufficient_history",
                "historical": {"months": [], "revenues": [], "expenses": []}
            })

        # Group by month
        monthly = {}
        daily_income_map = {}
        for t in transactions:
            month = str(t["date"])[:7]  # YYYY-MM
            date_str = str(t["date"])
            if month not in monthly:
                monthly[month] = {"income": 0, "expense": 0}
            if t["type"] == "income":
                monthly[month]["income"] += float(t["amount"])
                daily_income_map[date_str] = daily_income_map.get(date_str, 0) + float(t["amount"])
            else:
                monthly[month]["expense"] += float(t["amount"])

        months = sorted(monthly.keys())
        revenues = [monthly[m]["income"] for m in months]
        expenses = [monthly[m]["expense"] for m in months]
        daily_sales = [daily_income_map[d] for d in sorted(daily_income_map.keys())]

        # Call Python ML model directly in-memory
        result = run_forecast_model({
            "months": months,
            "revenues": revenues,
            "expenses": expenses,
            "daily_sales": daily_sales,
            "future_count": 6
        })

        # Save forecasts to MySQL (clear old ones first)
        execute("DELETE FROM forecasts WHERE company_id = %s", (company_id,))
        forecasts = result.get("forecasts", [])
        for f in forecasts:
            fid = str(uuid.uuid4())
            execute(
                "INSERT INTO forecasts (id, period, predicted_revenue, predicted_expenses, confidence, company_id) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (fid, f["period"], f["predicted_revenue"], f["predicted_expenses"], f.get("interval_coverage") or 0, company_id),
            )

        return jsonify({
            "forecasts": forecasts,
            "daily_forecast": result.get("daily_forecast", []),
            "model_used": result.get("model_used", "linear_regression"),
            "metrics": result.get("metrics", {}),
            "interval_method": result.get("interval_method"),
            "historical": {"months": months, "revenues": revenues, "expenses": expenses}
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500



@forecast_bp.route("/", methods=["GET"])
@require_auth
def get_forecasts():
    """GET /api/forecast — return saved forecasts from DB."""
    try:
        company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
        rows = query("SELECT * FROM forecasts WHERE company_id = %s ORDER BY period ASC", (company_id,))
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "period": r["period"],
                "predicted_revenue": float(r["predicted_revenue"]),
                "predicted_expenses": float(r["predicted_expenses"]),
                "interval_coverage": float(r["confidence"]) if r["confidence"] else None,
                "created_at": str(r["created_at"]),
            })
        return jsonify({"forecasts": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
