import { useExecutiveInsights } from "@/hooks/useExecutiveInsights";
import { AlertCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Insights() {
  const { insights, loading, error, refresh } = useExecutiveInsights();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Executive Briefing</h2>
          <p className="text-sm text-muted-foreground mt-1">Model-generated findings grounded in your company's transaction and product data.</p>
        </div>
        <Button onClick={() => void refresh()} disabled={loading} variant="outline" size="sm" className="gap-2 self-start">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Regenerate brief
        </Button>
      </div>

      {loading ? (
        <div className="glow-card flex items-center gap-3 p-8 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" />Analyzing company data…</div>
      ) : error ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0" /><p>{error}</p></div>
      ) : insights ? (
        <div className="space-y-6">
          <section className="glow-card border-l-4 border-l-primary p-6">
            <div className="flex items-center gap-2 text-primary mb-3"><Sparkles className="h-5 w-5" /><h3 className="font-display text-base font-semibold">Executive summary</h3></div>
            <p className="text-sm leading-relaxed text-foreground">{insights.executive_summary.text}</p>
            <p className="mt-3 text-xs text-muted-foreground">Sources: {insights.executive_summary.source_ids.map((id) => insights.sources.find((source) => source.id === id)?.label || id).join(" · ")}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">Generated {new Date(insights.generated_at).toLocaleString()} · {insights.model_used}</p>
          </section>

          <section className="space-y-4">
            <h3 className="font-display text-base font-semibold text-foreground">Findings and explanations</h3>
            {insights.insights.map((item) => (
              <article key={item.title} className="glow-card p-5">
                <h4 className="font-semibold text-foreground">{item.title}</h4>
                <p className="mt-2 text-sm font-medium text-foreground">{item.finding}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.explanation}</p>
                <p className="mt-3 text-sm"><span className="font-semibold text-primary">Recommended action:</span> {item.recommended_action}</p>
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  Data sources: {item.source_ids.map((id) => `${id} ${insights.sources.find((source) => source.id === id)?.label || ""}`).join(" · ")}
                </p>
              </article>
            ))}
          </section>

          <details className="glow-card p-5">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Inspect source data</summary>
            <div className="mt-4 space-y-4">
              {insights.sources.map((source) => (
                <section key={source.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                  <h4 className="text-sm font-medium text-foreground">{source.id} · {source.label}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{source.description}</p>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">{JSON.stringify(source.values, null, 2)}</pre>
                </section>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
