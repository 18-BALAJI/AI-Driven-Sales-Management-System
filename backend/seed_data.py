"""
Seed realistic transaction history so the dashboard charts have data:
  - Revenue & Profit Trend (monthly income vs expense)
  - Growth Analysis & Forecasting (daily sales + projection)
  - Sales Forecasting page (monthly Prophet/linear forecast)

Generates ~12 months of daily sales (income) with weekday/weekend and seasonal
patterns plus recurring business expenses (rent, payroll, supplies, utilities).

Run:  python backend/seed_data.py --demo --company-id demo-company
    Add --keep to preserve existing transactions and products for that company.
"""
import argparse
import os
import sys
import random
import uuid
from datetime import date, timedelta
from werkzeug.security import generate_password_hash

sys.path.insert(0, os.path.dirname(__file__))
import db  # noqa: E402

random.seed(42)

DAYS = 365
TODAY = date.today()
START = TODAY - timedelta(days=DAYS)

SALES_DESCRIPTIONS = [
    "Counter sales", "Online order", "Catering order", "Walk-in sales",
    "Card payment batch", "Mobile app order",
]
EXPENSE_PLAN = {
    "Rent": (1, 3500),         # 1st of month
    "Utilities": (5, 600),      # 5th of month
}


def daily_income_total(d: date, idx: int) -> float:
    base = 1500
    trend = 1 + 0.0008 * idx                 # gentle year-long growth
    weekend = 1.35 if d.weekday() >= 5 else 1.0
    december = 1.25 if d.month == 12 else 1.0
    noise = random.uniform(0.85, 1.15)
    return round(base * trend * weekend * december * noise, 2)


def build_rows():
    rows = []  # (date, description, category, amount, type)

    # ── Daily sales (income), split into a few realistic "orders" ────────────
    for idx in range(DAYS + 1):
        d = START + timedelta(days=idx)
        total = daily_income_total(d, idx)
        n_orders = random.randint(3, 6)
        # Split the day's total across n orders.
        cuts = sorted(random.uniform(0, 1) for _ in range(n_orders - 1))
        bounds = [0.0, *cuts, 1.0]
        for j in range(n_orders):
            amt = round(total * (bounds[j + 1] - bounds[j]), 2)
            if amt <= 0:
                continue
            rows.append((d.isoformat(), random.choice(SALES_DESCRIPTIONS),
                         "Sales", amt, "income"))

    # ── Recurring monthly expenses ───────────────────────────────────────────
    cur = date(START.year, START.month, 1)
    while cur <= TODAY:
        for label, (day, amount) in EXPENSE_PLAN.items():
            try:
                ed = cur.replace(day=day)
            except ValueError:
                continue
            if START <= ed <= TODAY:
                jitter = round(amount * random.uniform(0.97, 1.03), 2)
                rows.append((ed.isoformat(), f"{label} — monthly", label, jitter, "expense"))
        # Payroll on the 1st and 15th
        for pay_day in (1, 15):
            try:
                pd = cur.replace(day=pay_day)
            except ValueError:
                continue
            if START <= pd <= TODAY:
                rows.append((pd.isoformat(), "Staff payroll", "Payroll", 4000.00, "expense"))
        # advance one month
        cur = (cur.replace(day=28) + timedelta(days=7)).replace(day=1)

    # ── Weekly supply purchases (every Monday) + occasional equipment ────────
    d = START
    while d <= TODAY:
        if d.weekday() == 0:  # Monday
            rows.append((d.isoformat(), "Inventory restock", "Supplies",
                         round(random.uniform(650, 950), 2), "expense"))
        d += timedelta(days=1)
    # A couple of one-off equipment expenses (creates a realistic anomaly)
    rows.append(((START + timedelta(days=210)).isoformat(),
                 "New espresso machine", "Equipment", 8200.00, "expense"))
    rows.append(((START + timedelta(days=300)).isoformat(),
                 "POS system upgrade", "Equipment", 2400.00, "expense"))

    return rows


PRODUCTS_DATA = [
    ("iPhone 15 Pro Max", "Electronics", 1100.00, 140, 154000.00, "up", "star"),
    ("Samsung Galaxy S24", "Electronics", 950.00, 95, 90250.00, "up", "star"),
    ("Casio G-Shock Watch", "Accessories", 120.00, 310, 37200.00, "up", "cash-cow"),
    ("MacBook Pro M3", "Computers", 1999.00, 45, 89955.00, "up", "star"),
    ("Sony WH-1000XM5 Headphones", "Audio", 349.00, 180, 62820.00, "up", "cash-cow"),
    ("Logitech MX Master 3S", "Accessories", 99.00, 420, 41580.00, "up", "cash-cow"),
    ("Dell UltraSharp 27 Monitor", "Electronics", 450.00, 65, 29250.00, "stable", "question-mark"),
    ("Mechanical Gaming Keyboard", "Accessories", 85.00, 210, 17850.00, "down", "question-mark"),
    ("USB-C Fast Charger 65W", "Accessories", 29.00, 650, 18850.00, "up", "cash-cow"),
    ("Ergonomic Office Chair", "Furniture", 299.00, 28, 8372.00, "down", "underperformer"),
    ("Wireless Earbuds Pro", "Audio", 149.00, 115, 17135.00, "stable", "question-mark"),
    ("Desk Mat XL", "Accessories", 19.00, 340, 6460.00, "down", "underperformer"),
]


def seed_demo_users(company_id: str):
    accounts = [
        ("Business Owner", "DEMO_OWNER_EMAIL", "DEMO_OWNER_PASSWORD", "DEMO_OWNER_PHONE", "owner"),
        ("Shop Manager", "DEMO_MANAGER_EMAIL", "DEMO_MANAGER_PASSWORD", "DEMO_MANAGER_PHONE", "manager"),
        ("Financial Analyst", "DEMO_ANALYST_EMAIL", "DEMO_ANALYST_PASSWORD", "DEMO_ANALYST_PHONE", "analyst"),
    ]
    if not os.environ.get("DEMO_OWNER_EMAIL") or not os.environ.get("DEMO_OWNER_PASSWORD"):
        raise RuntimeError("Set DEMO_OWNER_EMAIL and DEMO_OWNER_PASSWORD before running the demo seed command.")

    for name, email_key, password_key, phone_key, role in accounts:
        email = (os.environ.get(email_key) or "").strip().lower()
        password = os.environ.get(password_key) or ""
        phone = (os.environ.get(phone_key) or "").strip() or None
        if not email and not password:
            continue
        if not email or not password:
            raise RuntimeError(f"Both {email_key} and {password_key} are required when seeding the {role} account.")
        existing = db.query("SELECT id, company_id FROM users WHERE email = %s", (email,))
        if existing:
            if existing[0]["company_id"] != company_id:
                raise RuntimeError(f"Demo email {email} already belongs to another company; refusing to move it.")
            continue
        db.execute(
            "INSERT INTO users (id, name, email, phone, password_hash, role, company_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (str(uuid.uuid4()), name, email, phone, generate_password_hash(password), role, company_id),
        )
    print("Seeded configured demo accounts (passwords were not displayed).")


def seed_products(clear=True, company_id="demo-company"):
    if clear:
        db.execute("DELETE FROM products WHERE company_id = %s", (company_id,))
        print("Cleared existing products for the selected company.")
    
    import uuid
    p_rows = []
    for name, cat, price, units, rev, trend, cluster in PRODUCTS_DATA:
        p_rows.append((str(uuid.uuid4()), name, cat, price, units, rev, trend, cluster, company_id))
        
    db.execute_many(
        "INSERT INTO products (id, name, category, price, units_sold, revenue, trend, cluster, company_id) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        p_rows
    )
    print(f"Inserted {len(p_rows)} realistic products.")


def seed_demo_data(company_id: str, keep: bool = False):
    random.seed(42)
    rows = build_rows()
    seed_demo_users(company_id)

    if not keep:
        db.execute("DELETE FROM transactions WHERE company_id = %s", (company_id,))
        print("Cleared existing transactions for the selected company.")

    transaction_rows = [(str(uuid.uuid4()), *row, company_id) for row in rows]
    db.execute_many(
        "INSERT INTO transactions (id, date, description, category, amount, type, company_id) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        transaction_rows,
    )
    seed_products(clear=not keep, company_id=company_id)

    income = sum(row[3] for row in rows if row[4] == "income")
    expense = sum(row[3] for row in rows if row[4] == "expense")
    print(f"Seeded {len(rows)} transactions and {len(PRODUCTS_DATA)} products for {company_id}.")
    print(f"Date range: {START} through {TODAY}; net: ${income - expense:,.2f}")
    return {"transactions": len(rows), "products": len(PRODUCTS_DATA), "company_id": company_id}


def main():
    parser = argparse.ArgumentParser(description="Explicitly seed Profit Navigator demo data into the configured database.")
    parser.add_argument("--demo", action="store_true", help="seed demo accounts, products, and transactions")
    parser.add_argument("--company-id", default=os.environ.get("SEED_COMPANY_ID", "demo-company"))
    parser.add_argument("--keep", action="store_true", help="append records rather than replace this company's transactions/products")
    args = parser.parse_args()
    if not args.demo:
        parser.error("pass --demo to confirm writing demo data to the configured database")

    company_id = args.company_id.strip()
    if not company_id:
        parser.error("--company-id must not be empty")

    seed_demo_data(company_id, keep=args.keep)


if __name__ == "__main__":
    main()

