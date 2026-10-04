"""Opt-in end-to-end checks against a dedicated MySQL test database.

Run with RUN_MYSQL_INTEGRATION=1 and DB_DRIVER=mysql. These tests create and
remove rows in one random company; never point them at a production database.
"""
import json
import os
import sys
import unittest
import uuid
from unittest.mock import Mock, patch


class MySQLWorkflowIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get("RUN_MYSQL_INTEGRATION") != "1":
            raise unittest.SkipTest("Set RUN_MYSQL_INTEGRATION=1 to run against MySQL.")
        if os.environ.get("DB_DRIVER", "mysql").lower() != "mysql":
            raise RuntimeError("MySQL integration tests require DB_DRIVER=mysql; SQLite is not accepted.")

        sys.path.insert(0, os.path.dirname(__file__))
        import db
        from app import app

        selected_database = db.query("SELECT DATABASE() AS database_name")[0]["database_name"]
        if not selected_database.endswith(("_test", "_testing")):
            raise RuntimeError(
                f"Refusing MySQL integration writes to non-test database '{selected_database}'. "
                "Use a database name ending in _test or _testing."
            )

        cls.db = db
        cls.client = app.test_client()
        cls.company_id = f"mysql-test-{uuid.uuid4()}"
        cls.owner_email = f"{uuid.uuid4()}@example.test"
        cls.owner_password = uuid.uuid4().hex + "Aa1!"
        cls.analyst_email = f"{uuid.uuid4()}@example.test"
        cls.analyst_password = uuid.uuid4().hex + "Aa1!"
        cls.owner_token = None
        cls.analyst_token = None
        cls.test_product_ids = []
        cls.test_transaction_ids = []

        cls.addClassCleanup(cls._cleanup_company)
        with patch.dict(os.environ, {
            "DEMO_OWNER_EMAIL": cls.owner_email,
            "DEMO_OWNER_PASSWORD": cls.owner_password,
        }):
            from seed_data import seed_demo_data
            seed_demo_data(cls.company_id)

        response = cls.client.post("/api/auth/login", json={
            "email": cls.owner_email,
            "password": cls.owner_password,
        })
        if response.status_code != 200:
            raise AssertionError(f"Seeded owner login failed: {response.status_code} {response.get_json()}")
        cls.owner_token = response.get_json()["token"]

        analyst_id = str(uuid.uuid4())
        from werkzeug.security import generate_password_hash
        cls.db.execute(
            "INSERT INTO users (id, name, email, password_hash, role, company_id) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (analyst_id, "MySQL Test Analyst", cls.analyst_email,
             generate_password_hash(cls.analyst_password), "analyst", cls.company_id),
        )
        response = cls.client.post("/api/auth/login", json={
            "email": cls.analyst_email,
            "password": cls.analyst_password,
        })
        if response.status_code != 200:
            raise AssertionError(f"Test analyst login failed: {response.status_code} {response.get_json()}")
        cls.analyst_token = response.get_json()["token"]

    @classmethod
    def _cleanup_company(cls):
        if not getattr(cls, "company_id", None) or not getattr(cls, "db", None):
            return
        for table in (
            "pricing_recommendations", "product_price_observations", "forecasts",
            "transactions", "products", "users",
        ):
            cls.db.execute(f"DELETE FROM {table} WHERE company_id = %s", (cls.company_id,))

    def test_mysql_application_workflows(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.get_json()["database"], "MySQL")

        migration_rows = self.db.query(
            "SELECT version FROM schema_migrations WHERE version IN (%s, %s)",
            ("001_initial_schema", "002_company_and_ml_columns"),
        )
        self.assertEqual(len(migration_rows), 2)

        headers = {"Authorization": f"Bearer {self.owner_token}"}
        analyst_headers = {"Authorization": f"Bearer {self.analyst_token}"}
        self.assertEqual(self.client.get("/api/auth/me", headers=headers).status_code, 200)
        self.assertEqual(self.client.post("/api/forecast", json={}).status_code, 401)

        context_response = self.client.get("/api/insights/context", headers=headers)
        self.assertEqual(context_response.status_code, 200, context_response.get_json())
        context = context_response.get_json()
        self.assertGreater(context["metrics"]["revenue"], 0)
        self.assertEqual([source["id"] for source in context["sources"]], ["S1", "S2", "S3", "S4"])

        insight_response = Mock()
        insight_response.json.return_value = {"choices": [{"message": {"content": json.dumps({
            "executive_summary": {"text": "Revenue exceeds recorded expenses.", "source_ids": ["S1"]},
            "insights": [{
                "title": "Positive net result", "finding": "Recorded revenue exceeds expenses.",
                "explanation": "This compares the transaction ledger totals.",
                "recommended_action": "Review recent expense categories.", "source_ids": ["S1", "S4"],
            }],
        })}}]}
        insight_response.raise_for_status.return_value = None
        with patch.dict(os.environ, {"GROQ_API_KEY": "mysql-integration-test-key"}), \
                patch("services.insights.requests.post", return_value=insight_response):
            generated = self.client.post("/api/insights/executive", json={}, headers=headers)
        self.assertEqual(generated.status_code, 200, generated.get_json())
        self.assertEqual(generated.get_json()["executive_summary"]["source_ids"], ["S1"])

        session_id = f"mysql-ai-{uuid.uuid4()}"
        self.assertEqual(self.client.post("/api/chat/save", json={
            "role": "user", "content": "What is my revenue?", "session_id": session_id,
        }, headers=headers).status_code, 201)

        class FakeStream:
            status_code = 200
            text = ""

            @staticmethod
            def iter_lines():
                chunk = {"choices": [{"delta": {"content": "Revenue is recorded in [S1]."}}]}
                return [f"data: {json.dumps(chunk)}".encode(), b"data: [DONE]"]

        with patch.dict(os.environ, {"GROQ_API_KEY": "mysql-integration-test-key"}), \
                patch("routes.chat_routes.requests.post", return_value=FakeStream()):
            answer = self.client.post("/api/chat", json={
                "messages": [{"role": "user", "content": "What is my revenue?"}],
                "session_id": session_id,
            }, headers=headers)
        self.assertEqual(answer.status_code, 200)
        self.assertIn("[S1]", answer.get_data(as_text=True))
        history = self.client.get(
            f"/api/chat/history?session_id={session_id}", headers=headers,
        ).get_json()
        self.assertEqual([message["role"] for message in history], ["user", "assistant"])

        products_response = self.client.get("/api/products", headers=headers)
        transactions_response = self.client.get("/api/transactions", headers=headers)
        self.assertEqual(products_response.status_code, 200)
        self.assertEqual(transactions_response.status_code, 200)
        self.assertGreaterEqual(len(products_response.get_json()), 12)
        self.assertGreater(len(transactions_response.get_json()), 1000)

        transaction = {
            "date": "2026-09-20", "description": "MySQL CRUD integration",
            "category": "Test", "amount": 123.45, "type": "income",
        }
        response = self.client.post("/api/transactions", json=transaction, headers=headers)
        self.assertEqual(response.status_code, 201)
        transaction_id = response.get_json()["id"]
        self.test_transaction_ids.append(transaction_id)
        response = self.client.put(
            f"/api/transactions/{transaction_id}", json={"amount": 222.25}, headers=headers,
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.delete(f"/api/transactions/{transaction_id}", headers=headers)
        self.assertEqual(response.status_code, 200)

        product = {
            "name": "MySQL CRUD integration product", "category": "Test",
            "price": 25, "units_sold": 4, "revenue": 100,
        }
        response = self.client.post("/api/products", json=product, headers=headers)
        self.assertEqual(response.status_code, 201)
        product_id = response.get_json()["id"]
        self.test_product_ids.append(product_id)
        response = self.client.put(
            f"/api/products/{product_id}", json={"price": 30}, headers=headers,
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.delete(f"/api/products/{product_id}", headers=headers)
        self.assertEqual(response.status_code, 200)

        forecast = self.client.post("/api/forecast", json={}, headers=headers)
        self.assertEqual(forecast.status_code, 200, forecast.get_json())
        forecast_body = forecast.get_json()
        self.assertTrue(forecast_body["forecasts"])
        self.assertIn("mae", forecast_body["metrics"]["revenue"])

        anomalies = self.client.post("/api/anomaly", json={}, headers=headers)
        self.assertEqual(anomalies.status_code, 200, anomalies.get_json())
        self.assertEqual(anomalies.get_json()["model_used"], "isolation_forest")

        segmentation = self.client.post("/api/clustering", json={}, headers=headers)
        self.assertEqual(segmentation.status_code, 200, segmentation.get_json())
        self.assertEqual(segmentation.get_json()["model_used"], "trend_share_proxy")
        self.assertTrue(all(item.get("explanation") for item in segmentation.get_json()["clusters"]))

        seeded_product = next(
            item for item in products_response.get_json() if item["name"] == "iPhone 15 Pro Max"
        )
        observations = [
            (10, 3000, "2025-01-01", "2025-01-30"),
            (20, 1061, "2025-02-01", "2025-03-02"),
            (40, 375, "2025-03-03", "2025-04-01"),
        ]
        for price, units_sold, period_start, period_end in observations:
            response = self.client.post("/api/pricing/observations", json={
                "product_id": seeded_product["id"], "price": price,
                "units_sold": units_sold, "period_start": period_start, "period_end": period_end,
            }, headers=headers)
            self.assertEqual(response.status_code, 201, response.get_json())

        pricing = self.client.post("/api/pricing/generate", json={}, headers=headers)
        self.assertEqual(pricing.status_code, 200, pricing.get_json())
        suggestions = pricing.get_json()["suggestions"]
        self.assertTrue(suggestions)
        self.assertIsNotNone(suggestions[0]["priceElasticity"])
        self.assertIsNotNone(suggestions[0]["sampleCount"])

        recommendation_id = suggestions[0]["id"]
        approved = self.client.post(
            f"/api/pricing/{recommendation_id}/approve", json={}, headers=analyst_headers,
        )
        self.assertEqual(approved.status_code, 200, approved.get_json())


if __name__ == "__main__":
    unittest.main()
