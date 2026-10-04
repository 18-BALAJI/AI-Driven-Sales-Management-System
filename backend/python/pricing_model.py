"""Transparent pricing recommendations based on observed price/quantity periods."""

import json
import sys

import numpy as np


def estimate_price_elasticity(observations: list[dict]) -> dict | None:
    """Fit log(quantity/day) against log(price); require repeated observations."""
    valid = [
        row for row in observations
        if float(row.get("price", 0)) > 0
        and float(row.get("units_sold", 0)) > 0
        and float(row.get("period_days", 0)) > 0
    ]
    if len(valid) < 3 or len({float(row["price"]) for row in valid}) < 2:
        return None

    prices = np.asarray([float(row["price"]) for row in valid])
    units_per_day = np.asarray([
        float(row["units_sold"]) / float(row["period_days"])
        for row in valid
    ])
    log_price = np.log(prices)
    log_demand = np.log(units_per_day)
    elasticity, intercept = np.polyfit(log_price, log_demand, 1)
    predicted = intercept + elasticity * log_price
    residual_sum = float(np.sum((log_demand - predicted) ** 2))
    total_sum = float(np.sum((log_demand - np.mean(log_demand)) ** 2))
    fit_r2 = 1 - residual_sum / total_sum if total_sum > 0 else 0.0

    return {
        "elasticity": float(elasticity),
        "fit_r2": float(fit_r2),
        "sample_count": len(valid),
        "latest_units_per_day": float(units_per_day[-1]),
    }


def recommend_price(product: dict) -> tuple[dict | None, str | None]:
    estimate = estimate_price_elasticity(product.get("observations", []))
    if estimate is None:
        return None, "Record at least three dated price/quantity periods at two or more prices."
    if estimate["elasticity"] >= 0:
        return None, "Observed demand does not decrease as price rises; a price recommendation is not supported."
    if estimate["fit_r2"] < 0.2:
        return None, "Observed price/quantity data has weak log-log fit; collect more comparable periods."

    current_price = float(product["price"])
    monthly_units = estimate["latest_units_per_day"] * 30
    baseline_revenue = current_price * monthly_units
    candidates = []
    for change in (-0.05, 0.05):
        candidate_price = current_price * (1 + change)
        candidate_units = monthly_units * (candidate_price / current_price) ** estimate["elasticity"]
        candidates.append((candidate_price * candidate_units, candidate_price, candidate_units))

    projected_revenue, suggested_price, projected_units = max(candidates)
    if projected_revenue <= baseline_revenue * 1.005:
        return None, "The estimated elasticity does not support a material revenue improvement within a 5% test."

    revenue_change_pct = (projected_revenue / baseline_revenue - 1) * 100
    elasticity = estimate["elasticity"]
    reason = (
        f"Observed own-price elasticity is {elasticity:.2f} from {estimate['sample_count']} periods "
        f"(log-log fit R2 {estimate['fit_r2']:.2f}). A 5% test change estimates "
        f"{revenue_change_pct:+.1f}% monthly revenue; validate with a controlled price test."
    )
    category = "elastic" if abs(elasticity) > 1 else "inelastic"
    return {
        "id": product["id"],
        "productId": product["id"],
        "product": product["name"],
        "currentPrice": current_price,
        "suggestedPrice": round(suggested_price, 2),
        "priceElasticity": round(elasticity, 3),
        "elasticityCategory": category,
        "projectedUnits": round(projected_units),
        "projectedRevenue": round(projected_revenue, 2),
        "expectedImpact": f"{revenue_change_pct:+.1f}% estimated monthly revenue",
        "reason": reason,
        "confidence": round(max(0.0, min(1.0, estimate["fit_r2"])) * 100),
        "modelUsed": "observed_log_log_elasticity",
        "explanation": {
            "method": "ordinary_least_squares_log_log",
            "formula": "ln(units_per_day) = intercept + elasticity * ln(price)",
            "observations": estimate["sample_count"],
            "fit_r2": round(estimate["fit_r2"], 4),
            "monthly_baseline_units": round(monthly_units),
            "monthly_baseline_revenue": round(baseline_revenue, 2),
            "projected_monthly_units": round(projected_units),
            "projected_monthly_revenue": round(projected_revenue, 2),
            "caveat": "Observational estimate; seasonality, promotions, and competitor changes can confound elasticity.",
        },
    }, None


def run_pricing_model(payload: dict) -> dict:
    suggestions = []
    skipped = []
    for product in payload.get("products", []):
        suggestion, reason = recommend_price(product)
        if suggestion:
            suggestions.append(suggestion)
        else:
            skipped.append({"productId": product["id"], "product": product["name"], "reason": reason})
    return {
        "suggestions": suggestions,
        "skipped": skipped,
        "model_used": "observed_log_log_elasticity",
    }


def main():
    raw = sys.stdin.read()
    if raw.strip():
        print(json.dumps(run_pricing_model(json.loads(raw))))


if __name__ == "__main__":
    main()