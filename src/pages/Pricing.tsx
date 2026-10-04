import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import {
  fetchPricing,
  fetchProducts,
  generatePricing,
  recordPriceObservation,
  approvePricing,
  rejectPricing,
  type Product,
  type PricingRecommendation,
} from "@/lib/api";
import { useRole } from "@/contexts/RoleContext";
import { useRealtime } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, X, Loader2, Sparkles, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type StatusMeta = { label: string; className: string; icon: typeof Check };

const STATUS_META: Record<PricingRecommendation["status"], StatusMeta> = {
  pending: {
    label: "Awaiting analyst approval",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: Clock,
  },
  approved: {
    label: "Approved & applied",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    icon: Check,
  },
  applied: {
    label: "Applied",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    icon: Check,
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/15 text-destructive border-destructive/30",
    icon: X,
  },
};

export default function Pricing() {
  const { role } = useRole();
  const isAnalyst = role === "analyst";

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recs, setRecs] = useState<PricingRecommendation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recording, setRecording] = useState(false);
  const [skipped, setSkipped] = useState<Array<{ productId: string; product: string; reason: string }>>([]);
  const [observation, setObservation] = useState({
    productId: "",
    price: "",
    unitsSold: "",
    periodStart: "",
    periodEnd: "",
  });

  const canGenerate = role === "owner" || role === "manager";

  useEffect(() => {
    if (!canGenerate) return;
    fetchProducts().then((items) => {
      setProducts(items);
      setObservation((current) => ({ ...current, productId: current.productId || items[0]?.id || "" }));
    }).catch(() => toast.error("Failed to load products for price observations"));
  }, [canGenerate]);

  const load = useCallback(async () => {
    try {
      // Analyst reviews the pending queue; owner/manager see the full history
      // of what's been requested and decided.
      const data = await fetchPricing(isAnalyst ? "pending" : undefined);
      setRecs(data);
    } catch {
      toast.error("Failed to load pricing recommendations");
    } finally {
      setLoading(false);
    }
  }, [isAnalyst]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Refresh when another session generates/approves/rejects.
  useRealtime("pricing", load);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { suggestions, model_used, skipped: notEstimated } = await generatePricing();
      setSkipped(notEstimated || []);
      toast.success(
        suggestions.length
          ? `${suggestions.length} suggestion(s) generated (${model_used})`
          : "No recommendation supported by the available price observations"
      );
      await load();
    } catch {
      toast.error("Failed to generate suggestions");
    } finally {
      setGenerating(false);
    }
  };

  const handleRecordObservation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRecording(true);
    try {
      await recordPriceObservation({
        product_id: observation.productId,
        price: Number(observation.price),
        units_sold: Number(observation.unitsSold),
        period_start: observation.periodStart,
        period_end: observation.periodEnd,
      });
      setObservation((current) => ({ ...current, price: "", unitsSold: "", periodStart: "", periodEnd: "" }));
      toast.success("Price observation recorded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record observation");
    } finally {
      setRecording(false);
    }
  };

  const handleApprove = async (rec: PricingRecommendation) => {
    setBusyId(rec.id);
    try {
      await approvePricing(rec.id);
      toast.success(`Approved — ${rec.product} price applied`, {
        description: `$${rec.currentPrice.toFixed(2)} → $${rec.suggestedPrice.toFixed(2)}`,
      });
      await load();
    } catch {
      toast.error("Failed to approve");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (rec: PricingRecommendation) => {
    setBusyId(rec.id);
    try {
      await rejectPricing(rec.id);
      toast.info(`Rejected suggestion for ${rec.product}`);
      await load();
    } catch {
      toast.error("Failed to reject");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Dynamic Pricing Engine</h2>
            <p className="text-sm text-muted-foreground mt-1">
            {isAnalyst
              ? "Review price tests based on observed price and unit sales."
              : "Record comparable price periods; supported tests go to an analyst for approval."}
          </p>
        </div>
        {canGenerate && (
          <Button onClick={handleGenerate} disabled={generating} className="gap-2 self-start">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Estimating…" : "Evaluate Price Tests"}
          </Button>
        )}
      </div>

      {canGenerate && (
        <form onSubmit={handleRecordObservation} className="glow-card p-5 space-y-4">
          <div>
            <h3 className="font-display text-base font-semibold text-foreground">Observed price and demand</h3>
            <p className="text-xs text-muted-foreground mt-1">Enter units sold at one price over a comparable date range. Recommendations require multiple periods and price points.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="text-xs font-medium text-muted-foreground">Product
              <select required value={observation.productId} onChange={(event) => setObservation({ ...observation, productId: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">Price
              <input required min="0.01" step="0.01" type="number" value={observation.price} onChange={(event) => setObservation({ ...observation, price: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="text-xs font-medium text-muted-foreground">Units sold
              <input required min="0" step="1" type="number" value={observation.unitsSold} onChange={(event) => setObservation({ ...observation, unitsSold: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="text-xs font-medium text-muted-foreground">Period start
              <input required type="date" value={observation.periodStart} onChange={(event) => setObservation({ ...observation, periodStart: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="text-xs font-medium text-muted-foreground">Period end
              <input required type="date" min={observation.periodStart || undefined} value={observation.periodEnd} onChange={(event) => setObservation({ ...observation, periodEnd: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" />
            </label>
          </div>
          <Button type="submit" disabled={recording || !products.length} variant="outline" size="sm" className="gap-2">
            {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record observation
          </Button>
        </form>
      )}

      {/* Role banner */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border p-4",
          isAnalyst
            ? "bg-primary/10 border-primary/20 text-primary"
            : "bg-amber-500/10 border-amber-500/20 text-amber-400"
        )}
      >
        <ShieldCheck className="h-5 w-5 shrink-0" />
        <p className="text-sm">
          {isAnalyst
            ? "You are reviewing pending recommendations. Approve to apply the suggested price, or reject to discard it."
            : "Evidence-backed price tests are sent to the Financial Analyst for approval. Prices change only once approved."}
        </p>
      </div>

      {loading ? (
        <div className="glow-card p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        </div>
      ) : recs.length === 0 ? (
        <div className="glow-card p-12 text-center">
          <p className="text-muted-foreground italic">
            {isAnalyst
              ? "No pending recommendations to review. Generate suggestions to populate the queue."
              : "No supported recommendations yet. Record several comparable price/quantity periods before evaluation."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {recs.map((rec, i) => {
              const meta = STATUS_META[rec.status];
              const StatusIcon = meta.icon;
              const isIncrease = rec.suggestedPrice >= rec.currentPrice;
              const busy = busyId === rec.id;
              return (
                <motion.div
                  key={rec.id}
                  layout
                  className="glow-card p-5 space-y-4"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-semibold text-foreground">{rec.product}</h3>
                      <p className="insight-text mt-1">{rec.reason}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border",
                        meta.className
                      )}
                    >
                      <StatusIcon className="h-3 w-3" /> {meta.label}
                    </span>
                  </div>

                  {/* Price display */}
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-accent px-3 py-2 text-center">
                      <p className="text-xs text-muted-foreground">Current</p>
                      <p className="font-display text-lg font-bold text-foreground">
                        ${rec.currentPrice.toFixed(2)}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-primary" />
                    <div className="rounded-lg px-3 py-2 text-center border bg-primary/10 border-primary/20">
                      <p className="text-xs text-primary">Suggested</p>
                      <p className={cn("font-display text-lg font-bold", isIncrease ? "text-emerald-400" : "text-amber-400")}>
                        ${rec.suggestedPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-slate-500 font-medium">Fit R²: </span>
                      <span
                        className={cn(
                          "font-bold font-mono",
                          (rec.modelFitR2 ?? 0) >= 0.8 ? "text-emerald-600" : (rec.modelFitR2 ?? 0) >= 0.5 ? "text-blue-600" : "text-amber-600"
                        )}
                      >
                        {rec.modelFitR2 != null ? rec.modelFitR2.toFixed(2) : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Elasticity ($E_d$): </span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {rec.priceElasticity !== undefined && rec.priceElasticity !== null ? `${rec.priceElasticity.toFixed(2)} (${rec.elasticityCategory})` : "Not estimated"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Impact: </span>
                      <span className="text-slate-900 font-bold">{rec.expectedImpact}</span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Observations: {rec.sampleCount ?? "N/A"} · Log-log fit R²: {rec.modelFitR2 != null ? rec.modelFitR2.toFixed(2) : "N/A"}. Observational estimate; validate with a controlled test.
                  </p>

                  {rec.projectedRevenue && (
                    <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Projected Monthly Revenue:</span>
                      <span className="font-mono font-bold text-emerald-700">${rec.projectedRevenue.toLocaleString()} / mo</span>
                    </div>
                  )}

                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <motion.div
                      className={cn("h-full rounded-full", (rec.modelFitR2 ?? 0) >= 0.8 ? "bg-emerald-500" : "bg-blue-500")}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(0, Math.min(100, (rec.modelFitR2 ?? 0) * 100))}%` }}
                      transition={{ duration: 0.6, delay: i * 0.1 }}
                    />
                  </div>

                  {/* Analyst-only approval actions on pending items */}
                  {isAnalyst && rec.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(rec)}
                        disabled={busy}
                        size="sm"
                        className="flex-1 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleReject(rec)}
                        disabled={busy}
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Products without supported recommendations</h3>
          {skipped.map((item) => <p key={item.productId} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{item.product}:</span> {item.reason}</p>)}
        </div>
      )}
    </div>
  );
}
