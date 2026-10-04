"""
Industry Preset Data Generator — Switch business profiles dynamically for real-world simulation.
"""
import uuid
import random
from datetime import date, timedelta
from flask import Blueprint, request, jsonify
from db import query, execute, execute_many
from realtime import emit_change

data_bp = Blueprint("data", __name__)

PRESETS_DATA = {
    "retail": {
        "name": "Supermarket & Retail Electronics",
        "products": [
            ("iPhone 15 Pro Max", "Electronics", 1100.00, 140, 154000.00, "up", "star"),
            ("Samsung Galaxy S24", "Electronics", 950.00, 95, 90250.00, "up", "star"),
            ("Casio G-Shock Watch", "Accessories", 120.00, 310, 37200.00, "up", "cash-cow"),
            ("MacBook Pro M3", "Computers", 1999.00, 45, 89955.00, "up", "star"),
            ("Sony WH-1000XM5 Headphones", "Audio", 349.00, 180, 62820.00, "up", "cash-cow"),
            ("Logitech MX Master 3S", "Accessories", 99.00, 420, 41580.00, "up", "cash-cow"),
        ],
        "sales_types": ["Counter sales", "Online order", "Walk-in sales", "Card payment"],
        "base_daily_revenue": 1800,
        "expenses": {"Rent": 3500, "Utilities": 600, "Payroll": 4000, "Restock": 800}
    },
    "saas": {
        "name": "SaaS & Subscription Software",
        "products": [
            ("Enterprise Annual Plan", "Subscription", 2400.00, 45, 108000.00, "up", "star"),
            ("Pro Monthly Plan", "Subscription", 99.00, 850, 84150.00, "up", "star"),
            ("Starter Monthly Plan", "Subscription", 29.00, 1200, 34800.00, "stable", "cash-cow"),
            ("API Add-on Usage", "Usage", 0.05, 500000, 25000.00, "up", "cash-cow"),
            ("Dedicated Support SLA", "Services", 500.00, 20, 10000.00, "down", "question-mark"),
        ],
        "sales_types": ["Stripe Subscription", "Annual Contract Renewal", "Self-Serve Checkout"],
        "base_daily_revenue": 2500,
        "expenses": {"AWS Cloud Infrastructure": 1800, "Google Ads Marketing": 2200, "Dev Team Payroll": 8500, "SaaS Tools": 450}
    },
    "restaurant": {
        "name": "Restaurant & Hospitality Cafe",
        "products": [
            ("Artisan Espresso Roast", "Beverages", 4.50, 4200, 18900.00, "up", "cash-cow"),
            ("Gourmet Avocado Toast", "Food", 12.00, 1800, 21600.00, "up", "star"),
            ("Chef Special Dinner Course", "Food", 45.00, 650, 29250.00, "up", "star"),
            ("Craft House Cocktails", "Beverages", 14.00, 1200, 16800.00, "stable", "cash-cow"),
            ("Pastry Selection Box", "Food", 8.50, 950, 8075.00, "down", "underperformer"),
        ],
        "sales_types": ["Dine-in Order", "Takeout Order", "Catering Contract", "Delivery App"],
        "base_daily_revenue": 1400,
        "expenses": {"Fresh Food Produce": 1200, "Commercial Kitchen Rent": 2800, "Kitchen Staff Payroll": 3800, "Utilities": 950}
    },
    "healthcare": {
        "name": "Healthcare & Medical Pharmacy",
        "products": [
            ("Comprehensive Health Checkup", "Clinical Services", 250.00, 320, 80000.00, "up", "star"),
            ("Prescription Medication A", "Pharmacy", 45.00, 1400, 63000.00, "up", "cash-cow"),
            ("Diagnostic MRI Scanning", "Diagnostics", 800.00, 65, 52000.00, "up", "star"),
            ("Pediatric Consultation", "Clinical Services", 120.00, 280, 33600.00, "stable", "cash-cow"),
            ("Emergency Care Visit", "Emergency", 450.00, 90, 40500.00, "down", "question-mark"),
        ],
        "sales_types": ["Insurance Claim Payout", "Patient Copay", "Pharmacy Counter", "Corporate Wellness"],
        "base_daily_revenue": 2200,
        "expenses": {"Pharmaceutical Supplies": 2500, "Medical Clinic Rent": 4200, "Doctors & Nurses Payroll": 9200, "Medical Waste": 350}
    }
}


@data_bp.route("/presets", methods=["GET"])
def list_presets():
    """GET /api/data/presets — return available industry presets."""
    result = []
    for key, val in PRESETS_DATA.items():
        result.append({"key": key, "name": val["name"]})
    return jsonify(result)


@data_bp.route("/preset", methods=["POST"])
def switch_preset():
    """POST /api/data/preset — reseed DB with specific industry dataset."""
    body = request.get_json(silent=True) or {}
    preset_key = body.get("preset", "retail")
    if preset_key not in PRESETS_DATA:
        return jsonify({"error": f"Invalid preset '{preset_key}'"}), 400

    preset = PRESETS_DATA[preset_key]
    random.seed(42)

    # 1. Clear existing data
    execute("DELETE FROM transactions")
    execute("DELETE FROM products")

    # 2. Seed products
    p_rows = []
    for name, cat, price, units, rev, trend, cluster in preset["products"]:
        p_rows.append((str(uuid.uuid4()), name, cat, price, units, rev, trend, cluster))
    execute_many(
        "INSERT INTO products (id, name, category, price, units_sold, revenue, trend, cluster) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        p_rows
    )

    # 3. Seed 365 days of transactions
    days = 365
    today = date.today()
    start = today - timedelta(days=days)
    t_rows = []

    for idx in range(days + 1):
        d = start + timedelta(days=idx)
        is_weekend = d.weekday() >= 5
        multiplier = 1.35 if is_weekend else 1.0
        noise = random.uniform(0.85, 1.15)
        daily_total = round(preset["base_daily_revenue"] * (1 + 0.0008 * idx) * multiplier * noise, 2)

        # Split daily revenue into 3-6 transactions
        orders = random.randint(3, 6)
        cuts = sorted(random.uniform(0, 1) for _ in range(orders - 1))
        bounds = [0.0, *cuts, 1.0]
        for j in range(orders):
            amt = round(daily_total * (bounds[j + 1] - bounds[j]), 2)
            if amt > 0:
                t_rows.append((d.isoformat(), random.choice(preset["sales_types"]), "Sales", amt, "income"))

    # Recurring monthly expenses
    cur = date(start.year, start.month, 1)
    while cur <= today:
        for exp_name, exp_amount in preset["expenses"].items():
            ed = cur.replace(day=min(5, 28))
            if start <= ed <= today:
                jitter = round(exp_amount * random.uniform(0.95, 1.05), 2)
                t_rows.append((ed.isoformat(), f"{exp_name} payment", exp_name, jitter, "expense"))
        cur = (cur.replace(day=28) + timedelta(days=7)).replace(day=1)

    # Occasional high-value expense anomaly
    anomaly_date = (start + timedelta(days=200)).isoformat()
    t_rows.append((anomaly_date, "Emergency System Upgrade", "Equipment", 7500.00, "expense"))

    execute_many(
        "INSERT INTO transactions (date, description, category, amount, type) "
        "VALUES (%s, %s, %s, %s, %s)",
        t_rows
    )

    # Emit realtime notification to refresh UI
    emit_change("transactions")
    emit_change("products")

    return jsonify({
        "success": True,
        "preset": preset_key,
        "name": preset["name"],
        "transactions_inserted": len(t_rows),
        "products_inserted": len(p_rows)
    })
