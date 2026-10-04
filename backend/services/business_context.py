"""Company-scoped business facts and traceable source records for AI features."""
from collections import defaultdict
from datetime import date, datetime, timezone

from db import query


def _as_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def build_business_context(company_id: str) -> dict:
    transactions = query(
        "SELECT date, description, category, amount, type "
        "FROM transactions WHERE company_id = %s ORDER BY date ASC",
        (company_id,),
    )
    products = query(
        "SELECT id, name, category, price, units_sold, revenue, trend, cluster "
        "FROM products WHERE company_id = %s ORDER BY revenue DESC",
        (company_id,),
    )

    total_income = 0.0
    total_expenses = 0.0
    expense_by_category = defaultdict(float)
    monthly = defaultdict(lambda: {"revenue": 0.0, "expenses": 0.0, "orders": 0})
    for transaction in transactions:
        amount = float(transaction["amount"])
        period = _as_date(transaction["date"]).strftime("%Y-%m")
        if transaction["type"] == "income":
            total_income += amount
            monthly[period]["revenue"] += amount
            monthly[period]["orders"] += 1
        else:
            total_expenses += amount
            monthly[period]["expenses"] += amount
            expense_by_category[transaction["category"]] += amount

    period_keys = sorted(monthly)
    recent_periods = period_keys[-6:]
    monthly_facts = [
        {
            "period": period,
            "revenue": round(monthly[period]["revenue"], 2),
            "expenses": round(monthly[period]["expenses"], 2),
            "net": round(monthly[period]["revenue"] - monthly[period]["expenses"], 2),
            "orders": monthly[period]["orders"],
        }
        for period in recent_periods
    ]
    recent_change_pct = None
    if len(monthly_facts) >= 2 and monthly_facts[-2]["revenue"]:
        recent_change_pct = round(
            (monthly_facts[-1]["revenue"] / monthly_facts[-2]["revenue"] - 1) * 100,
            1,
        )

    net_profit = total_income - total_expenses
    margin_pct = round(net_profit / total_income * 100, 1) if total_income else None
    financial_values = {
        "transaction_count": len(transactions),
        "revenue": round(total_income, 2),
        "expenses": round(total_expenses, 2),
        "net_profit": round(net_profit, 2),
        "profit_margin_pct": margin_pct,
    }
    sources = [
        {
            "id": "S1",
            "label": "Transaction ledger, all available dates",
            "description": "Income, expenses, net profit and margin calculated from this company's recorded transactions.",
            "values": financial_values,
        },
        {
            "id": "S2",
            "label": "Monthly transaction totals",
            "description": "Revenue, expense and order totals for the six most recent months with transaction activity.",
            "values": {"months": monthly_facts, "latest_month_revenue_change_pct": recent_change_pct},
        },
        {
            "id": "S3",
            "label": "Product catalog and sales totals",
            "description": "Current catalog price, recorded units sold, revenue, trend and segment labels.",
            "values": {
                "product_count": len(products),
                "top_products": [
                    {
                        "name": product["name"],
                        "category": product["category"],
                        "price": float(product["price"]),
                        "units_sold": int(product["units_sold"]),
                        "revenue": float(product["revenue"]),
                        "trend": product["trend"],
                        "segment": product["cluster"],
                    }
                    for product in products[:8]
                ],
            },
        },
        {
            "id": "S4",
            "label": "Expense categories",
            "description": "Recorded expenses grouped by transaction category across all available dates.",
            "values": {
                "categories": [
                    {"category": category, "amount": round(amount, 2)}
                    for category, amount in sorted(expense_by_category.items(), key=lambda item: item[1], reverse=True)[:8]
                ]
            },
        },
    ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "metrics": financial_values,
        "monthly": monthly_facts,
        "products": sources[2]["values"],
        "sources": sources,
    }


def format_context_for_prompt(context: dict) -> str:
    """Serialize only backend-computed facts and named source IDs for grounding."""
    import json

    return json.dumps({"sources": context["sources"]}, ensure_ascii=False, separators=(",", ":"))
