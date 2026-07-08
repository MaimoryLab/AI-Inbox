import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { Database } from "../db/index.js";
import type { ScanResult } from "./jsonl-source.js";

type CursorRole = "user" | "assistant";

interface CursorMessage {
  role: CursorRole;
  text: string;
  createdAt: string;
}

interface CursorConversation {
  nativeId: string;
  title?: string;
  messages: CursorMessage[];
  updatedAt?: string;
}

export function scanCursorSessions(db: Database, root: string): ScanResult {
  let scanned = 0;
  let observations = 0;
  let skipped = 0;
  const transcriptPaths = listCursorAgentTranscripts(root);
  const currentTranscriptPaths = new Set(transcriptPaths);
  for (const path of transcriptPaths) {
    const result = scanCursorAgentTranscript(db, path);
    scanned += result.scanned;
    observations += result.observations;
    skipped += result.skipped;
  }
  removeStaleCursorTranscriptSessions(db, root, currentTranscriptPaths);

  for (const path of listCursorDatabases(root)) {
    const stat = statSync(path);
    const checkpoint = db.prepare(
      "SELECT mtime_ms, size FROM scan_checkpoints WHERE source = ? AND path = ?"
    ).get("cursor", path) as { mtime_ms: number; size: number } | undefined;
    if (checkpoint?.mtime_ms === stat.mtimeMs && checkpoint.size === stat.size && !hasDirtyCursorSessionTitleForPath(db, path)) {
      skipped++;
      continue;
    }

    const conversations = readCursorConversations(path);
    const projectPath = cursorProjectPath(path);
    const sessionIds = new Set<string>();
    for (const conversation of conversations) {
      const sessionId = idFor("cursor", path, conversation.nativeId);
      sessionIds.add(sessionId);
      const title = cursorSessionTitle(conversation, path, projectPath);
      const updatedAt = conversation.updatedAt ?? new Date(stat.mtimeMs).toISOString();
      db.prepare(
        "INSERT OR REPLACE INTO sessions (id, source, path, title, project_path, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(sessionId, "cursor", path, title, projectPath, updatedAt);
      db.prepare("DELETE FROM observations WHERE session_id = ?").run(sessionId);
      for (const [index, message] of conversation.messages.entries()) {
        db.prepare(
          "INSERT OR REPLACE INTO observations (id, session_id, source, role, text, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(idFor("cursor-observation", sessionId, String(index)), sessionId, "cursor", message.role, message.text, message.createdAt);
        observations++;
      }
    }

    removeStaleCursorSessions(db, path, sessionIds);
    db.prepare(
      "INSERT OR REPLACE INTO scan_checkpoints (source, path, mtime_ms, size) VALUES (?, ?, ?, ?)"
    ).run("cursor", path, stat.mtimeMs, stat.size);
    scanned++;
  }
  return { source: "cursor", scanned, observations, skipped };
}

function listCursorAgentTranscripts(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith(".jsonl") ? [path] : [];
  if (basename(path) === "agent-transcripts") return listJsonlFiles(path);
  const direct = join(path, "agent-transcripts");
  if (existsSync(direct)) return listJsonlFiles(direct);
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const transcripts = join(path, entry.name, "agent-transcripts");
      return existsSync(transcripts) ? listJsonlFiles(transcripts) : [];
    });
}

function listJsonlFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) return listJsonlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [entryPath] : [];
  });
}

function scanCursorAgentTranscript(db: Database, path: string): ScanResult {
  const stat = statSync(path);
  const sessionId = idFor("cursor-agent", path);
  const checkpoint = db.prepare(
    "SELECT mtime_ms, size FROM scan_checkpoints WHERE source = ? AND path = ?"
  ).get("cursor", path) as { mtime_ms: number; size: number } | undefined;
  if (
    checkpoint?.mtime_ms === stat.mtimeMs &&
    checkpoint.size === stat.size &&
    !hasDirtyCursorTranscriptObservations(db, sessionId) &&
    !hasDirtyCursorSessionTitle(db, sessionId)
  ) {
    return { source: "cursor", scanned: 0, observations: 0, skipped: 1 };
  }

  const conversation = readCursorAgentTranscript(path, stat.mtimeMs);
  db.prepare("DELETE FROM observations WHERE session_id = ?").run(sessionId);
  if (!conversation) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    db.prepare("INSERT OR REPLACE INTO scan_checkpoints (source, path, mtime_ms, size) VALUES (?, ?, ?, ?)")
      .run("cursor", path, stat.mtimeMs, stat.size);
    return { source: "cursor", scanned: 1, observations: 0, skipped: 0 };
  }

  const projectPath = cursorAgentProjectPath(path);
  db.prepare(
    "INSERT OR REPLACE INTO sessions (id, source, path, title, project_path, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(sessionId, "cursor", path, cursorSessionTitle(conversation, path, projectPath), projectPath, conversation.updatedAt ?? new Date(stat.mtimeMs).toISOString());
  for (const [index, message] of conversation.messages.entries()) {
    db.prepare(
      "INSERT OR REPLACE INTO observations (id, session_id, source, role, text, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(idFor("cursor-agent-observation", sessionId, String(index)), sessionId, "cursor", message.role, message.text, message.createdAt);
  }
  db.prepare("INSERT OR REPLACE INTO scan_checkpoints (source, path, mtime_ms, size) VALUES (?, ?, ?, ?)")
    .run("cursor", path, stat.mtimeMs, stat.size);
  return { source: "cursor", scanned: 1, observations: conversation.messages.length, skipped: 0 };
}

function readCursorAgentTranscript(path: string, mtimeMs: number): CursorConversation | null {
  const records = readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        const value = JSON.parse(line) as unknown;
        const record = objectValue(value);
        return record ? [record] : [];
      } catch {
        return [];
      }
    });
  const messages = records
    .map(transcriptMessageFromRecord)
    .filter((message): message is CursorMessage => Boolean(message));
  if (messages.length === 0) return null;
  const datedMessages = messages.map((message, index) => ({
    ...message,
    createdAt: message.createdAt || new Date(mtimeMs - (messages.length - index - 1) * 1000).toISOString()
  }));
  return {
    nativeId: basename(path).replace(/\.jsonl$/u, ""),
    title: transcriptTitle(records),
    messages: datedMessages,
    updatedAt: new Date(mtimeMs).toISOString()
  };
}

function listCursorDatabases(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return basename(path) === "state.vscdb" ? [path] : [];
  const direct = join(path, "state.vscdb");
  if (existsSync(direct)) return [direct];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(path, entry.name, "state.vscdb"))
    .filter((dbPath) => existsSync(dbPath));
}

function readCursorConversations(dbPath: string): CursorConversation[] {
  const copy = copyCursorDatabase(dbPath);
  try {
    const db = new DatabaseSync(copy);
    try {
      return dedupeConversations([
        ...composerHeaderConversations(db),
        ...itemTableConversations(db),
        ...cursorDiskKvConversations(db)
      ]);
    } finally {
      db.close();
    }
  } catch {
    return [];
  } finally {
    rmSync(dirname(copy), { recursive: true, force: true });
  }
}

function copyCursorDatabase(dbPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cursor-"));
  const copy = join(dir, "state.vscdb");
  copyFileSync(dbPath, copy);
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbPath}${suffix}`;
    if (existsSync(sidecar)) copyFileSync(sidecar, `${copy}${suffix}`);
  }
  return copy;
}

function composerHeaderConversations(db: DatabaseSync): CursorConversation[] {
  if (!tableExists(db, "composerHeaders")) return [];
  return selectRows(db, "SELECT rowid, * FROM composerHeaders")
    .flatMap((row) => conversationsFromRow(row, "composerHeaders"));
}

function itemTableConversations(db: DatabaseSync): CursorConversation[] {
  if (!tableExists(db, "ItemTable")) return [];
  return selectRows(db, "SELECT rowid, key, value FROM ItemTable WHERE key IN ('composer.composerData', 'workbench.backgroundComposer.workspacePersistentData')")
    .flatMap((row) => conversationsFromRow(row, String(row.key ?? "ItemTable")));
}

function cursorDiskKvConversations(db: DatabaseSync): CursorConversation[] {
  if (!tableExists(db, "cursorDiskKV")) return [];
  return selectRows(db, "SELECT rowid, key, value FROM cursorDiskKV")
    .filter((row) => /composer|chat|conversation|aichat/iu.test(String(row.key ?? "")))
    .flatMap((row) => conversationsFromRow(row, String(row.key ?? "cursorDiskKV")));
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function selectRows(db: DatabaseSync, sql: string): Array<Record<string, unknown>> {
  return db.prepare(sql).all() as Array<Record<string, unknown>>;
}

function conversationsFromRow(row: Record<string, unknown>, fallback: string): CursorConversation[] {
  const parsed = parseJsonValue(row.value);
  if (parsed === null) return [];
  const conversations: CursorConversation[] = [];
  const rowId = firstString(row.composerId, row.id, row.key) ?? (row.rowid === undefined ? "" : String(row.rowid));
  collectConversations(parsed, row, rowId ? `${fallback}:${rowId}` : fallback, [], conversations);
  return conversations;
}

function collectConversations(
  value: unknown,
  parent: Record<string, unknown> | null,
  fallback: string,
  path: string[],
  output: CursorConversation[]
): void {
  const nestedJson = parseNestedJson(value);
  if (nestedJson !== null && nestedJson !== value) {
    collectConversations(nestedJson, parent, fallback, path, output);
    return;
  }
  if (Array.isArray(value)) {
    const messages = messageArray(value);
    if (messages.length > 0 && hasUserAndAssistant(messages)) {
      const nativeId = firstString(parent?.id, parent?.conversationId, parent?.composerId, parent?.chatId, parent?.threadId, parent?.sessionId)
        ?? `${fallback}:${path.join(".") || "conversation"}`;
      output.push({
        nativeId,
        title: conversationTitle(parent),
        messages,
        updatedAt: conversationUpdatedAt(parent, messages)
      });
    }
    for (const [index, item] of value.entries()) collectConversations(item, objectValue(item), fallback, [...path, String(index)], output);
    return;
  }
  const object = objectValue(value);
  if (!object) return;
  for (const [key, item] of Object.entries(object)) {
    collectConversations(item, object, fallback, [...path, key], output);
  }
}

function messageArray(value: unknown[]): CursorMessage[] {
  return value
    .map((item) => messageFromObject(objectValue(item)))
    .filter((message): message is CursorMessage => Boolean(message));
}

function messageFromObject(record: Record<string, unknown> | null): CursorMessage | null {
  if (!record) return null;
  const role = visibleRole(firstString(record.role, record.speaker, record.type, record.author));
  if (!role) return null;
  const text = cleanCursorText(firstString(record.text, record.markdown) ?? textFromValue(record.content) ?? textFromValue(record.message));
  if (!text) return null;
  return {
    role,
    text,
    createdAt: dateFromValue(record.createdAt, record.created_at, record.timestamp, record.time) ?? new Date(0).toISOString()
  };
}

function transcriptMessageFromRecord(record: Record<string, unknown>): CursorMessage | null {
  const message = objectValue(record.message) ?? objectValue(record.bubble);
  if (hiddenRole(firstString(record.role, record.type)) || hiddenRole(firstString(message?.role, message?.type))) return null;
  const role = visibleRoleFrom(record.role, record.speaker, record.author, record.type, message?.role, message?.speaker, message?.author, message?.type);
  if (!role) return null;
  const text = cleanCursorTranscriptText(textFromCursorAgentContent(message?.content));
  if (!text) return null;
  return {
    role,
    text,
    createdAt: dateFromValue(record.createdAt, record.created_at, record.timestamp, record.time, message?.createdAt, message?.created_at, message?.timestamp) ?? ""
  };
}

function textFromCursorAgentContent(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const chunks = value
    .map((item) => {
      const record = objectValue(item);
      if (!record || firstString(record.type)?.toLowerCase() !== "text") return null;
      return firstString(record.text, record.markdown);
    })
    .filter((text): text is string => Boolean(text));
  return chunks.join("\n").trim() || null;
}

function textFromValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromValue).filter(Boolean).join("\n").trim() || null;
  const record = objectValue(value);
  if (!record) return null;
  const type = firstString(record.type)?.toLowerCase();
  if (type && ["tool", "tool_use", "tool_result", "function_call", "function_call_output", "thinking", "system"].includes(type)) {
    return null;
  }
  return firstString(record.text, record.markdown)
    ?? textFromValue(record.content)
    ?? textFromValue(record.message);
}

function hasUserAndAssistant(messages: CursorMessage[]): boolean {
  return messages.some((message) => message.role === "user") && messages.some((message) => message.role === "assistant");
}

function visibleRole(value: string | null): CursorRole | null {
  const role = value?.toLowerCase();
  if (!role) return null;
  if (role === "user" || role === "human") return "user";
  if (["assistant", "ai", "bot", "model", "agent"].includes(role)) return "assistant";
  return null;
}

function visibleRoleFrom(...values: unknown[]): CursorRole | null {
  for (const value of values) {
    const role = visibleRole(firstString(value));
    if (role) return role;
  }
  return null;
}

function hiddenRole(value: string | null): boolean {
  return value ? ["system", "tool", "tool_use", "tool_result", "function_call", "function_call_output"].includes(value.toLowerCase()) : false;
}

function cleanCursorText(value: string | null): string {
  return value
    ?.split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() ?? "";
}

function cleanCursorTranscriptText(value: string | null): string {
  return cleanCursorText(value)
    .replace(/<\/?user_query>/giu, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && line !== "[REDACTED]" && !cursorInjectedTimestamp(line))
    .join("\n")
    .trim();
}

function hasDirtyCursorTranscriptObservations(db: Database, sessionId: string): boolean {
  const rows = db.prepare("SELECT text, created_at as createdAt FROM observations WHERE session_id = ?").all(sessionId) as Array<{ text: string; createdAt: string }>;
  return rows.some((row) =>
    row.createdAt === "1970-01-01T00:00:00.000Z" ||
    row.text.split(/\r?\n/u).some((line) => cleanCursorText(line) === "[REDACTED]" || cursorInjectedTimestamp(line)) ||
    /<\/?user_query>/iu.test(row.text)
  );
}

function hasDirtyCursorSessionTitle(db: Database, sessionId: string): boolean {
  const row = db.prepare("SELECT title FROM sessions WHERE id = ?").get(sessionId) as { title: string | null } | undefined;
  return dirtyCursorSessionTitle(row?.title);
}

function hasDirtyCursorSessionTitleForPath(db: Database, path: string): boolean {
  const rows = db.prepare("SELECT title FROM sessions WHERE source = 'cursor' AND path = ?").all(path) as Array<{ title: string | null }>;
  return rows.some((row) => dirtyCursorSessionTitle(row.title));
}

function dirtyCursorSessionTitle(title: string | null | undefined): boolean {
  const value = title?.replace(/^Cursor:\s*/iu, "").trim();
  return value ? noisyCursorTitle(value) : false;
}

function cursorInjectedTimestamp(line: string): boolean {
  const text = line.trim().replace(/^<timestamp>/iu, "").replace(/<\/timestamp>$/iu, "").trim();
  return /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM) \(UTC[+-]\d{1,2}\)$/u.test(text);
}

function conversationTitle(parent: Record<string, unknown> | null): string | undefined {
  const title = firstString(parent?.title, parent?.name, parent?.conversationTitle, parent?.displayName);
  if (!title) return undefined;
  return title.length > 120 ? `${title.slice(0, 117).trimEnd()}...` : title;
}

function conversationUpdatedAt(parent: Record<string, unknown> | null, messages: CursorMessage[]): string | undefined {
  return dateFromValue(parent?.lastUpdatedAt, parent?.updatedAt, parent?.lastModified, ...messages.map((message) => message.createdAt));
}

function dedupeConversations(conversations: CursorConversation[]): CursorConversation[] {
  const byId = new Map<string, CursorConversation>();
  for (const conversation of conversations) {
    if (!byId.has(conversation.nativeId)) byId.set(conversation.nativeId, conversation);
  }
  return [...byId.values()];
}

function cursorSessionTitle(conversation: CursorConversation, dbPath: string, projectPath: string | null = null): string {
  const title =
    readableCursorTitle(conversation.title) ??
    userSummaryTitle(conversation.messages) ??
    projectName(projectPath) ??
    readableWorkspaceName(dbPath) ??
    `Cursor session ${shortConversationId(conversation.nativeId)}`;
  return `Cursor: ${title}`;
}

function readableCursorTitle(value: string | undefined): string | undefined {
  const title = truncateTitle(cleanCursorText(value ?? ""));
  if (!title || noisyCursorTitle(title)) return undefined;
  return title;
}

function noisyCursorTitle(title: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(title)) return true;
  if (/^[0-9a-f]{16,}$/iu.test(title)) return true;
  if (/^(?:\/|[A-Za-z]:[\\/])/u.test(title)) return true;
  if (/^(?:Users|home)-[^ ]+-/u.test(title)) return true;
  return /(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})/iu.test(title) && /[\\/]/u.test(title);
}

function userSummaryTitle(messages: CursorMessage[]): string | undefined {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const title = firstReadableUserLine(message.text);
    if (title) return title;
  }
  return undefined;
}

function firstReadableUserLine(text: string): string | undefined {
  let inCode = false;
  for (const rawLine of text.replace(/<\/?user_query>/giu, "").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode || !line || line === "[REDACTED]" || cursorInjectedTimestamp(line)) continue;
    if (line.startsWith("|") && line.includes("|")) continue;
    if (/^[|:\-\s]+$/u.test(line)) continue;
    const cleaned = line.replace(/^#{1,6}\s+/u, "").replace(/^[-*]\s+/u, "").trim();
    if (cleaned && !/^<[^>]+>$/u.test(cleaned)) return truncateTitle(cleaned);
  }
  return undefined;
}

function projectName(path: string | null): string | undefined {
  if (!path) return undefined;
  const name = basename(path);
  return name && !noisyCursorTitle(name) ? truncateTitle(name) : undefined;
}

function shortConversationId(nativeId: string): string {
  const match = nativeId.match(/[0-9a-f]{8}/iu);
  return match?.[0] ?? nativeId.slice(0, 8);
}

function truncateTitle(title: string): string {
  return title.length > 80 ? `${title.slice(0, 77).trimEnd()}...` : title;
}

function readableWorkspaceName(dbPath: string): string | undefined {
  const name = basename(dirname(dbPath));
  if (!name || /^[0-9a-f]{16,}$/iu.test(name)) return undefined;
  return name;
}

function cursorProjectPath(dbPath: string): string | null {
  const workspaceJson = join(dirname(dbPath), "workspace.json");
  if (!existsSync(workspaceJson)) return null;
  try {
    return projectPathFromWorkspaceJson(JSON.parse(readFileSync(workspaceJson, "utf8")));
  } catch {
    return null;
  }
}

function cursorAgentProjectPath(path: string): string | null {
  let dir = dirname(path);
  while (basename(dir) !== "agent-transcripts" && dirname(dir) !== dir) dir = dirname(dir);
  const encoded = basename(dir) === "agent-transcripts" ? basename(dirname(dir)) : basename(dirname(dirname(path)));
  const parts = encoded.split("-").filter(Boolean);
  if (parts.length < 2) return null;
  if ((parts[0] === "Users" || parts[0] === "home") && parts.length > 3) {
    return `/${[...parts.slice(0, 3), parts.slice(3).join("-")].join("/")}`;
  }
  return `/${parts.join("/")}`;
}

function transcriptTitle(records: Array<Record<string, unknown>>): string | undefined {
  for (const record of records) {
    const message = objectValue(record.message) ?? objectValue(record.bubble);
    const title = firstString(record.title, record.sessionTitle, record.conversationTitle, message?.title);
    if (title) return title.length > 120 ? `${title.slice(0, 117).trimEnd()}...` : title;
  }
  return undefined;
}

function projectPathFromWorkspaceJson(value: unknown): string | null {
  const direct = projectPathString(value);
  if (direct) return direct;
  const object = objectValue(value);
  if (!object) return null;
  for (const key of ["folder", "folderPath", "workspace", "workspacePath", "path", "uri"]) {
    const path = projectPathString(object[key]);
    if (path) return path;
  }
  const folders = Array.isArray(object.folders) ? object.folders : [];
  for (const folder of folders) {
    const path = projectPathFromWorkspaceJson(folder);
    if (path) return path;
  }
  return null;
}

function projectPathString(value: unknown): string | null {
  const text = firstString(value);
  if (!text) return null;
  if (text.startsWith("file:")) {
    try {
      return fileURLToPath(text);
    } catch {
      try {
        return decodeURIComponent(new URL(text).pathname);
      } catch {
        return null;
      }
    }
  }
  return text;
}

function removeStaleCursorSessions(db: Database, path: string, keepIds: Set<string>): void {
  const rows = db.prepare("SELECT id FROM sessions WHERE source = 'cursor' AND path = ?").all(path) as Array<{ id: string }>;
  for (const row of rows) {
    if (keepIds.has(row.id)) continue;
    db.prepare("DELETE FROM observations WHERE session_id = ?").run(row.id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
  }
}

function removeStaleCursorTranscriptSessions(db: Database, root: string, keepPaths: Set<string>): void {
  const rows = db.prepare("SELECT id, path FROM sessions WHERE source = 'cursor'").all() as Array<{ id: string; path: string }>;
  const rootIsFile = existsSync(root) && statSync(root).isFile();
  const rootPath = rootIsFile ? root : root.replace(/\/+$/u, "");
  for (const row of rows) {
    if (!row.path.endsWith(".jsonl")) continue;
    const matchesRoot = rootIsFile ? row.path === rootPath : pathIsWithinRoot(row.path, rootPath);
    if (!matchesRoot || keepPaths.has(row.path)) continue;
    db.prepare("DELETE FROM observations WHERE session_id = ?").run(row.id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
  }
}

function pathIsWithinRoot(path: string, root: string): boolean {
  const normalizedPath = path.replace(/\\/gu, "/");
  const normalizedRoot = root.replace(/\\/gu, "/").replace(/\/+$/u, "");
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function parseJsonValue(value: unknown): unknown | null {
  if (typeof value === "string") return parseJsonText(value);
  if (value instanceof Uint8Array) return parseJsonText(Buffer.from(value).toString("utf8"));
  return null;
}

function parseNestedJson(value: unknown): unknown | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  return parseJsonText(trimmed);
}

function parseJsonText(text: string): unknown | null {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string") return parseNestedJson(parsed) ?? parsed;
    return parsed;
  } catch {
    return null;
  }
}

function dateFromValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      const date = new Date(value > 1_000_000_000_000 ? value : value * 1000);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  return undefined;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function idFor(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\0")).digest("hex");
}
