import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SourceKind } from "../contracts.js";
import type { Database } from "../db/index.js";
import { scanClaudeCodeSessions } from "./claude-code.js";
import { scanCodexSessions } from "./codex.js";
import type { ScanResult } from "./jsonl-source.js";

export type SessionSource = Extract<SourceKind, "codex" | "claude-code">;

export type SourceScanResult =
  | { ok: true; result: ScanResult; path: string }
  | { ok: false; status: 400; error: "unsupported_source" | "path_not_found" };

export function resolveSourcePath(source: SessionSource, explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  if (source === "codex") return process.env.AI_TODO_CODEX_HOME ?? join(homedir(), ".codex", "sessions");
  return process.env.AI_TODO_CLAUDE_HOME ?? join(homedir(), ".claude", "projects");
}

export function scanSource(db: Database, source: unknown, explicitPath?: unknown): SourceScanResult {
  if (!isSessionSource(source)) {
    return { ok: false, status: 400, error: "unsupported_source" };
  }
  const path = resolveSourcePath(source, typeof explicitPath === "string" && explicitPath ? explicitPath : undefined);
  if (!existsSync(path)) {
    return { ok: false, status: 400, error: "path_not_found" };
  }
  const result = source === "codex"
    ? scanCodexSessions(db, path)
    : scanClaudeCodeSessions(db, path);
  return { ok: true, result, path };
}

export function isSessionSource(source: unknown): source is SessionSource {
  return source === "codex" || source === "claude-code";
}
