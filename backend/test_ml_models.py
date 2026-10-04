import unittest
from unittest.mock import patch

from python.clustering import run_kmeans_clustering
from python.forecast import _prediction_error_metrics, _conformal_interval_width, run_forecast_model
from python.pricing_model import run_pricing_model


class ForecastTests(unittest.TestCase):
    def test_error_metrics_are_out_of_sample_metrics(self):
        metrics = _prediction_error_metrics([10, 20], [8, 24])
        self.assertEqual(metrics["mae"], 3.0)
        self.assertAlmostEqual(metrics["rmse"], 10 ** 0.5, places=2)
        self.assertEqual(metrics["mape"], 20.0)

    def test_conformal_interval_requires_finite_sample_support(self):
        self.assertIsNone(_conformal_interval_width([1.0] * 4))
        self.assertEqual(_conformal_interval_width([1.0] * 19), 1.0)

    def test_fallback_forecast_reports_errors_and_no_unsupported_interval(self):
        payload = {
            "months": ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"],
            "revenues": [100, 110, 120, 130, 140, 150],
            "expenses": [40, 42, 44, 46, 48, 50],
            "future_count": 1,
        }
        with patch("python.forecast.PROPHET_AVAILABLE", False):
            result = run_forecast_model(payload)
        self.assertEqual(result["metrics"]["revenue"]["mae"], 0.0)
        self.assertIsNone(result["forecasts"][0]["predicted_revenue_lower"])


class SegmentationTests(unittest.TestCase):
    def test_all_segments_include_their_feature_basis(self):
        products = [
            {"id": "a", "trend": "up", "units_sold": 20},
            {"id": "b", "trend": "stable", "units_sold": 20},
            {"id": "c", "trend": "up", "units_sold": 5},
            {"id": "d", "trend": "down", "units_sold": 5},
        ]
        result = run_kmeans_clustering({"products": products})
        labels = {item["id"]: item["cluster"] for item in result["clusters"]}
        self.assertEqual(labels, {
            "a": "star",
            "b": "cash-cow",
            "c": "question-mark",
            "d": "underperformer",
        })
        self.assertTrue(all(item["features"] for item in result["clusters"]))


class PricingTests(unittest.TestCase):
    def test_elasticity_drives_price_test_and_explanation(self):
        observations = [
            {"price": 10, "units_sold": 3000, "period_days": 30},
            {"price": 20, "units_sold": 3000 / (2 ** 1.5), "period_days": 30},
            {"price": 40, "units_sold": 3000 / (4 ** 1.5), "period_days": 30},
        ]
        result = run_pricing_model({"products": [{
            "id": "p1", "name": "Item", "price": 20, "observations": observations,
        }]})
        suggestion = result["suggestions"][0]
        self.assertAlmostEqual(suggestion["priceElasticity"], -1.5, places=2)
        self.assertEqual(suggestion["suggestedPrice"], 19.0)
        self.assertIn("controlled price test", suggestion["reason"])

    def test_pricing_abstains_without_observations(self):
        result = run_pricing_model({"products": [{
            "id": "p2", "name": "New item", "price": 10, "observations": [],
        }]})
        self.assertFalse(result["suggestions"])
        self.assertIn("three dated", result["skipped"][0]["reason"])


if __name__ == "__main__":
    unittest.main()
