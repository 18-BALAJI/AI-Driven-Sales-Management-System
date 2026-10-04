"""
Forecasting model for Profit Navigator using Facebook Prophet.
Falls back to Linear Regression if Prophet is not installed.

Reads JSON from stdin:
  { "months": ["2024-01", ...], "revenues": [...], "expenses": [...] }

Writes JSON to stdout:
  { "forecasts": [...], "model_used": "prophet" | "linear_regression" }
"""

import sys
import json
from datetime import datetime
from dateutil.relativedelta import relativedelta

import numpy as np

# ── Try Prophet first, fall back to Linear Regression ──────────────────────
try:
    from prophet import Prophet
    import pandas as pd
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False

from sklearn.linear_model import LinearRegression


def _prediction_error_metrics(actual: list[float], predicted: list[float]) -> dict:
    errors = np.asarray(actual, dtype=float) - np.asarray(predicted, dtype=float)
    absolute_errors = np.abs(errors)
    nonzero_actual = np.asarray(actual, dtype=float) != 0
    mape = (
        float(np.mean(absolute_errors[nonzero_actual] / np.abs(np.asarray(actual, dtype=float)[nonzero_actual])) * 100)
        if np.any(nonzero_actual)
        else None
    )
    return {
        "mae": round(float(np.mean(absolute_errors)), 2) if len(errors) else None,
        "rmse": round(float(np.sqrt(np.mean(errors ** 2))), 2) if len(errors) else None,
        "mape": round(mape, 2) if mape is not None else None,
        "sample_count": len(errors),
        "method": "rolling_origin_linear_baseline",
    }


def _rolling_origin_errors(values: list[float]) -> list[float]:
    errors = []
    for index in range(2, len(values)):
        history = np.asarray(values[:index], dtype=float)
        model = LinearRegression().fit(np.arange(index).reshape(-1, 1), history)
        prediction = float(model.predict(np.array([[index]]))[0])
        errors.append(float(values[index]) - prediction)
    return errors


def _conformal_interval_width(errors: list[float], coverage: float = 0.95) -> float | None:
    if len(errors) < 2:
        return None
    absolute_errors = np.sort(np.abs(np.asarray(errors, dtype=float)))
    rank = int(np.ceil((len(absolute_errors) + 1) * coverage))
    if rank > len(absolute_errors):
        return None
    return float(absolute_errors[rank - 1])


# ── Prophet Forecast ────────────────────────────────────────────────────────
def prophet_forecast(months: list, values: list, future_count: int = 6):
    """Return Prophet point predictions and its nominal 95% intervals."""
    if len(values) < 2:
        return [max(0, round(values[0])) if values else 0] * future_count, None, None

    df = pd.DataFrame({
        "ds": pd.to_datetime([m + "-01" for m in months]),
        "y": values
    })

    # Yearly seasonality needs at least two full cycles (>= 24 monthly points).
    # At exactly 12 points each month is its own seasonal slot, so Prophet
    # overfits a full cycle and extrapolates to wild/negative values. Keep it
    # off until we have enough history for the pattern to be real.
    yearly_seasonality = len(values) >= 24

    model = Prophet(
        yearly_seasonality=yearly_seasonality,
        weekly_seasonality=False,
        daily_seasonality=False,
        seasonality_mode="additive",
        changepoint_prior_scale=0.05,   # smoother trend for small data
        interval_width=0.95,
    )
    model.fit(df)

    future = model.make_future_dataframe(periods=future_count, freq="MS")
    forecast = model.predict(future)

    # Get only the future predictions
    future = forecast.tail(future_count)
    predictions = [max(0, round(float(value))) for value in future["yhat"]]
    lower = [max(0, round(float(value))) for value in future["yhat_lower"]]
    upper = [max(0, round(float(value))) for value in future["yhat_upper"]]
    return predictions, lower, upper


# ── Linear Regression Fallback ───────────────────────────────────────────────
def linear_regression_forecast(values: list, future_count: int = 6):
    """Fallback: simple linear regression forecast."""
    n = len(values)
    if n < 2:
        return [max(0, round(values[0])) if values else 0] * future_count, 0.0

    X = np.arange(n).reshape(-1, 1)
    y = np.array(values)

    model = LinearRegression()
    model.fit(X, y)

    r2 = float(model.score(X, y))
    future_X = np.arange(n, n + future_count).reshape(-1, 1)
    predictions = [max(0, round(float(p))) for p in model.predict(future_X)]

    return predictions, round(r2, 4)


# ── Main Exportable Function ──────────────────────────────────────────────────
def run_forecast_model(payload: dict) -> dict:
    """
    Run forecast model on monthly and daily financial data.
    payload: {
      "months": ["2024-01", ...],
      "revenues": [...],
      "expenses": [...],
      "future_count": 6
    }
    """
    months: list = payload.get("months", [])
    revenues: list = payload.get("revenues", [])
    expenses: list = payload.get("expenses", [])
    future_count = payload.get("future_count", 6)

    if not months or not revenues:
        return {"forecasts": [], "daily_forecast": [], "model_used": "none", "r2_score": 0.0}

    # Evaluate with rolling-origin predictions so reported errors are out-of-sample.
    revenue_errors = _rolling_origin_errors(revenues)
    expense_errors = _rolling_origin_errors(expenses)
    revenue_metrics = _prediction_error_metrics(
        revenues[2:], [revenues[index] - revenue_errors[index - 2] for index in range(2, len(revenues))]
    ) if revenue_errors else _prediction_error_metrics([], [])
    expense_metrics = _prediction_error_metrics(
        expenses[2:], [expenses[index] - expense_errors[index - 2] for index in range(2, len(expenses))]
    ) if expense_errors else _prediction_error_metrics([], [])

    # Choose model
    if PROPHET_AVAILABLE and len(revenues) >= 2:
        rev_preds, rev_lower, rev_upper = prophet_forecast(months, revenues, future_count)
        exp_preds, exp_lower, exp_upper = prophet_forecast(months, expenses, future_count)
        model_used = "prophet"
    else:
        rev_preds, _ = linear_regression_forecast(revenues, future_count)
        exp_preds, _ = linear_regression_forecast(expenses, future_count)
        revenue_interval_width = _conformal_interval_width(revenue_errors)
        expense_interval_width = _conformal_interval_width(expense_errors)
        rev_lower = [max(0, round(value - revenue_interval_width)) for value in rev_preds] if revenue_interval_width is not None else None
        rev_upper = [round(value + revenue_interval_width) for value in rev_preds] if revenue_interval_width is not None else None
        exp_lower = [max(0, round(value - expense_interval_width)) for value in exp_preds] if expense_interval_width is not None else None
        exp_upper = [round(value + expense_interval_width) for value in exp_preds] if expense_interval_width is not None else None
        model_used = "linear_regression"

    # Build forecast periods
    try:
        last_month = datetime.strptime(months[-1], "%Y-%m")
    except Exception:
        last_month = datetime.now().replace(day=1)

    forecasts = []
    for i in range(future_count):
        future_date = last_month + relativedelta(months=i + 1)
        period = future_date.strftime("%b %y")
        pred_rev = rev_preds[i]
        pred_exp = exp_preds[i]
        pred_profit = max(0, pred_rev - pred_exp)
        margin = round((pred_profit / pred_rev * 100), 1) if pred_rev > 0 else 0
        forecasts.append({
            "period": period,
            "predicted_revenue": pred_rev,
            "predicted_expenses": pred_exp,
            "predicted_profit": pred_profit,
            "predicted_revenue_upper": rev_upper[i] if rev_upper is not None else None,
            "predicted_revenue_lower": rev_lower[i] if rev_lower is not None else None,
            "predicted_expenses_upper": exp_upper[i] if exp_upper is not None else None,
            "predicted_expenses_lower": exp_lower[i] if exp_lower is not None else None,
            "profit_margin": margin,
            "interval_coverage": 0.95 if rev_lower is not None else None,
        })

    # Generate 7-day daily forecast for dashboard projection
    daily_sales = payload.get("daily_sales", [])
    daily_forecast = []
    if len(daily_sales) >= 2:
        preds, _ = linear_regression_forecast(daily_sales, future_count=7)
        daily_forecast = preds
    elif daily_sales:
        daily_forecast = [daily_sales[-1]] * 7

    return {
        "forecasts": forecasts,
        "daily_forecast": daily_forecast,
        "model_used": model_used,
        "metrics": {"revenue": revenue_metrics, "expenses": expense_metrics},
        "interval_method": "prophet_95_percent" if model_used == "prophet" else "rolling_origin_conformal_95_percent",
    }


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        return
    payload = json.loads(raw)
    result = run_forecast_model(payload)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

