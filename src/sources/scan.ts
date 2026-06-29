import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import type { SourceKind } from "../contracts.js";
import type { Database } from "../db/index.js";
import { getAppPaths, type AppPaths } from "../paths.js";
import { scanClaudeCodeSessions } from "./claude-code.js";
import { scanCodexSessions } from "./codex.js";
import type { ScanResult } from "./jsonl-source.js";

export type SessionSource = Extract<SourceKind, "codex" | "claude-code">;

export type SourceScanResult =
  | { ok: true; result: ScanResult; path: string }
  | { ok: false; status: 400; error: "unsupported_source" | "path_not_found" };

export interface ConfiguredScanSummary {
  sources: Array<{ source: SessionSource; path: string; result?: ScanResult; warning?: string }>;
  warnings: string[];
}

export function resolveSourcePath(source: SessionSource, explicitPath?: string, paths: AppPaths = getAppPaths()): string {
  if (explicitPath) return explicitPath;
  const config = loadConfig(paths);
  if (source === "codex") return envPath(process.env.AI_TODO_CODEX_HOME) ?? config.sources.codex.path ?? join(homedir(), ".codex", "sessions");
  return envPath(process.env.AI_TODO_CLAUDE_HOME) ?? config.sources["claude-code"].path ?? join(homedir(), ".claude", "projects");
}

export function scanSource(db: Database, source: unknown, explicitPath?: unknown, paths: AppPaths = getAppPaths()): SourceScanResult {
  if (!isSessionSource(source)) {
    return { ok: false, status: 400, error: "unsupported_source" };
  }
  const path = resolveSourcePath(source, typeof explicitPath === "string" && explicitPath ? explicitPath : undefined, paths);
  if (!existsSync(path)) {
    return { ok: false, status: 400, error: "path_not_found" };
  }
  const result = source === "codex"
    ? scanCodexSessions(db, path)
    : scanClaudeCodeSessions(db, path);
  return { ok: true, result, path };
}

export function scanConfiguredSources(db: Database, paths: AppPaths = getAppPaths()): ConfiguredScanSummary {
  const sources: ConfiguredScanSummary["sources"] = [];
  const warnings: string[] = [];
  for (const source of ["codex", "claude-code"] as const) {
    const path = resolveSourcePath(source, undefined, paths);
    if (!existsSync(path)) {
      const warning = `${source}_path_not_found`;
      warnings.push(warning);
      sources.push({ source, path, warning });
      continue;
    }
    const result = source === "codex"
      ? scanCodexSessions(db, path)
      : scanClaudeCodeSessions(db, path);
    sources.push({ source, path, result });
  }
  return { sources, warnings };
}

export function isSessionSource(source: unknown): source is SessionSource {
  return source === "codex" || source === "claude-code";
}

function envPath(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}
