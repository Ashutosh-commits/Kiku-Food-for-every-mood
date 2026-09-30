export class KikuApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 500, code = "API_ERROR") {
    super(message);
    this.name = "KikuApiError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const ASSISTANT_REQUEST_TIMEOUT_MS = 75_000;
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

function apiUrl(path: string) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function request<T>(path: string, options: RequestInit = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(apiUrl(path), { ...options, headers, credentials: "include", signal: controller.signal });
  const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || `Request failed with ${response.status}.`;
      const error = new KikuApiError(message, response.status, payload?.error?.code || "API_ERROR");
      throw error;
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new KikuApiError("Kiku took too long to respond. Please try again.", 408, "REQUEST_TIMEOUT");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export type ApiUser = { id: string; name: string; email: string; avatar: string | null; provider: string; emailVerified: boolean };

export const api = {
  me: () => request<{ user: ApiUser | null }>("/api/auth/me"),
  register: (body: { name: string; email: string; password: string }) => request<{ user: ApiUser; verificationRequired: boolean }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) => request<{ user: ApiUser }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  google: (credential: string) => request<{ user: ApiUser }>("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  verifyEmail: (token: string) => request<{ user: ApiUser }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  forgotPassword: (email: string) => request<{ ok: true }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ user: ApiUser }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  profile: () => request<{ user: ApiUser }>("/api/me"),
  updateProfile: (body: { name?: string; avatar?: string | null }) => request<{ user: ApiUser }>("/api/me", { method: "PUT", body: JSON.stringify(body) }),
  getPreferences: () => request<{ preferences: any }>("/api/preferences"),
  updatePreferences: (body: any) => request<{ preferences: any }>("/api/preferences", { method: "PUT", body: JSON.stringify(body) }),
  getSaved: () => request<{ items: any[] }>("/api/saved"),
  toggleSaved: (body: any) => request<{ saved: boolean }>("/api/saved/toggle", { method: "POST", body: JSON.stringify(body) }),
  removeSaved: (entityType: string, entityKey: string) => request<{ ok: true }>(`/api/saved/${encodeURIComponent(entityType)}/${encodeURIComponent(entityKey)}`, { method: "DELETE" }),
  activity: (body: any) => request<{ event: any }>("/api/activity", { method: "POST", body: JSON.stringify(body) }),
  insights: () => request<any>("/api/insights"),
  regionRefresh: (pincode: string, force = false) => request<{ pincode: string; status: "ready" | "empty" | "scraping" | "queued" | "stale" | "error"; dishesCount?: number; restaurantsCount?: number; warning?: string | null }>("/api/region/refresh", { method: "POST", body: JSON.stringify({ pincode, force }) }),
  regionStatus: (pincode: string) => request<{ pincode: string; status: "idle" | "scraping" | "queued" | "ready" | "empty" | "stale" | "error"; dishes?: any[]; restaurants?: any[]; dishesCount?: number; restaurantsCount?: number; checkedAt?: string | null; error?: string | null; warning?: string | null }>(`/api/region/${encodeURIComponent(pincode)}`),
  discover: (q = "", filters: { dietary?: string[]; allergies?: string[]; allergenFreeOnly?: boolean; pincode?: string } = {}) => request<{ dishes: any[]; restaurants: any[] }>(`/api/discover?${new URLSearchParams({
    ...(q ? { q } : {}),
    ...(filters.pincode ? { pincode: filters.pincode } : {}),
    ...(filters.dietary?.length ? { dietary: filters.dietary.join(",") } : {}),
    ...(filters.allergies?.length ? { allergies: filters.allergies.join(",") } : {}),
    ...(filters.allergenFreeOnly ? { allergenFreeOnly: "true" } : {}),
  }).toString()}`),
  search: (q: string, filters: { dietary?: string[]; allergies?: string[]; allergenFreeOnly?: boolean; pincode?: string } = {}) => request<{ dishes: any[]; restaurants: any[] }>(`/api/search?${new URLSearchParams({
    q,
    ...(filters.pincode ? { pincode: filters.pincode } : {}),
    ...(filters.dietary?.length ? { dietary: filters.dietary.join(",") } : {}),
    ...(filters.allergies?.length ? { allergies: filters.allergies.join(",") } : {}),
    ...(filters.allergenFreeOnly ? { allergenFreeOnly: "true" } : {}),
  }).toString()}`),
  recommendations: (body: any) => request<{ recommendations: any[] }>("/api/recommendations", { method: "POST", body: JSON.stringify(body) }),
  recipes: (q = "") => request<{ source: string; provider?: string; attribution?: string; recipes: any[]; error?: string }>(`/api/recipes${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  recipe: (id: string) => request<{ recipe: any }>(`/api/recipes/${encodeURIComponent(id)}`),
  substituteRecipe: (body: { recipe: any; ingredient: string; substitute: string }) => request<any>("/api/recipes/substitute", { method: "POST", body: JSON.stringify(body) }),
  enrichRecipe: (recipe: any) => request<any>("/api/recipes/enrich", { method: "POST", body: JSON.stringify({ recipe }) }),
  compare: (body: any, signal?: AbortSignal) => request<any>("/api/compare", { method: "POST", body: JSON.stringify(body), signal }),
  dishDescription: (body: { name: string; restaurant?: string; category?: string; cuisine?: string; provider?: string; sourceDescription?: string; city?: string; pincode?: string | null }) => request<{ description: string; generated: boolean; provider: string }>("/api/dish-description", { method: "POST", body: JSON.stringify(body) }),
  assistant: (body: { message: string; conversationId?: string | null; recipeContext?: any | null }) => request<{ conversationId: string; message: string; data: any; usedModel: boolean; aiProvider?: "cloudflare" | "deterministic" }>("/api/assistant/message", { method: "POST", body: JSON.stringify(body) }, ASSISTANT_REQUEST_TIMEOUT_MS),
  assistantConversations: () => request<{ conversations: Array<{ id: string; title: string; createdAt: string; updatedAt: string }> }>("/api/assistant/conversations"),
  assistantMessages: (conversationId: string) => request<{ messages: Array<{ role: "user" | "assistant"; content: string; data: any; createdAt: string }> }>(`/api/assistant/conversations/${encodeURIComponent(conversationId)}/messages`),
  deleteAccount: () => request<{ ok: true }>("/api/account", { method: "DELETE" }),
};

