import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, loadEnvConfig, saveEnvConfig, type EnvConfig } from "../config.js";
import type { AppPaths } from "../paths.js";
import type { SessionSource } from "./scan.js";

export type SourceDiscoveryStatus = "configured" | "discovered" | "missing";

export interface SourceDiscoveryResult {
  source: SessionSource;
  status: SourceDiscoveryStatus;
  path?: string;
}

const SOURCES: SessionSource[] = ["codex", "claude-code", "cursor"];

export function discoverSourcePaths(paths: AppPaths): SourceDiscoveryResult[] {
  return SOURCES.map((source) => {
    const configured = configuredPath(source, paths);
    const upgradedCursor = source === "cursor" ? upgradedCursorPath(configured) : undefined;
    if (upgradedCursor) return { source, status: "discovered", path: upgradedCursor };
    if (configured) return { source, status: "configured", path: configured };
    const discovered = discoveredPath(source);
    if (discovered) return { source, status: "discovered", path: discovered };
    return { source, status: "missing" };
  });
}

export function ensureDiscoveredSourceEnv(paths: AppPaths): SourceDiscoveryResult[] {
  const discovery = discoverSourcePaths(paths);
  const current = loadEnvConfig(paths);
  const next: EnvConfig = { ...current };
  let changed = false;

  for (const result of discovery) {
    if (result.status !== "discovered" || !result.path) continue;
    const key = envKey(result.source);
    if (next[key] !== undefined || process.env[key]) continue;
    next[key] = result.path;
    changed = true;
  }

  if (changed) saveEnvConfig(paths, next);
  return discovery;
}

function configuredPath(source: SessionSource, paths: AppPaths): string | undefined {
  const key = envKey(source);
  const processValue = cleanPath(process.env[key]);
  if (processValue) return processValue;
  const envValue = cleanPath(loadEnvConfig(paths)[key]);
  if (envValue) return envValue;
  return loadConfig(paths).sources[source].path;
}

function discoveredPath(source: SessionSource): string | undefined {
  if (source === "codex") {
    const codexHome = join(homedir(), ".codex");
    return existsSync(join(codexHome, "sessions")) || existsSync(join(codexHome, "archived_sessions"))
      ? codexHome
      : undefined;
  }
  const claudeHome = join(homedir(), ".claude", "projects");
  if (source === "claude-code") return existsSync(claudeHome) ? claudeHome : undefined;
  const cursorProjects = join(homedir(), ".cursor", "projects");
  if (existsSync(cursorProjects)) return cursorProjects;
  const cursorHome = cursorWorkspaceStoragePath();
  return existsSync(cursorHome) ? cursorHome : undefined;
}

function upgradedCursorPath(configured: string | undefined): string | undefined {
  if (!configured || cleanPath(process.env.AI_INBOX_CURSOR_HOME)) return undefined;
  const cursorProjects = join(homedir(), ".cursor", "projects");
  return samePath(configured, cursorWorkspaceStoragePath()) && existsSync(cursorProjects) ? cursorProjects : undefined;
}

function envKey(source: SessionSource): "AI_INBOX_CODEX_HOME" | "AI_INBOX_CLAUDE_HOME" | "AI_INBOX_CURSOR_HOME" {
  if (source === "codex") return "AI_INBOX_CODEX_HOME";
  if (source === "claude-code") return "AI_INBOX_CLAUDE_HOME";
  return "AI_INBOX_CURSOR_HOME";
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

function cleanPath(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function samePath(a: string, b: string): boolean {
  const clean = (value: string) => value.replace(/\\/gu, "/").replace(/\/+$/u, "");
  return clean(a) === clean(b);
}
