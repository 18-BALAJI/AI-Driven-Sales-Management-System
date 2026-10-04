import { motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  variant?: "default" | "success" | "alert";
};

export function MetricCard({ label, value, change, changeType = "neutral", icon: Icon, variant = "default" }: MetricCardProps) {
  const cardClass = cn(
    variant === "success" && "glow-card-success",
    variant === "alert" && "glow-card-alert",
    variant === "default" && "glow-card",
  );

  return (
    <motion.div
      className={cn(cardClass, "p-5")}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="metric-label">{label}</p>
          <p className="metric-value text-foreground">{value}</p>
          {change && (
            <div className="inline-block">
              <span className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1",
                changeType === "positive" && "bg-emerald-50 text-emerald-600 border border-emerald-100",
                changeType === "negative" && "bg-rose-50 text-rose-600 border border-rose-100",
                changeType === "neutral" && "bg-slate-100 text-slate-600",
              )}>
                {change}
              </span>
            </div>
          )}

        </div>
        <div className="rounded-lg bg-accent p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </motion.div>
  );
}
