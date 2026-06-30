import { readLocale, userErrorText, type Locale } from "../i18n.js";

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(userFacingError(data?.error ?? data?.message ?? "Request failed"));
  }
  return data as T;
}

export function userFacingError(error: string): string {
  return userErrorText(error, readLocale());
}

export function localizedUserFacingError(error: string, locale: Locale): string {
  return userErrorText(error, locale);
}
