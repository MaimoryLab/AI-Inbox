import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { loadConfig } from "../config.js";
import type { SourceKind } from "../contracts.js";
import type { Database } from "../db/index.js";
import { getAppPaths, type AppPaths } from "../paths.js";
import { scanClaudeCodeSessions } from "./claude-code.js";
import { scanCodexSessions } from "./codex.js";
import { scanCursorSessions } from "./cursor.js";
import type { ScanResult } from "./jsonl-source.js";

export type SessionSource = Extract<SourceKind, "codex" | "claude-code" | "cursor">;

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
  if (source === "cursor") return cursorSourceRoots(explicitPath, paths);
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
  const result = aggregateScanResults(existingRoots.map((path) => scanResolvedSource(db, source, path)));
  return {
    ok: true,
    result,
    path: roots.join(", "),
    warning: sourceSessionCount(db, source, roots) === 0
      ? noSessionWarning(source, paths, typeof explicitPath === "string" && explicitPath ? true : false)
      : undefined
  };
}

export function scanConfiguredSources(db: Database, paths: AppPaths = getAppPaths()): ConfiguredScanSummary {
  const sources: ConfiguredScanSummary["sources"] = [];
  const warnings: string[] = [];
  for (const source of ["codex", "claude-code", "cursor"] as const) {
    const roots = resolveSourcePaths(source, undefined, paths);
    const existingRoots = roots.filter((path) => existsSync(path));
    if (existingRoots.length === 0) {
      const warning = `${source}_path_not_found`;
      warnings.push(warning);
      sources.push({ source, path: roots.join(", "), warning });
      continue;
    }
    const result = aggregateScanResults(existingRoots.map((path) => scanResolvedSource(db, source, path)));
    const warning = sourceSessionCount(db, source, roots) === 0 ? noSessionWarning(source, paths, false) : undefined;
    if (warning) warnings.push(warning);
    sources.push({ source, path: roots.join(", "), result, warning });
  }
  return { sources, warnings };
}

export function isSessionSource(source: unknown): source is SessionSource {
  return source === "codex" || source === "claude-code" || source === "cursor";
}

function envPath(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

function configuredSourcePath(source: SessionSource, paths: AppPaths): string | undefined {
  const config = loadConfig(paths);
  if (source === "codex") return envPath(process.env.AI_INBOX_CODEX_HOME) ?? config.sources.codex.path;
  if (source === "claude-code") return envPath(process.env.AI_INBOX_CLAUDE_HOME) ?? config.sources["claude-code"].path;
  return envPath(process.env.AI_INBOX_CURSOR_HOME) ?? config.sources.cursor.path;
}

function defaultSourcePath(source: SessionSource): string {
  if (source === "codex") return join(homedir(), ".codex");
  if (source === "claude-code") return join(homedir(), ".claude", "projects");
  return defaultCursorPath();
}

function sourceRoots(source: SessionSource, path: string): string[] {
  if (source === "codex") return codexSessionRoots(path);
  return [path];
}

function scanResolvedSource(db: Database, source: SessionSource, path: string): ScanResult {
  if (source === "codex") return scanCodexSessions(db, path);
  if (source === "claude-code") return scanClaudeCodeSessions(db, path);
  return scanCursorSessions(db, path);
}

function defaultCursorPath(): string {
  return join(homedir(), ".cursor", "projects");
}

function cursorSourceRoots(explicitPath: string | undefined, paths: AppPaths): string[] {
  if (explicitPath) return [explicitPath];
  const processPath = envPath(process.env.AI_INBOX_CURSOR_HOME);
  if (processPath) return [processPath];
  const configured = loadConfig(paths).sources.cursor.path;
  const projects = defaultCursorPath();
  const legacy = cursorWorkspaceStoragePath();
  if (!configured) return uniquePaths([projects, legacy]);
  if (samePath(configured, legacy) && existsSync(projects)) return uniquePaths([projects, configured]);
  return [configured];
}

function cursorWorkspaceStoragePath(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Cursor", "User", "workspaceStorage");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage");
  }
  return join(homedir(), ".config", "Cursor", "User", "workspaceStorage");
}

function noSessionWarning(source: SessionSource, paths: AppPaths, explicitPath: boolean): string {
  if (!explicitPath && source === "cursor" && savedCursorPathIsLegacy(paths) && existsSync(defaultCursorPath())) {
    return "cursor_legacy_path_reset_available";
  }
  return `${source}_no_sessions`;
}

function savedCursorPathIsLegacy(paths: AppPaths): boolean {
  if (envPath(process.env.AI_INBOX_CURSOR_HOME)) return false;
  const configured = loadConfig(paths).sources.cursor.path;
  return !!configured && samePath(configured, cursorWorkspaceStoragePath());
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

function samePath(a: string, b: string): boolean {
  const clean = (value: string) => normalizePathSeparators(value).replace(/\/+$/u, "");
  return clean(a) === clean(b);
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
  return rows.filter((row) => roots.some((root) => pathIsWithinRoot(row.path, root))).length;
}

function pathIsWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizePathSeparators(path);
  const normalizedRoot = normalizePathSeparators(root).replace(/\/+$/u, "");
  if (!normalizedRoot) return false;
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function normalizePathSeparators(path: string): string {
  return path.replace(/\\/gu, "/");
}
