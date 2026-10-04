"""
Anomaly Detection for Profit Navigator using Isolation Forest.
Falls back to Z-score (std deviation) if scikit-learn fails.

Reads JSON from stdin:
  {
    "monthly_data": [
      { "month": "2024-01", "income": 5000, "expense": 2000 },
      ...
    ]
  }

Writes JSON to stdout:
  { "anomalies": [...], "model_used": "isolation_forest" | "zscore" }
"""

import sys
import json
import numpy as np

try:
    from sklearn.ensemble import IsolationForest
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# ── Isolation Forest ─────────────────────────────────────────────────────────
def isolation_forest_detect(monthly_data: list):
    """Detect anomalies using Isolation Forest."""
    if len(monthly_data) < 4:
        return []

    months = [d["month"] for d in monthly_data]
    incomes = [d["income"] for d in monthly_data]
    expenses = [d["expense"] for d in monthly_data]
    profits = [incomes[i] - expenses[i] for i in range(len(incomes))]

    X = np.array(list(zip(incomes, expenses, profits)))

    model = IsolationForest(
        contamination=0.15,   # expect ~15% anomalies
        random_state=42,
        n_estimators=100
    )
    labels = model.fit_predict(X)   # -1 = anomaly, 1 = normal
    scores = model.decision_function(X)  # lower = more anomalous

    anomalies = []
    income_mean = np.mean(incomes)
    expense_mean = np.mean(expenses)

    for i, label in enumerate(labels):
        if label == -1:
            income_dev = ((incomes[i] - income_mean) / income_mean * 100) if income_mean > 0 else 0
            expense_dev = ((expenses[i] - expense_mean) / expense_mean * 100) if expense_mean > 0 else 0

            # Determine anomaly type and metric
            if abs(income_dev) >= abs(expense_dev):
                metric = "Revenue"
                value = incomes[i]
                expected = round(income_mean)
                deviation = income_dev
                anom_type = "spike" if income_dev > 0 else "drop"
            else:
                metric = "Expenses"
                value = expenses[i]
                expected = round(expense_mean)
                deviation = expense_dev
                anom_type = "spike" if expense_dev > 0 else "drop"

            # Severity based on isolation score
            abs_score = abs(scores[i])
            if abs_score > 0.15:
                severity = "high"
            elif abs_score > 0.08:
                severity = "medium"
            else:
                severity = "low"

            risk_score = min(99, int(abs(deviation) * 1.5))
            if metric == "Expenses":
                root_cause = "Unusual surge in vendor payments, supplies restock, or equipment purchase."
                suggested_action = "Audit recent vendor invoices & check for unauthorized recurring subscriptions."
            else:
                root_cause = "Sudden fluctuation in daily transaction velocity or missed bulk orders."
                suggested_action = "Investigate store foot traffic, marketing campaigns, and payment gateway logs."

            anomalies.append({
                "id": f"anomaly-{i}",
                "metric": metric,
                "value": round(value),
                "expected": round(expected),
                "deviationPct": abs(round(deviation)),
                "riskScore": risk_score,
                "rootCause": root_cause,
                "suggestedAction": suggested_action,
                "description": (
                    f"{metric} in {months[i]} deviated {abs(round(deviation))}% from baseline. "
                    f"Isolation Forest flagged an unusual outlier."
                ),
                "severity": severity,
                "type": anom_type,
                "date": months[i],
            })

    return anomalies


# ── Z-Score Fallback ─────────────────────────────────────────────────────────
def zscore_detect(monthly_data: list):
    """Fallback: Z-score based anomaly detection."""
    if len(monthly_data) < 3:
        return []

    months = [d["month"] for d in monthly_data]
    incomes = np.array([d["income"] for d in monthly_data])
    expenses = np.array([d["expense"] for d in monthly_data])

    anomalies = []
    threshold = 1.5  # Z-score threshold

    for metric_name, values in [("Revenue", incomes), ("Expenses", expenses)]:
        mean = np.mean(values)
        std = np.std(values)
        if std == 0:
            continue

        for i, val in enumerate(values):
            z = (val - mean) / std
            if abs(z) > threshold:
                deviation = ((val - mean) / mean * 100) if mean > 0 else 0
                anom_type = "spike" if z > 0 else "drop"
                severity = "high" if abs(z) > 2.5 else "medium" if abs(z) > 2.0 else "low"

                risk_score = min(99, int(abs(deviation) * 1.5))
                if metric_name == "Expenses":
                    root_cause = "Unusual surge in operational expense or supplier invoice."
                    suggested_action = "Review detailed expense ledgers for vendor cost spikes."
                else:
                    root_cause = "Revenue deviation beyond historical normal range."
                    suggested_action = "Check sales transaction volume and discount campaigns."

                anomalies.append({
                    "id": f"anomaly-{metric_name}-{i}",
                    "metric": metric_name,
                    "value": round(float(val)),
                    "expected": round(float(mean)),
                    "deviationPct": abs(round(deviation)),
                    "riskScore": risk_score,
                    "rootCause": root_cause,
                    "suggestedAction": suggested_action,
                    "description": (
                        f"{metric_name} in {months[i]} was {abs(round(deviation))}% "
                        f"{'above' if z > 0 else 'below'} historical baseline."
                    ),
                    "severity": severity,
                    "type": anom_type,
                    "date": months[i],
                })

    return anomalies


# ── Main Exportable Function ──────────────────────────────────────────────────
def run_anomaly_detection(payload: dict) -> dict:
    """
    Run Isolation Forest or Z-Score anomaly detection.
    payload: { "monthly_data": [ {"month": "...", "income": ..., "expense": ...} ] }
    """
    monthly_data = payload.get("monthly_data", [])

    if SKLEARN_AVAILABLE and len(monthly_data) >= 4:
        anomalies = isolation_forest_detect(monthly_data)
        model_used = "isolation_forest"
    else:
        anomalies = zscore_detect(monthly_data)
        model_used = "zscore"

    return {"anomalies": anomalies, "model_used": model_used}


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        return
    payload = json.loads(raw)
    result = run_anomaly_detection(payload)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

