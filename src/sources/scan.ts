import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { loadConfig } from "../config.js";
import type { SourceKind } from "../contracts.js";
import type { Database } from "../db/index.js";
import { getAppPaths, type AppPaths } from "../paths.js";
import { scanClaudeCodeSessions } from "./claude-code.js";
import { scanCodexSessions } from "./codex.js";
import type { ScanResult } from "./jsonl-source.js";

export type SessionSource = Extract<SourceKind, "codex" | "claude-code">;

export type SourceScanResult =
  | { ok: true; result: ScanResult; path: string; warning?: string }
  | { ok: false; status: 400; error: "unsupported_source" | "path_not_found" };

export interface ConfiguredScanSummary {
  sources: Array<{ source: SessionSource; path: string; result?: ScanResult; warning?: string }>;
  warnings: string[];
}

export function resolveSourcePath(source: SessionSource, explicitPath?: string, paths: AppPaths = getAppPaths()): string {
  return resolveSourcePaths(source, explicitPath, paths)[0];
}

export function resolveSourcePaths(source: SessionSource, explicitPath?: string, paths: AppPaths = getAppPaths()): string[] {
  return sourceRoots(source, sourceBasePath(source, explicitPath, paths));
}

function sourceBasePath(source: SessionSource, explicitPath?: string, paths: AppPaths = getAppPaths()): string {
  if (explicitPath) return explicitPath;
  return configuredSourcePath(source, paths) ?? defaultSourcePath(source);
}

export function scanSource(db: Database, source: unknown, explicitPath?: unknown, paths: AppPaths = getAppPaths()): SourceScanResult {
  if (!isSessionSource(source)) {
    return { ok: false, status: 400, error: "unsupported_source" };
  }
  const roots = resolveSourcePaths(source, typeof explicitPath === "string" && explicitPath ? explicitPath : undefined, paths);
  const existingRoots = roots.filter((path) => existsSync(path));
  if (existingRoots.length === 0) {
    return { ok: false, status: 400, error: "path_not_found" };
  }
  const result = aggregateScanResults(existingRoots.map((path) => source === "codex"
    ? scanCodexSessions(db, path)
    : scanClaudeCodeSessions(db, path)));
  return {
    ok: true,
    result,
    path: roots.join(", "),
    warning: sourceSessionCount(db, source, roots) === 0 ? `${source}_no_sessions` : undefined
  };
}

export function scanConfiguredSources(db: Database, paths: AppPaths = getAppPaths()): ConfiguredScanSummary {
  const sources: ConfiguredScanSummary["sources"] = [];
  const warnings: string[] = [];
  for (const source of ["codex", "claude-code"] as const) {
    const roots = sourceRoots(source, configuredSourcePath(source, paths) ?? defaultSourcePath(source));
    const existingRoots = roots.filter((path) => existsSync(path));
    if (existingRoots.length === 0) {
      const warning = `${source}_path_not_found`;
      warnings.push(warning);
      sources.push({ source, path: roots.join(", "), warning });
      continue;
    }
    const result = aggregateScanResults(existingRoots.map((path) => source === "codex"
      ? scanCodexSessions(db, path)
      : scanClaudeCodeSessions(db, path)));
    const warning = sourceSessionCount(db, source, roots) === 0 ? `${source}_no_sessions` : undefined;
    if (warning) warnings.push(warning);
    sources.push({ source, path: roots.join(", "), result, warning });
  }
  return { sources, warnings };
}

export function isSessionSource(source: unknown): source is SessionSource {
  return source === "codex" || source === "claude-code";
}

function envPath(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

function configuredSourcePath(source: SessionSource, paths: AppPaths): string | undefined {
  const config = loadConfig(paths);
  if (source === "codex") return envPath(process.env.AI_TODO_CODEX_HOME) ?? config.sources.codex.path;
  return envPath(process.env.AI_TODO_CLAUDE_HOME) ?? config.sources["claude-code"].path;
}

function defaultSourcePath(source: SessionSource): string {
  return source === "codex" ? join(homedir(), ".codex") : join(homedir(), ".claude", "projects");
}

function sourceRoots(source: SessionSource, path: string): string[] {
  if (source === "codex") return codexSessionRoots(path);
  return [path];
}

function codexSessionRoots(path: string): string[] {
  const sessions = join(path, "sessions");
  const archived = join(path, "archived_sessions");
  if (basename(path) === ".codex" || existsSync(sessions) || existsSync(archived)) {
    return [sessions, archived];
  }
  return [path];
}

function aggregateScanResults(results: ScanResult[]): ScanResult {
  const first = results[0];
  return {
    source: first.source,
    scanned: results.reduce((sum, result) => sum + result.scanned, 0),
    observations: results.reduce((sum, result) => sum + result.observations, 0),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0)
  };
}

function sourceSessionCount(db: Database, source: SessionSource, roots: string[]): number {
  const rows = db.prepare("SELECT path FROM sessions WHERE source = ?").all(source) as Array<{ path: string }>;
  return rows.filter((row) => roots.some((root) => row.path === root || row.path.startsWith(`${root.replace(/\/+$/u, "")}/`))).length;
}
