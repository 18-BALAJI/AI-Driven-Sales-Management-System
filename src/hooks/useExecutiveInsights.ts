import { useCallback, useEffect, useState } from "react";
import { generateExecutiveInsights, type ExecutiveInsights } from "@/lib/api";

export function useExecutiveInsights() {
  const [insights, setInsights] = useState<ExecutiveInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInsights(await generateExecutiveInsights());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Executive insights are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { insights, loading, error, refresh };
}
