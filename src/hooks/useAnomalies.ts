import { useState, useEffect, useCallback } from "react";
import { fetchAnomalies } from "@/lib/api";

export type Anomaly = {
  id: string;
  date: string;
  type: "spike" | "drop" | "unusual";
  metric: string;
  description: string;
  severity: "high" | "medium" | "low";
  value: number;
  expected: number;
  riskScore?: number;
  rootCause?: string;
  suggestedAction?: string;
  deviationPct?: number;
};

export function useAnomalies() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [modelUsed, setModelUsed] = useState<string>("isolation_forest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAnomalies();
      setAnomalies(res.anomalies || []);
      setModelUsed(res.model_used || "unavailable");
    } catch (e) {
      setAnomalies([]);
      setModelUsed("unavailable");
      setError(e instanceof Error ? e.message : "Backend anomaly detection is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { anomalies, modelUsed, loading, error, refresh: fetchData };
}

