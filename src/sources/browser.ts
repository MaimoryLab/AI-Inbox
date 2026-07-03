import { createHash } from "node:crypto";
import type { SourceKind } from "../contracts.js";
import type { Database } from "../db/index.js";

export interface BrowserSessionInput {
  id?: string;
  path?: string;
  messages: Array<{ role?: string; text: string; createdAt?: string }>;
}

type BrowserMessageLike = { role?: string; text: string };
type BrowserObservationLike = BrowserMessageLike & { source?: SourceKind; sessionId: string };

const MAX_BROWSER_MESSAGES = 160;
const ROLES = new Set(["user", "assistant", "system", "tool", "unknown"]);

export function validateBrowserSessionInput(input: unknown): { ok: true; input: BrowserSessionInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "invalid_body" };
  }
  const record = input as Record<string, unknown>;
  if (record.conversation !== undefined || record.page !== undefined) {
    return validateBrowserCaptureInput(record);
  }
  if (record.id !== undefined && !nonEmptyString(record.id)) return { ok: false, error: "invalid_id" };
  if (record.path !== undefined && !nonEmptyString(record.path)) return { ok: false, error: "invalid_path" };
  const messages = validateMessages(record.messages);
  if (!messages.ok) return messages;

  return {
    ok: true,
    input: {
      id: typeof record.id === "string" ? record.id.trim() : undefined,
      path: typeof record.path === "string" ? record.path.trim() : undefined,
      messages: messages.messages
    }
  };
}

export function ingestBrowserSession(db: Database, input: BrowserSessionInput) {
  const source: SourceKind = "browser";
  const sessionId = input.id ?? hash(JSON.stringify(input.messages));
  const path = input.path ?? "browser";
  const updatedAt = new Date().toISOString();

  db.prepare(
    "INSERT OR REPLACE INTO sessions (id, source, path, updated_at) VALUES (?, ?, ?, ?)"
  ).run(sessionId, source, path, updatedAt);
  db.prepare("DELETE FROM observations WHERE session_id = ?").run(sessionId);

  for (const [index, message] of input.messages.entries()) {
    db.prepare(
      "INSERT OR REPLACE INTO observations (id, session_id, source, role, text, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      hash(sessionId, String(index)),
      sessionId,
      source,
      message.role ?? "unknown",
      message.text,
      message.createdAt ?? updatedAt
    );
  }

  return { sessionId, observations: input.messages.length };
}

export function dedupeBrowserMessages<T extends BrowserMessageLike>(messages: T[]): T[] {
  const kept: T[] = [];
  for (const message of messages) {
    const duplicateIndex = kept.findIndex((existing) => isDuplicateBrowserMessage(existing, message));
    if (duplicateIndex === -1) {
      kept.push(message);
      continue;
    }
    if (isUnknownRole(kept[duplicateIndex]) && !isUnknownRole(message)) {
      kept.splice(duplicateIndex, 1);
      kept.push(message);
    }
  }
  return kept;
}

export function dedupeBrowserObservations<T extends BrowserObservationLike>(observations: T[]): T[] {
  const browserSessions = new Map<string, T[]>();
  for (const observation of observations) {
    if (observation.source !== "browser") continue;
    const group = browserSessions.get(observation.sessionId) ?? [];
    group.push(observation);
    browserSessions.set(observation.sessionId, group);
  }
  const keptIds = new Set(Array.from(browserSessions.values()).flatMap((group) => dedupeBrowserMessages(group)));
  return observations.filter((observation) => observation.source !== "browser" || keptIds.has(observation));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateBrowserCaptureInput(record: Record<string, unknown>): { ok: true; input: BrowserSessionInput } | { ok: false; error: string } {
  const page = record.page;
  const conversation = record.conversation;
  if (!page || typeof page !== "object" || Array.isArray(page)) return { ok: false, error: "invalid_page" };
  if (!conversation || typeof conversation !== "object" || Array.isArray(conversation)) return { ok: false, error: "invalid_conversation" };
  const pageRecord = page as Record<string, unknown>;
  const conversationRecord = conversation as Record<string, unknown>;
  if (!nonEmptyString(pageRecord.url)) return { ok: false, error: "invalid_page_url" };
  if (!nonEmptyString(conversationRecord.provider)) return { ok: false, error: "invalid_provider" };
  if (record.capturedAt !== undefined && (!nonEmptyString(record.capturedAt) || Number.isNaN(Date.parse(record.capturedAt)))) {
    return { ok: false, error: "invalid_captured_at" };
  }
  const messages = validateMessages(conversationRecord.turns, typeof record.capturedAt === "string" ? record.capturedAt : undefined);
  if (!messages.ok) return messages;
  const provider = conversationRecord.provider.trim();
  const url = pageRecord.url.trim();
  return {
    ok: true,
    input: {
      id: hash("browser", provider, url),
      path: url,
      messages: messages.messages
    }
  };
}

function validateMessages(value: unknown, fallbackCreatedAt?: string): { ok: true; messages: BrowserSessionInput["messages"] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, error: "invalid_messages" };
  if (value.length > MAX_BROWSER_MESSAGES) return { ok: false, error: "too_many_messages" };
  const messages = [];
  for (const message of value) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return { ok: false, error: "invalid_message" };
    }
    const item = message as Record<string, unknown>;
    if (!nonEmptyString(item.text)) return { ok: false, error: "invalid_message_text" };
    if (item.role !== undefined && !nonEmptyString(item.role)) return { ok: false, error: "invalid_message_role" };
    if (item.createdAt !== undefined && (!nonEmptyString(item.createdAt) || Number.isNaN(Date.parse(item.createdAt)))) {
      return { ok: false, error: "invalid_message_created_at" };
    }
    const role = typeof item.role === "string" ? normalizeRole(item.role) : undefined;
    messages.push({
      role,
      text: item.text.trim(),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : fallbackCreatedAt
    });
  }
  return { ok: true, messages: dedupeBrowserMessages(messages) };
}

function normalizeRole(role: string): string {
  const trimmed = role.trim().toLowerCase();
  return ROLES.has(trimmed) ? trimmed : "unknown";
}

function isDuplicateBrowserMessage(first: BrowserMessageLike, second: BrowserMessageLike): boolean {
  const firstText = comparableText(first.text);
  const secondText = comparableText(second.text);
  if (firstText === secondText) return true;
  if (!isUnknownRole(first) && !isUnknownRole(second)) return false;
  return firstText.includes(secondText) || secondText.includes(firstText);
}

function comparableText(text: string): string {
  return text.replace(/^(you said|gemini said|chatgpt said|claude said|assistant said)\s+/iu, "").trim();
}

function isUnknownRole(message: BrowserMessageLike): boolean {
  return !message.role || message.role === "unknown";
}

function hash(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\0")).digest("hex");
}
