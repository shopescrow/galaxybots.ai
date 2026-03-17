const API_BASE = `${import.meta.env.BASE_URL}../api/bingolingo`.replace(/\/\//g, "/");

const GALAXYBOTS_LOGIN_URL = `${import.meta.env.BASE_URL}../`.replace(/\/\//g, "/") + "login";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  return headers;
}

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    window.location.href = GALAXYBOTS_LOGIN_URL;
    throw new Error("Authentication required — redirecting to login");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  getDashboardStats: () => request("/dashboard-stats"),
  getClients: () => request("/clients"),
  getClient: (id: number) => request(`/clients/${id}`),
  createClient: (data: { name: string; industry: string; website?: string; logoUrl?: string; tagline?: string }) =>
    request("/clients", { method: "POST", body: JSON.stringify(data) }),
  updateClient: (id: number, data: { name?: string; industry?: string; website?: string; logoUrl?: string; tagline?: string; autoContentEnabled?: boolean; defaultTone?: string }) =>
    request(`/clients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getClientApiKeys: (id: number) => request(`/clients/${id}/api-keys`),
  createApiKey: (clientId: number, label?: string) =>
    request(`/clients/${clientId}/api-keys`, { method: "POST", body: JSON.stringify({ label }) }),
  revokeApiKey: (id: number) => request(`/api-keys/${id}/revoke`, { method: "POST" }),
  generateContent: (data: { clientId: number; contentType: string; topic: string; tone?: string; keywords?: string[] }) =>
    request("/generate-internal", { method: "POST", body: JSON.stringify(data) }),
  getContent: (params?: { clientId?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.clientId) q.set("clientId", String(params.clientId));
    if (params?.status) q.set("status", params.status);
    return request(`/content?${q.toString()}`);
  },
  getContentById: (id: number) => request(`/content/${id}`),
  saveContent: (data: { clientId: number; type: string; title: string; slug?: string; body: string; metaDescription?: string; topic?: string; tone?: string; keywords?: string[]; status?: string }) =>
    request("/content", { method: "POST", body: JSON.stringify(data) }),
  updateContent: (id: number, data: { title?: string; body?: string; metaDescription?: string; status?: string; topic?: string; tone?: string; keywords?: string[] }) =>
    request(`/content/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  publishContent: (id: number) => request(`/content/${id}/publish`, { method: "POST" }),
  archiveContent: (id: number) => request(`/content/${id}/archive`, { method: "POST" }),
  deleteContent: (id: number) => request(`/content/${id}`, { method: "DELETE" }),
  getCalendar: (clientId: number) => request(`/clients/${clientId}/calendar`),
  getHub: (clientSlug: string) => request(`/hub/${clientSlug}`),
  getHubPost: (clientSlug: string, contentSlug: string) => request(`/hub/${clientSlug}/${contentSlug}`),
};
