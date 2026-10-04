"""Explainable product segmentation using trend signal and relative unit sales."""

import json
import sys


def segment_products(products: list[dict]) -> list[dict]:
    if not products:
        return []

    average_units = sum(max(0, float(product.get("units_sold", 0))) for product in products) / len(products)
    results = []

    for product in products:
        trend = str(product.get("trend", "")).lower()
        if trend not in {"up", "stable", "down"}:
            results.append({
                "id": product["id"],
                "cluster": "unclassified",
                "explanation": "A recognized sales trend (up, stable, or down) is required for segmentation.",
            })
            continue

        units = max(0, float(product.get("units_sold", 0)))
        relative_sales_index = units / average_units if average_units > 0 else 0
        high_relative_sales = relative_sales_index > 1
        high_growth_signal = trend == "up"

        if high_growth_signal and high_relative_sales:
            segment = "star"
        elif not high_growth_signal and high_relative_sales:
            segment = "cash-cow"
        elif high_growth_signal:
            segment = "question-mark"
        else:
            segment = "underperformer"

        results.append({
            "id": product["id"],
            "cluster": segment,
            "explanation": (
                f"Trend signal is {trend}; unit sales are {relative_sales_index:.2f}x the catalog average. "
                "This is a catalog-relative proxy, not market-wide market share or growth."
            ),
            "features": {
                "trend_signal": trend,
                "units_sold": units,
                "catalog_average_units": round(average_units, 2),
                "relative_sales_index": round(relative_sales_index, 3),
            },
        })

    return results


def run_kmeans_clustering(payload: dict) -> dict:
    """Keep the existing function name for route compatibility."""
    segments = segment_products(payload.get("products", []))
    return {
        "clusters": segments,
        "model_used": "trend_share_proxy",
        "segmentation_method": "sales_trend_x_catalog_relative_units",
    }


def main():
    raw = sys.stdin.read()
    if raw.strip():
        print(json.dumps(run_kmeans_clustering(json.loads(raw))))


if __name__ == "__main__":
    main()