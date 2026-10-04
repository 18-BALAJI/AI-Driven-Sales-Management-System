import { motion } from "framer-motion";
import { useAnomalies } from "@/hooks/useAnomalies";
import { cn } from "@/lib/utils";
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const severityStyles: Record<string, string> = {
  high: "glow-card-alert animate-pulse-glow",
  medium: "glow-card border-amber-500/50",
  low: "glow-card",
};

const typeIcons: Record<string, any> = {
  spike: TrendingUp,
  drop: TrendingDown,
  unusual: Activity,
};

export default function Anomalies() {
  const { anomalies, modelUsed, loading, error, refresh } = useAnomalies();

  const handleRefresh = async () => {
    await refresh();
    toast.success("Anomaly detection re-executed!");
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse">Running AI pattern matching algorithms...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-3">
            Anomaly Detection
            <span className="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20 text-xs font-bold uppercase tracking-wider text-primary">
              {modelUsed === "isolation_forest" ? "Isolation Forest ML" : "Z-Score Analysis"}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">AI-identified unusual patterns and financial risks</p>
        </div>
        <Button onClick={handleRefresh} disabled={loading} variant="outline" className="gap-2 self-start">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Re-analyze
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : anomalies.length > 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-accent/50 p-3">
          <AlertTriangle className={cn("h-5 w-5 shrink-0", anomalies.some(a => a.severity === "high") ? "text-destructive" : "text-amber-500")} />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{anomalies.filter((a) => a.severity === "high").length} critical alert(s)</strong> require immediate attention.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4">
          <Activity className="h-5 w-5 text-emerald-500 shrink-0" />
          <p className="text-sm text-emerald-500">All financial patterns are within normal operational parameters. No anomalies detected.</p>
        </div>
      )}

      <div className="space-y-4">
        {anomalies.map((a, i) => {
          const Icon = typeIcons[a.type] || Activity;
          return (
            <motion.div
              key={a.id}
              className={cn(severityStyles[a.severity], "p-5")}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className={cn(
                  "rounded-lg p-2.5 shrink-0",
                  a.severity === "high" ? "bg-destructive/20" : "bg-accent",
                )}>
                  <Icon className={cn("h-5 w-5", a.severity === "high" ? "text-destructive" : "text-primary")} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-base font-semibold text-foreground">{a.metric}</h3>
                    <span className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wider",
                      a.severity === "high" && "bg-destructive/20 text-destructive",
                      a.severity === "medium" && "bg-amber-500/20 text-amber-500",
                      a.severity === "low" && "bg-accent text-muted-foreground",
                    )}>
                      {a.severity}
                    </span>
                    <span className="text-xs text-muted-foreground">{a.date}</span>
                  </div>
                  <p className="insight-text">{a.description}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100">
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200/60">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Root Cause Analysis</span>
                      <p className="text-xs text-slate-800 mt-0.5 font-medium">
                        {a.rootCause || "Unusual deviation detected against standard moving average."}
                      </p>
                    </div>

                    <div className="rounded-xl bg-blue-50 p-2.5 border border-blue-200/60">
                      <span className="block text-[11px] font-bold text-blue-600 uppercase tracking-wider">Recommended Action Plan</span>
                      <p className="text-xs text-blue-900 mt-0.5 font-medium">
                        {a.suggestedAction || "Audit recent ledger transactions and verify vendor invoices."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 mt-3 text-xs pt-2">
                    <div className="flex gap-6">
                      <div>
                        <span className="text-slate-500">Actual: </span>
                        <span className="font-bold text-slate-900 font-mono">${a.value.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Baseline: </span>
                        <span className="font-semibold text-slate-700 font-mono">${a.expected.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Deviation: </span>
                        <span className={cn("font-bold font-mono", a.type === "spike" ? "text-rose-600" : "text-blue-600")}>
                          {a.type === "drop" ? "-" : "+"}
                          {a.expected > 0 ? Math.abs(Math.round(((a.value - a.expected) / a.expected) * 100)) : 100}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-medium">Risk Score:</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-rose-100 text-rose-700">
                        {a.riskScore || 75} / 100
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

