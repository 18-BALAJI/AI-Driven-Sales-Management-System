import json
import os
import sys
import unittest
import uuid
from unittest.mock import Mock, patch

sys.path.insert(0, os.path.dirname(__file__))


class AIBusinessContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import db
        from app import app
        from routes.auth_routes import _make_token

        cls.db = db
        cls.client = app.test_client()
        cls.company_id = f"ai-test-{uuid.uuid4()}"
        cls.session_id = f"session-{uuid.uuid4()}"
        user_id = str(uuid.uuid4())
        cls.db.execute(
            "INSERT INTO users (id, name, email, password_hash, role, company_id) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (user_id, "AI Test Owner", f"{user_id}@example.test", "unused", "owner", cls.company_id),
        )
        cls.headers = {"Authorization": f"Bearer {_make_token(user_id)}"}

        for transaction_id, company_id, amount, category in (
            ("ai-context-tx-1", cls.company_id, 500, "Sales"),
            ("ai-context-tx-2", cls.company_id, 100, "Rent"),
            ("ai-context-tx-foreign", "other-company", 999999, "Confidential"),
        ):
            cls.db.execute(
                "INSERT INTO transactions (id, date, description, category, amount, type, company_id) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (transaction_id, "2026-09-01", "AI context fixture", category, amount,
                 "income" if category == "Sales" else "expense", company_id),
            )

    @classmethod
    def tearDownClass(cls):
        cls.db.execute("DELETE FROM chat_messages WHERE session_id = %s", (cls.session_id,))
        cls.db.execute("DELETE FROM transactions WHERE id LIKE %s", ("ai-context-tx-%",))
        cls.db.execute("DELETE FROM users WHERE company_id = %s", (cls.company_id,))

    def test_business_context_is_company_scoped_and_cited(self):
        response = self.client.get("/api/insights/context", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["metrics"]["revenue"], 500)
        self.assertEqual(payload["metrics"]["expenses"], 100)
        self.assertEqual([source["id"] for source in payload["sources"]], ["S1", "S2", "S3", "S4"])
        self.assertNotIn("Confidential", json.dumps(payload))

    def test_generated_insights_filter_unknown_citation_ids(self):
        provider_body = {
            "executive_summary": {"text": "Net result is positive.", "source_ids": ["S1", "S999"]},
            "insights": [{
                "title": "Expense ratio", "finding": "Expenses are recorded.",
                "explanation": "The ledger shows expense transactions.",
                "recommended_action": "Review expense categories.", "source_ids": ["S1", "S4", "S999"],
            }],
        }
        response = Mock()
        response.json.return_value = {"choices": [{"message": {"content": json.dumps(provider_body)}}]}
        response.raise_for_status.return_value = None
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key", "GROQ_MODEL": "test-model"}), \
                patch("services.insights.requests.post", return_value=response):
            result = self.client.post("/api/insights/executive", headers=self.headers, json={})
        self.assertEqual(result.status_code, 200, result.get_json())
        data = result.get_json()
        self.assertEqual(data["executive_summary"]["source_ids"], ["S1"])
        self.assertEqual(data["insights"][0]["source_ids"], ["S1", "S4"])

    def test_ask_your_data_receives_context_and_saves_tenant_scoped_history(self):
        class FakeStream:
            status_code = 200
            text = ""

            @staticmethod
            def iter_lines():
                token = {"choices": [{"delta": {"content": "Recorded revenue is $500 [S1]."}}]}
                return [f"data: {json.dumps(token)}".encode(), b"data: [DONE]"]

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key", "GROQ_MODEL": "test-model"}), \
                patch("routes.chat_routes.requests.post", return_value=FakeStream()) as provider:
            saved = self.client.post("/api/chat/save", headers=self.headers, json={
                "role": "user", "content": "What was my revenue?", "session_id": self.session_id,
            })
            self.assertEqual(saved.status_code, 201)
            response = self.client.post("/api/chat", headers=self.headers, json={
                "messages": [{"role": "user", "content": "What was my revenue?"}],
                "session_id": self.session_id,
            })

        self.assertEqual(response.status_code, 200)
        self.assertIn("[S1]", response.get_data(as_text=True))
        prompt = provider.call_args.kwargs["json"]["messages"][0]["content"]
        self.assertIn('"revenue":500.0', prompt)
        self.assertNotIn("999999", prompt)
        history = self.client.get(
            f"/api/chat/history?session_id={self.session_id}", headers=self.headers,
        ).get_json()
        self.assertEqual([message["role"] for message in history], ["user", "assistant"])


if __name__ == "__main__":
    unittest.main()
