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

const SOURCES: SessionSource[] = ["codex", "claude-code"];

export function discoverSourcePaths(paths: AppPaths): SourceDiscoveryResult[] {
  return SOURCES.map((source) => {
    const configured = configuredPath(source, paths);
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
  return existsSync(claudeHome) ? claudeHome : undefined;
}

function envKey(source: SessionSource): "AI_INDEX_CODEX_HOME" | "AI_INDEX_CLAUDE_HOME" {
  return source === "codex" ? "AI_INDEX_CODEX_HOME" : "AI_INDEX_CLAUDE_HOME";
}

function cleanPath(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
