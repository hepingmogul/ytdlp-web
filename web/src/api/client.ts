import type {
  InviteItem,
  ParseResult,
  SettingsInfo,
  TaskItem,
  TokenPair,
  User,
} from "./types";

const ACCESS = "luodai.access";
const REFRESH = "luodai.refresh";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS);
}

export function setTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS, tokens.access_token);
  localStorage.setItem(REFRESH, tokens.refresh_token);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

function detailToText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: string }).msg);
        }
        return JSON.stringify(item);
      })
      .join("；");
  }
  return "请求失败";
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    return detailToText(data.detail);
  } catch {
    return res.statusText || "请求失败";
  }
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH);
  if (!refresh) return false;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  setTokens((await res.json()) as TokenPair);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && retry && localStorage.getItem(REFRESH)) {
    const ok = await tryRefresh();
    if (ok) return api<T>(path, init, false);
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const authApi = {
  register: (body: { username: string; password: string; invite_code?: string }) =>
    api<TokenPair>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    api<TokenPair>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => api<User>("/api/auth/me"),
};

export const parseApi = {
  parse: (url: string) =>
    api<ParseResult>("/api/parse", { method: "POST", body: JSON.stringify({ url }) }),
};

export type CreateTaskBody = {
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  extractor?: string | null;
  format_id?: string | null;
  audio_only?: boolean;
  audio_format?: "mp3" | "m4a" | "opus";
  write_subs?: boolean;
  write_auto_subs?: boolean;
  sub_langs?: string[];
  proxy?: string | null;
  entries?: { url: string; title?: string | null; thumbnail?: string | null }[];
};

export const taskApi = {
  list: () => api<{ items: TaskItem[] }>("/api/tasks"),
  get: (id: string) => api<TaskItem>(`/api/tasks/${id}`),
  children: (id: string) => api<{ items: TaskItem[] }>(`/api/tasks/${id}/children`),
  create: (body: CreateTaskBody) =>
    api<TaskItem>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
  cancel: (id: string) => api<TaskItem>(`/api/tasks/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => api<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
};

export const settingsApi = {
  get: () => api<SettingsInfo>("/api/settings"),
  update: (body: Partial<Pick<SettingsInfo, "proxy" | "max_concurrent" | "default_format">>) =>
    api<SettingsInfo>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  uploadCookies: async (file: File) => {
    const data = new FormData();
    data.append("file", file);
    return api<{ has_cookies: boolean }>("/api/settings/cookies", { method: "POST", body: data });
  },
  deleteCookies: () => api<{ has_cookies: boolean }>("/api/settings/cookies", { method: "DELETE" }),
};

export const adminApi = {
  invites: () => api<InviteItem[]>("/api/admin/invites"),
  createInvite: () => api<InviteItem>("/api/admin/invites", { method: "POST" }),
};

export async function downloadTaskFile(taskId: string, name?: string): Promise<void> {
  const query = name ? `?name=${encodeURIComponent(name)}` : "";
  const token = getAccessToken();
  const res = await fetch(`/api/tasks/${taskId}/file${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const disp = res.headers.get("content-disposition") || "";
  const matched = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(disp);
  const filename = name || decodeURIComponent(matched?.[1] || "download");
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
