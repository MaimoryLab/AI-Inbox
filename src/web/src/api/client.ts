import { readLocale, userErrorText, type Locale } from "../i18n.js";

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = localToken();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["x-ai-inbox-token"] = token;
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(userFacingError(responseErrorCode(data)), response.status, data);
  }
  return data as T;
}

export function userFacingError(error: string): string {
  return userErrorText(error, readLocale());
}

export function localizedUserFacingError(error: string, locale: Locale): string {
  return userErrorText(error, locale);
}

function responseErrorCode(data: unknown): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return "Request failed";
}

export function localToken(): string {
  const existing = sessionStorage.getItem("ai-inbox-token");
  if (existing) return existing;
  const token = new URLSearchParams(location.hash.replace(/^#/, "")).get("token") ?? "";
  if (token) {
    sessionStorage.setItem("ai-inbox-token", token);
    history.replaceState(null, "", location.pathname + location.search);
  }
  return token;
}
