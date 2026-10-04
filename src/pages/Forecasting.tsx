import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useForecasting } from "@/hooks/useForecasting";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RefreshCw, TrendingUp, AlertCircle, Sliders, Download, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-xl bg-slate-900/90 text-white border border-slate-700/80 p-3 shadow-xl backdrop-blur-md">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 text-xs py-0.5">
          <span className="flex items-center gap-1.5" style={{ color: p.color }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}:
          </span>
          <span className="font-mono font-bold">${p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function Forecasting() {
  const { loading, chartData, forecasts, modelUsed, metrics, error, refresh } = useForecasting();

  // Dynamic Scenario Simulation Parameters
  const [inflationRate, setInflationRate] = useState<number>(3); // %
  const [marketingBoost, setMarketingBoost] = useState<number>(5); // %
  const [retentionRate, setRetentionRate] = useState<number>(2); // %

  const handleRefresh = async () => {
    await refresh();
    toast.success("Forecast refreshed with live database telemetry!");
  };

  // Compute scenario-adjusted forecasts dynamically
  const scenarioMultiplier = useMemo(() => {
    const netGrowth = (marketingBoost * 0.8 + retentionRate * 1.2 - inflationRate * 0.3) / 100;
    return 1 + netGrowth;
  }, [inflationRate, marketingBoost, retentionRate]);

  const adjustedChartData = useMemo(() => {
    return chartData.map((pt) => {
      if (pt.forecast !== null && pt.forecast !== undefined) {
        const adjForecast = Math.round(pt.forecast * scenarioMultiplier);
        const forecastUpper = pt.forecastUpper != null ? Math.round(pt.forecastUpper * scenarioMultiplier) : null;
        const forecastLower = pt.forecastLower != null ? Math.round(pt.forecastLower * scenarioMultiplier) : null;
        return {
          ...pt,
          forecast: adjForecast,
          forecastUpper,
          forecastLower,
          forecastBand: forecastUpper != null && forecastLower != null ? Math.max(0, forecastUpper - forecastLower) : null,
        };
      }
      return pt;
    });
  }, [chartData, scenarioMultiplier]);

  const adjustedForecasts = useMemo(() => {
    return forecasts.map((f) => {
      const adjRev = Math.round(f.predicted_revenue * scenarioMultiplier);
      const adjExp = Math.round(f.predicted_expenses * (1 + inflationRate / 100));
      const adjProfit = Math.max(0, adjRev - adjExp);
      const margin = adjRev > 0 ? Math.round((adjProfit / adjRev) * 1000) / 10 : 0;
      return {
        ...f,
        predicted_revenue: adjRev,
        predicted_expenses: adjExp,
        predicted_profit: adjProfit,
        profit_margin: margin,
      };
    });
  }, [forecasts, scenarioMultiplier, inflationRate]);

  const exportCSV = () => {
    const headers = ["Period", "Predicted Revenue", "Predicted Expenses", "Predicted Profit", "Profit Margin", "Revenue Lower Bound", "Revenue Upper Bound", "Interval Coverage"];
    const rows = adjustedForecasts.map(f => [
      f.period,
      f.predicted_revenue,
      f.predicted_expenses,
      f.predicted_profit ?? (f.predicted_revenue - f.predicted_expenses),
      `${f.profit_margin ?? 0}%`,
      f.predicted_revenue_lower ?? "N/A",
      f.predicted_revenue_upper ?? "N/A",
      f.interval_coverage != null ? `${Math.round(f.interval_coverage * 100)}%` : "N/A"
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit_navigator_forecast_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("Forecast exported to CSV!");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Sales & Profit Trend Forecasting
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Prophet & Scikit-Learn time-series models with interactive macro-economic scenario simulation
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2 text-xs font-semibold">
            <Download className="h-3.5 w-3.5" />
            Export Report
          </Button>
          <Button onClick={handleRefresh} disabled={loading} size="sm" className="gap-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Updating..." : "Recalculate AI Forecast"}
          </Button>
        </div>
      </div>

      {/* Model Telemetry Badge */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-5 text-white shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-md">
            <Sparkles className="h-6 w-6 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              {modelUsed === "prophet" ? "Facebook Prophet Time-Series ML Engine" : modelUsed === "linear_regression" ? "Linear Regression Engine" : "Forecast Engine"}
              <span className="text-[10px] uppercase font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 px-2 py-0.5 rounded-full">
                Active
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              {metrics?.revenue?.sample_count
                ? `Linear-baseline rolling-origin errors: MAE ${metrics.revenue.mae?.toLocaleString() ?? "N/A"}, RMSE ${metrics.revenue.rmse?.toLocaleString() ?? "N/A"}, MAPE ${metrics.revenue.mape === null ? "N/A" : `${metrics.revenue.mape}%`}`
                : "Error metrics require sufficient historical periods."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="block text-[10px] uppercase font-semibold text-slate-400">Interval Coverage</span>
            <span className="text-lg font-bold font-mono text-emerald-400">{forecasts[0]?.interval_coverage ? `${Math.round(forecasts[0].interval_coverage * 100)}%` : "—"}</span>
          </div>
          <ShieldCheck className="h-8 w-8 text-emerald-400 opacity-80" />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200/80 p-4 text-rose-700 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Interactive Scenario Controls */}
      <div className="glow-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-blue-600" />
            <h3 className="font-display text-sm font-bold text-slate-900">Macro-Economic Scenario Simulator</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Projected Impact Multiplier: <span className="font-bold text-blue-600 font-mono">{(scenarioMultiplier * 100).toFixed(1)}%</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-600">Expected Inflation Rate</span>
              <span className="text-amber-600 font-mono">{inflationRate}%</span>
            </div>
            <Slider
              value={[inflationRate]}
              min={-5}
              max={15}
              step={1}
              onValueChange={(val) => setInflationRate(val[0])}
            />
            <p className="text-[11px] text-slate-400">Adjusts supplier expense baselines</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-600">Marketing Budget Expansion</span>
              <span className="text-blue-600 font-mono">+{marketingBoost}%</span>
            </div>
            <Slider
              value={[marketingBoost]}
              min={0}
              max={30}
              step={1}
              onValueChange={(val) => setMarketingBoost(val[0])}
            />
            <p className="text-[11px] text-slate-400">Simulates new acquisition campaigns</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-600">Customer Retention Growth</span>
              <span className="text-emerald-600 font-mono">+{retentionRate}%</span>
            </div>
            <Slider
              value={[retentionRate]}
              min={-10}
              max={20}
              step={1}
              onValueChange={(val) => setRetentionRate(val[0])}
            />
            <p className="text-[11px] text-slate-400">Simulates repeat purchase loyalty</p>
          </div>
        </div>
      </div>

      {/* Main Area Chart */}
      {adjustedChartData.length > 0 && (
        <motion.div className="glow-card p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">Revenue Trajectory (Actual vs Forecast)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Backend-calibrated 95% prediction intervals where history supports calibration</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Actual Revenue</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" /> AI Forecast</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-300" /> Prediction Interval</span>
            </div>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={adjustedChartData}>
                <defs>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="upperGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c4b5fd" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#c4b5fd" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="actual" stroke="#2563eb" fill="url(#actualGrad)" strokeWidth={3} name="Actual Revenue" dot={{ r: 4, fill: "#2563eb" }} />
                <Area type="monotone" dataKey="forecast" stroke="#7c3aed" fill="url(#forecastGrad)" strokeWidth={3} strokeDasharray="6 4" name="AI Predicted Revenue" dot={{ r: 4, fill: "#7c3aed" }} />
                <Area type="monotone" dataKey="forecastLower" stackId="interval" stroke="none" fill="transparent" name="Interval lower bound" legendType="none" tooltipType="none" />
                <Area type="monotone" dataKey="forecastBand" stackId="interval" stroke="#c4b5fd" fill="url(#upperGrad)" strokeWidth={1} strokeDasharray="2 2" name="95% Prediction Interval" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Detailed Forecast Matrix */}
      {adjustedForecasts.length > 0 && (
        <motion.div className="glow-card overflow-hidden" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-slate-900">Monthly Projection Matrix</h3>
            <span className="text-xs text-slate-500 font-medium">6-Month Horizon Breakdown</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80">
                  <th className="text-left p-4 text-slate-600 font-semibold">Period</th>
                  <th className="text-right p-4 text-slate-600 font-semibold">Predicted Revenue</th>
                  <th className="text-right p-4 text-slate-600 font-semibold">Predicted Expenses</th>
                  <th className="text-right p-4 text-slate-600 font-semibold">Net Profit</th>
                  <th className="text-right p-4 text-slate-600 font-semibold">Profit Margin</th>
                  <th className="text-right p-4 text-slate-600 font-semibold">Revenue Interval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adjustedForecasts.map((f: any, i: number) => {
                  const netProf = f.predicted_profit ?? (f.predicted_revenue - f.predicted_expenses);
                  return (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 text-slate-900 font-bold">{f.period}</td>
                      <td className="p-4 text-right text-emerald-600 font-mono font-bold">${f.predicted_revenue.toLocaleString()}</td>
                      <td className="p-4 text-right text-rose-600 font-mono">${f.predicted_expenses.toLocaleString()}</td>
                      <td className="p-4 text-right text-blue-600 font-mono font-bold">${netProf.toLocaleString()}</td>
                      <td className="p-4 text-right font-semibold text-slate-700">{f.profit_margin ?? 0}%</td>
                      <td className="p-4 text-right text-slate-700 font-mono text-xs">
                        {f.predicted_revenue_lower != null && f.predicted_revenue_upper != null
                          ? `$${f.predicted_revenue_lower.toLocaleString()} - $${f.predicted_revenue_upper.toLocaleString()} (${Math.round(f.interval_coverage * 100)}%)`
                          : "Not available"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
