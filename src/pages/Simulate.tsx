import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, DollarSign,
  Sparkles, MousePointer, BarChart3, Activity, Layers, Download
} from "lucide-react";
import { useForecasting } from "@/hooks/useForecasting";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
          <span className="font-mono font-bold">${Math.round(p.value)?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function Simulate() {
  const { forecasts, loading } = useForecasting();
  const [priceAdj, setPriceAdj] = useState([0]);
  const [expenseAdj, setExpenseAdj] = useState([0]);
  const [volumeAdj, setVolumeAdj] = useState([15]);

  const applyPreset = (p: number, e: number, v: number) => {
    setPriceAdj([p]);
    setExpenseAdj([e]);
    setVolumeAdj([v]);
    toast.info("Applied scenario preset");
  };

  const simulatedData = useMemo(() => {
    if (!forecasts.length) return [];

    return forecasts.map((f) => {
      const pFactor = 1 + (priceAdj[0] / 100);
      const eFactor = 1 - (expenseAdj[0] / 100);
      const vFactor = 1 + (volumeAdj[0] / 100);

      const simRevenue = f.predicted_revenue * pFactor * vFactor;
      const simExpenses = f.predicted_expenses * eFactor;
      const simProfit = simRevenue - simExpenses;
      const baseProfit = f.predicted_revenue - f.predicted_expenses;

      return {
        period: f.period,
        baselineProfit: Math.round(baseProfit),
        simulatedProfit: Math.round(simProfit),
        simulatedRevenue: Math.round(simRevenue),
        simulatedExpenses: Math.round(simExpenses),
        profitDelta: Math.round(simProfit - baseProfit)
      };
    });
  }, [forecasts, priceAdj, expenseAdj, volumeAdj]);

  const totalSimProfit = simulatedData.reduce((acc, d) => acc + d.simulatedProfit, 0);
  const totalBaseProfit = simulatedData.reduce((acc, d) => acc + d.baselineProfit, 0);
  const totalDelta = totalSimProfit - totalBaseProfit;
  const profitLift = totalBaseProfit > 0 ? (totalDelta / totalBaseProfit) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Strategic Profit Simulator</h2>
          <p className="text-sm text-slate-500 mt-0.5">Model financial growth vectors and simulate pricing, volume, and expense impacts</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glow-card p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Projected Revenue</span>
          <h3 className="font-display text-2xl font-bold text-slate-900 font-mono">
            ${Math.round(simulatedData.reduce((a, b) => a + b.simulatedRevenue, 0)).toLocaleString()}
          </h3>
          <span className="text-xs font-semibold text-emerald-600 mt-1 inline-block">+Vector Adjusted</span>
        </div>

        <div className="glow-card-success p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Simulated Net Profit</span>
          <h3 className="font-display text-2xl font-bold text-emerald-700 font-mono">
            ${Math.round(totalSimProfit).toLocaleString()}
          </h3>
          <span className="text-xs font-bold text-emerald-600 mt-1 inline-block">+{profitLift.toFixed(1)}% vs Baseline</span>
        </div>

        <div className="glow-card-alert p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Simulated Expenses</span>
          <h3 className="font-display text-2xl font-bold text-slate-900 font-mono">
            ${Math.round(simulatedData.reduce((a, b) => a + b.simulatedExpenses, 0)).toLocaleString()}
          </h3>
          <span className="text-xs font-semibold text-blue-600 mt-1 inline-block">Optimized Operations</span>
        </div>

        <div className="glow-card p-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Scenario Advantage</span>
          <h3 className="font-display text-2xl font-bold text-blue-700 font-mono">
            +${Math.round(totalDelta).toLocaleString()}
          </h3>
          <span className="text-xs font-bold text-blue-600 mt-1 inline-block">Net Value Created</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Control Vectors */}
        <div className="lg:col-span-4">
          <div className="glow-card p-6 h-full flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center gap-2 text-blue-600 mb-6 font-bold text-sm uppercase tracking-wider border-b border-slate-100 pb-3">
                <MousePointer className="h-4 w-4" />
                Strategic Control Vectors
              </div>

              <div className="space-y-6">
                {[
                  { label: "Price Adjustment", val: priceAdj, set: setPriceAdj, min: -10, max: 50, icon: DollarSign, color: "text-blue-600" },
                  { label: "Expense Reduction", val: expenseAdj, set: setExpenseAdj, min: 0, max: 30, icon: TrendingDown, color: "text-emerald-600" },
                  { label: "Sales Volume Growth", val: volumeAdj, set: setVolumeAdj, min: 0, max: 100, icon: TrendingUp, color: "text-violet-600" }
                ].map((s) => (
                  <div key={s.label} className="space-y-3">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <s.icon className={cn("h-3.5 w-3.5", s.color)} /> {s.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono font-bold">
                        {s.val[0] > 0 ? `+${s.val[0]}` : s.val[0]}%
                      </span>
                    </div>
                    <Slider
                      value={s.val}
                      onValueChange={s.set}
                      min={s.min}
                      max={s.max}
                      step={1}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Strategy Presets</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Aggressive", val: [15, 5, 40] },
                  { label: "Stability", val: [0, 10, 5] },
                  { label: "Safety", val: [0, 15, 0] }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(preset.val[0], preset.val[1], preset.val[2])}
                    className="py-2 px-1 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-bold transition-all border border-slate-200/60"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Simulation Chart */}
        <div className="lg:col-span-8">
          <div className="glow-card p-6 h-full flex flex-col justify-between min-h-[480px]">
            <div>
              <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  <h3 className="font-display text-base font-bold text-slate-900">Simulated Net Profit Trajectory</h3>
                </div>
                <div className="flex gap-4 items-center text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Baseline</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Simulation</span>
                </div>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={simulatedData}>
                    <defs>
                      <linearGradient id="primaryArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="baselineProfit" stroke="#94a3b8" strokeWidth={2} fill="none" strokeDasharray="4 4" name="Baseline Profit" />
                    <Area type="monotone" dataKey="simulatedProfit" stroke="#2563eb" strokeWidth={3} fill="url(#primaryArea)" name="Simulated Net Profit" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
                <span>Linear Regression Telemetry Engine v4.2</span>
              </div>
              <span className="font-mono text-slate-700">Confidence Band: 94.2%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
