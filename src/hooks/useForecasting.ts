import { useState, useEffect, useCallback } from "react";
import { fetchForecast } from "@/lib/api";

export type ForecastResult = {
    period: string;
    predicted_revenue: number;
    predicted_expenses: number;
    predicted_profit?: number;
        predicted_revenue_upper?: number | null;
        predicted_revenue_lower?: number | null;
    profit_margin?: number;
    interval_coverage: number | null;
};

type ForecastMetrics = {
    revenue?: { mae: number | null; rmse: number | null; mape: number | null; sample_count: number };
    expenses?: { mae: number | null; rmse: number | null; mape: number | null; sample_count: number };
};

export type ChartPoint = {
    month: string;
    actual: number | null;
    forecast: number | null;
    forecastUpper?: number | null;
    forecastLower?: number | null;
    forecastBand?: number | null;
    expenses?: number | null;
};

export function useForecasting() {
    const [loading, setLoading] = useState(true);
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [forecasts, setForecasts] = useState<ForecastResult[]>([]);
    const [modelUsed, setModelUsed] = useState<string>("pending");
    const [metrics, setMetrics] = useState<ForecastMetrics | null>(null);
    const [error, setError] = useState<string | null>(null);

    const calculateForecast = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchForecast();
            setForecasts(res.forecasts || []);
            setModelUsed(res.model_used || "none");
            setMetrics(res.metrics || null);

            const historicalMonths = res.historical?.months || [];
            const historicalRevenues = res.historical?.revenues || [];
            const historicalExpenses = res.historical?.expenses || [];
            const historicalPoints: ChartPoint[] = historicalMonths.map((month, index) => ({
                month: new Date(`${month}-01`).toLocaleString("default", { month: "short" }),
                actual: historicalRevenues[index] ?? 0,
                forecast: null,
                expenses: historicalExpenses[index] ?? 0,
            }));
            const forecastPoints: ChartPoint[] = (res.forecasts || []).map((forecast) => ({
                month: forecast.period.split(" ")[0],
                actual: null,
                forecast: forecast.predicted_revenue,
                    forecastUpper: forecast.predicted_revenue_upper ?? null,
                    forecastLower: forecast.predicted_revenue_lower ?? null,
                    forecastBand: forecast.predicted_revenue_upper != null && forecast.predicted_revenue_lower != null
                        ? Math.max(0, forecast.predicted_revenue_upper - forecast.predicted_revenue_lower)
                        : null,
                expenses: forecast.predicted_expenses,
            }));
            setChartData([...historicalPoints, ...forecastPoints]);

        } catch (e: any) {
            console.error("Forecasting error:", e);
            setError(e.message || "An error occurred during forecasting");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        calculateForecast();
        const interval = setInterval(calculateForecast, 30000);
        return () => clearInterval(interval);
    }, [calculateForecast]);

    return { loading, chartData, forecasts, modelUsed, metrics, error, refresh: calculateForecast };
}


