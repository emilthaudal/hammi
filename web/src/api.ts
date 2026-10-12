import type { ActionType, PetView, Reaction } from "./types";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type RequestOptions = { method?: string; body?: unknown; token?: string | null };

async function request<T>(path: string, { method = "GET", body, token }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  login: (passcode: string, name: string) =>
    request<{ token: string; name: string }>("/api/login", { method: "POST", body: { passcode, name } }),

  state: (token: string) => request<PetView>("/api/state", { token }),

  action: (token: string, type: ActionType, won?: number) =>
    request<{ state: PetView; reaction: Reaction }>("/api/action", {
      method: "POST",
      token,
      body: won === undefined ? { type } : { type, won },
    }),

  rename: (token: string, name: string) =>
    request<PetView>("/api/rename", { method: "POST", token, body: { name } }),

  pushKey: () => request<{ publicKey: string }>("/api/push/key"),

  subscribe: (token: string, subscription: PushSubscriptionJSON) =>
    request<void>("/api/push/subscribe", { method: "POST", token, body: subscription }),

  unsubscribe: (token: string, endpoint: string) =>
    request<void>("/api/push/unsubscribe", { method: "POST", token, body: { endpoint } }),
};
