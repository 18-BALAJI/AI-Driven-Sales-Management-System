/**
 * REST API client — replaces Supabase SDK.
 * All data operations go through the Python Flask backend.
 */

const DEFAULT_API_BASE = import.meta.env.DEV
  ? "http://localhost:5000"
  : window.location.origin;

const API_BASE = (import.meta.env.VITE_API_URL || DEFAULT_API_BASE).replace(/\/$/, "");

// ── Auth token ────────────────────────────────────────────────────────────--
// The login flow stores a signed token here; apiFetch attaches it so the
// backend can resolve the current user.

const TOKEN_KEY = "auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ── Helper ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "API request failed");
  }
  return res.json();
}

// ── Transactions ────────────────────────────────────────────────────────────

export type Transaction = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: string;
  created_at?: string;
};

export async function fetchTransactions(): Promise<Transaction[]> {
  return apiFetch<Transaction[]>("/api/transactions");
}

export async function createTransaction(data: {
  date: string;
  description: string;
  category: string;
  amount: number;
  type: string;
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiFetch(`/api/transactions/${id}`, { method: "DELETE" });
}

// ── Products ────────────────────────────────────────────────────────────────

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  units_sold: number;
  revenue: number;
  trend: string;
  cluster: string;
  created_at?: string;
};

export async function fetchProducts(): Promise<Product[]> {
  return apiFetch<Product[]>("/api/products");
}

export async function createProduct(data: {
  name: string;
  category: string;
  price: number;
  units_sold?: number;
  revenue?: number;
  trend?: string;
  cluster?: string;
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProduct(
  id: string,
  data: Partial<Product>
): Promise<void> {
  await apiFetch(`/api/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Chat ────────────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSession = {
  session_id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export async function fetchChatHistory(
  sessionId = "default"
): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(
    `/api/chat/history?session_id=${encodeURIComponent(sessionId)}`
  );
}

export async function fetchChatSessions(): Promise<ChatSession[]> {
  return apiFetch<ChatSession[]>("/api/chat/sessions");
}


export async function saveChatMessage(
  role: string,
  content: string,
  sessionId = "default"
): Promise<void> {
  await apiFetch("/api/chat/save", {
    method: "POST",
    body: JSON.stringify({ role, content, session_id: sessionId }),
  });
}

export async function clearChatHistory(
  sessionId = "default"
): Promise<void> {
  await apiFetch("/api/chat/clear", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function getChatStreamUrl(): string {
  return `${API_BASE}/api/chat`;
}

// ── Machine Learning Endpoints ──────────────────────────────────────────────

export type ForecastResponse = {
  forecasts: Array<{
    period: string;
    predicted_revenue: number;
    predicted_expenses: number;
    predicted_profit?: number;
    predicted_revenue_lower: number | null;
    predicted_revenue_upper: number | null;
    predicted_expenses_lower?: number | null;
    predicted_expenses_upper?: number | null;
    profit_margin?: number;
    interval_coverage: number | null;
  }>;
  daily_forecast?: number[];
  model_used?: string;
  interval_method?: string;
  metrics?: {
    revenue?: { mae: number | null; rmse: number | null; mape: number | null; sample_count: number };
    expenses?: { mae: number | null; rmse: number | null; mape: number | null; sample_count: number };
  };
  historical?: {
    months: string[];
    revenues: number[];
    expenses: number[];
  };
};

export async function fetchForecast(): Promise<ForecastResponse> {
  return apiFetch<ForecastResponse>("/api/forecast", { method: "POST" });
}

export type DataSource = {
  id: string;
  label: string;
  description: string;
  values: Record<string, unknown>;
};

export type BusinessContext = {
  generated_at: string;
  metrics: {
    transaction_count: number;
    revenue: number;
    expenses: number;
    net_profit: number;
    profit_margin_pct: number | null;
  };
  monthly: Array<{
    period: string;
    revenue: number;
    expenses: number;
    net: number;
    orders: number;
  }>;
  products: { product_count: number; top_products: Array<Record<string, unknown>> };
  sources: DataSource[];
};

export type ExecutiveInsights = {
  executive_summary: { text: string; source_ids: string[] };
  insights: Array<{
    title: string;
    finding: string;
    explanation: string;
    recommended_action: string;
    source_ids: string[];
  }>;
  sources: DataSource[];
  model_used: string;
  generated_at: string;
  data_window: BusinessContext["monthly"];
};

export async function fetchBusinessContext(): Promise<BusinessContext> {
  return apiFetch<BusinessContext>("/api/insights/context");
}

export async function generateExecutiveInsights(): Promise<ExecutiveInsights> {
  return apiFetch<ExecutiveInsights>("/api/insights/executive", { method: "POST" });
}

export type AnomalyResult = {
  anomalies: Array<{
    id: string;
    metric: string;
    value: number;
    expected: number;
    description: string;
    severity: "high" | "medium" | "low";
    type: "spike" | "drop" | "unusual";
    date: string;
    riskScore?: number;
    rootCause?: string;
    suggestedAction?: string;
    deviationPct?: number;
  }>;
  model_used: string;
};

export async function fetchAnomalies(): Promise<AnomalyResult> {
  return apiFetch<AnomalyResult>("/api/anomaly", { method: "POST" });
}

export type ClusterResponse = {
  clusters: Array<{
    id: string;
    cluster: string;
    explanation?: string;
    features?: {
      trend_signal: string;
      units_sold: number;
      catalog_average_units: number;
      relative_sales_index: number;
    };
  }>;
  model_used: string;
  segmentation_method?: string;
};

export async function runClustering(): Promise<ClusterResponse> {
  return apiFetch<ClusterResponse>("/api/clustering", { method: "POST" });
}



// ── Pricing (AI suggestions + Analyst approval workflow) ────────────────────

export type PricingRecommendation = {
  id: string;
  productId: string;
  product: string;
  currentPrice: number;
  suggestedPrice: number;
  reason: string;
  confidence: number;
  expectedImpact: string;
  priceElasticity?: number;
  elasticityCategory?: string;
  projectedUnits?: number;
  projectedRevenue?: number;
  modelFitR2?: number | null;
  sampleCount?: number | null;
  modelUsed?: string;
  status: "pending" | "approved" | "rejected" | "applied";
  createdAt?: string;
  reviewedAt?: string | null;
};

export async function generatePricing(): Promise<{
  suggestions: PricingRecommendation[];
  skipped: Array<{ productId: string; product: string; reason: string }>;
  model_used: string;
}> {
  return apiFetch("/api/pricing/generate", { method: "POST" });
}

export async function recordPriceObservation(data: {
  product_id: string;
  price: number;
  units_sold: number;
  period_start: string;
  period_end: string;
}): Promise<{ id: string }> {
  return apiFetch("/api/pricing/observations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchPricing(
  status?: string
): Promise<PricingRecommendation[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<PricingRecommendation[]>(`/api/pricing${q}`);
}

export async function approvePricing(id: string): Promise<void> {
  await apiFetch(`/api/pricing/${id}/approve`, { method: "POST" });
}

export async function rejectPricing(id: string): Promise<void> {
  await apiFetch(`/api/pricing/${id}/reject`, { method: "POST" });
}

// ── Tutorials ───────────────────────────────────────────────────────────────

export type Tutorial = {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  targetRole: "owner" | "manager" | "both";
  /** Optional per-language YouTube IDs; youtubeId is the default/fallback. */
  videoIds?: Record<string, string>;
  addedAt?: string;
};

export async function fetchTutorials(
  role?: "owner" | "manager"
): Promise<Tutorial[]> {
  const q = role ? `?role=${role}` : "";
  return apiFetch<Tutorial[]>(`/api/tutorials${q}`);
}

export async function createTutorial(data: {
  title: string;
  description?: string;
  youtubeId: string;
  targetRole: "owner" | "manager" | "both";
  videoIds?: Record<string, string>;
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/api/tutorials", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTutorial(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    youtubeId: string;
    targetRole: "owner" | "manager" | "both";
    videoIds: Record<string, string>;
  }>
): Promise<void> {
  await apiFetch(`/api/tutorials/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTutorial(id: string): Promise<void> {
  await apiFetch(`/api/tutorials/${id}`, { method: "DELETE" });
}

// ── Page Visibility (Analyst controls per-role page access) ──────────────────

export type PageVisibility = {
  pageUrl: string;
  role: "owner" | "manager";
  visible: boolean;
};

export async function fetchVisibility(
  role?: "owner" | "manager"
): Promise<PageVisibility[]> {
  const q = role ? `?role=${role}` : "";
  return apiFetch<PageVisibility[]>(`/api/visibility${q}`);
}

export async function setVisibility(
  pageUrl: string,
  role: "owner" | "manager",
  visible: boolean
): Promise<void> {
  await apiFetch("/api/visibility", {
    method: "PUT",
    body: JSON.stringify({ pageUrl, role, visible }),
  });
}

// ── Auth (login / register / current user) ───────────────────────────────────

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: "owner" | "manager" | "analyst";
  company_id?: string | null;
  avatarUrl?: string | null;
};

export type AuthResponse = { token: string; user: AuthUser; message?: string };

export type OTPRequestResponse = {
  success: boolean;
  message: string;
  cooldown: number;
  expiresIn: number;
  debugOtp?: string;
};

export async function requestOTP(identifier: string): Promise<OTPRequestResponse> {
  return apiFetch<OTPRequestResponse>("/api/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export async function verifyOTP(identifier: string, otp: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ identifier, otp }),
  });
}

export async function resendOTP(identifier: string): Promise<OTPRequestResponse> {
  return apiFetch<OTPRequestResponse>("/api/auth/resend-otp", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export async function logoutUser(): Promise<{ message: string }> {
  try {
    return await apiFetch<{ message: string }>("/api/auth/logout", {
      method: "POST",
    });
  } catch {
    return { message: "Logged out locally." };
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function registerUser(data: {
  name: string;
  email: string;
  phone?: string;
  password?: string;
  role: "owner" | "manager" | "analyst";
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const res = await apiFetch<{ user: AuthUser }>("/api/auth/me");
  return res.user;
}

export async function updateProfile(data: {
  name?: string;
  phone?: string;
  avatarUrl?: string | null;
  currentPassword?: string;
  newPassword?: string;
}): Promise<AuthUser> {
  const res = await apiFetch<{ user: AuthUser }>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.user;
}

// ── Industry Presets Generator ────────────────────────────────────────────────

export type IndustryPreset = { key: string; name: string };

export async function fetchPresets(): Promise<IndustryPreset[]> {
  return apiFetch<IndustryPreset[]>("/api/data/presets");
}

export async function switchPreset(preset: string): Promise<{ success: boolean; name: string }> {
  return apiFetch<{ success: boolean; name: string }>("/api/data/preset", {
    method: "POST",
    body: JSON.stringify({ preset }),
  });
}

// ── Re-export base for direct fetch usage ───────────────────────────────────
export { API_BASE };
