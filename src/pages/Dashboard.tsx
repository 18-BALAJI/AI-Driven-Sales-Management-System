import { motion } from "framer-motion";
import { DollarSign, TrendingUp, TrendingDown, ShoppingCart, Loader2, Calendar as CalendarIcon, Play, Square, Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useExecutiveInsights } from "@/hooks/useExecutiveInsights";
import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { createTransaction } from "@/lib/api";

const CHART_COLORS = {
  blue: "#2563eb",
  green: "#10b981",
  orange: "#f97316",
  purple: "#8b5cf6",
  rose: "#f43f5e",
  slate: "#94a3b8",
};

const PIE_COLORS = [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.purple];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-xl bg-slate-900/90 text-white border border-slate-700/80 p-3 shadow-xl backdrop-blur-md">
      <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">{label}</p>
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

export default function Dashboard() {
  const [range, setRange] = useState("14");
  const [isSimulating, setIsSimulating] = useState(false);
  const historyDays = parseInt(range) || 14;
  const { metrics, revenueTrend, dailySales, categoryBreakdown, loading, refresh } = useDashboardData(historyDays);
  const { insights: executiveInsights, loading: insightsLoading, error: insightsError, refresh: refreshInsights } = useExecutiveInsights();

  // Live transaction simulation tick
  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(async () => {
      try {
        const categories = ["Sales", "Inventory restock", "Digital Marketing", "Utilities"];
        const isIncome = Math.random() > 0.3;
        const amount = isIncome ? Math.round(150 + Math.random() * 850) : Math.round(50 + Math.random() * 300);
        await createTransaction({
          date: new Date().toISOString().slice(0, 10),
          description: isIncome ? "Live simulated order" : "Simulated supplier expense",
          category: isIncome ? "Sales" : categories[Math.floor(Math.random() * (categories.length - 1)) + 1],
          amount,
          type: isIncome ? "income" : "expense",
        });
        refresh();
        toast.info(`⚡ Live Tick: ${isIncome ? '+$' : '-$'}${amount} recorded`, { duration: 1500 });
      } catch (err) {
        console.error("Simulation error:", err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isSimulating, refresh]);

  const toggleSimulation = () => {
    if (!isSimulating) {
      setIsSimulating(true);
      toast.success("Live real-time transaction simulator ACTIVE! Generating live telemetry ticks...");
    } else {
      setIsSimulating(false);
      toast.info("Live simulator paused.");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
        <p className="text-slate-500 animate-pulse font-display">Synchronizing business telemetry engine...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Business Command Center</h2>
          <p className="text-sm text-slate-500 mt-0.5">Real-time financial telemetry, revenue velocity & predictive analytics</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={toggleSimulation}
            variant={isSimulating ? "destructive" : "default"}
            size="sm"
            className="gap-2 font-semibold shadow-md"
          >
            {isSimulating ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {isSimulating ? "Stop Live Simulation" : "Start Live Simulation Ticker"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Revenue" value={`$${metrics.totalRevenue.toLocaleString()}`} change={`+${metrics.revenueChange}% vs baseline`} changeType="positive" icon={DollarSign} />
        <MetricCard label="Net Profit" value={`$${metrics.netProfit.toLocaleString()}`} change={`+${metrics.profitChange}% margin efficiency`} changeType="positive" icon={TrendingUp} variant="success" />
        <MetricCard label="Expenses" value={`$${metrics.expenses.toLocaleString()}`} change={`+${metrics.expensesChange}% operational cost`} changeType="negative" icon={TrendingDown} variant="alert" />
        <MetricCard label="Orders Volume" value={metrics.orders.toLocaleString()} change={`+${metrics.ordersChange}% volume growth`} changeType="positive" icon={ShoppingCart} />
      </div>

      {/* Main Revenue & Profit Trend Chart + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Revenue Trend */}
        <motion.div
          className="glow-card p-6 lg:col-span-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">Revenue & Profit Velocity</h3>
              <p className="text-xs text-slate-500 mt-0.5">Historical cash flow breakdown with net margin trajectory</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Net Profit</span>
            </div>
          </div>

          {revenueTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueTrend}>
                <defs>
                  <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.green} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLORS.green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS.blue} fill="url(#blueGrad)" strokeWidth={3} />
                <Area type="monotone" dataKey="profit" name="Net Profit" stroke={CHART_COLORS.green} fill="url(#greenGrad)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm italic">
              No transaction history available yet.
            </div>
          )}
        </motion.div>

        {/* Category Breakdown */}
        <motion.div
          className="glow-card p-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="font-display text-base font-bold text-slate-900 mb-1">Revenue by Category</h3>
          <p className="text-xs text-slate-500 mb-4">Product line contribution matrix</p>

          {categoryBreakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={80} strokeWidth={0}>
                    {categoryBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4 pt-3 border-t border-slate-100">
                {categoryBreakdown.map((cat, i) => (
                  <div key={cat.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-600 font-medium">{cat.name}</span>
                    </div>
                    <span className="font-bold text-slate-900 font-mono">{cat.percentage}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm italic text-center">
              Add products with revenue to view breakdown.
            </div>
          )}
        </motion.div>
      </div>

      {/* Daily Sales Bar Chart & AI Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <motion.div
          className="glow-card p-6 lg:col-span-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">7-Day Dynamic Projections</h3>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <CalendarIcon className="h-3 w-3 text-slate-400" /> Historical daily sales + 7-day linear forecast
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="w-[140px] h-9 bg-slate-50 border-slate-200 text-xs font-semibold">
                  <SelectValue placeholder="Select Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="14">Last 14 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dailySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${v / 1000}k`} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="sales" name="Daily Sales" radius={[6, 6, 0, 0]}>
                {dailySales.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.isForecast ? "#93c5fd" : "#2563eb"}
                    stroke={entry.isForecast ? "#2563eb" : "none"}
                    strokeDasharray={entry.isForecast ? "4 2" : "0"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* AI Intelligence Card */}
        <motion.div
          className="glow-card p-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <h3 className="font-display text-base font-bold text-slate-900">AI Intelligence</h3>
            </div>
            <Button onClick={() => void refreshInsights()} disabled={insightsLoading} variant="ghost" size="icon" title="Regenerate executive insights">
              <RefreshCw className={`h-4 w-4 ${insightsLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {insightsLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Analyzing current business data…</div>
          ) : insightsError ? (
            <div className="flex gap-2 py-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{insightsError}</div>
          ) : executiveInsights ? (
            <div className="space-y-4">
              <div className="border-l-2 border-blue-500 pl-3">
                <p className="text-sm font-semibold text-slate-900">Executive summary</p>
                <p className="text-xs leading-relaxed text-slate-600 mt-1">{executiveInsights.executive_summary.text}</p>
                <p className="text-[10px] text-slate-400 mt-1">Sources: {executiveInsights.executive_summary.source_ids.map((id) => executiveInsights.sources.find((source) => source.id === id)?.label || id).join(" · ")}</p>
              </div>
              {executiveInsights.insights.slice(0, 3).map((insight) => (
                <article key={insight.title} className="border-t border-slate-100 pt-3">
                  <h4 className="text-xs font-bold text-slate-900">{insight.title}</h4>
                  <p className="text-xs text-slate-700 mt-1">{insight.finding}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{insight.explanation}</p>
                  <p className="text-[11px] text-blue-800 mt-1">Next: {insight.recommended_action}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Sources: {insight.source_ids.map((id) => executiveInsights.sources.find((source) => source.id === id)?.label || id).join(" · ")}</p>
                </article>
              ))}
            </div>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
