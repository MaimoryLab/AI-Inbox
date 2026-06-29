import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadConfig, loadSecrets } from "../config.js";
import type { Database } from "../db/index.js";
import { createLangExtractRunner, getDefaultLangExtractSidecarPath } from "../extract/langextract-runner.js";
import type { AppPaths } from "../paths.js";
import { organizeTodos, type OrganizeOptions } from "./service.js";

export async function organizeConfiguredTodos(
  db: Database,
  paths: AppPaths,
  options: OrganizeOptions = {}
) {
  const config = loadConfig(paths);
  const secrets = loadSecrets(paths);
  return organizeTodos(db, {
    ...options,
    scope: options.scope ?? config.organize,
    llmExtractor: options.llmExtractor ?? createLangExtractRunner(config.llm, secrets)
  });
}

export interface LlmDoctorStatus {
  enabled: boolean;
  keyConfigured: boolean;
  model: string;
  endpoint: string;
  pythonPath: string;
  sidecarPath: string;
  runtimeReady: boolean;
}

export function getLlmDoctorStatus(paths: AppPaths): LlmDoctorStatus {
  const config = loadConfig(paths);
  const secrets = loadSecrets(paths);
  const pythonPath = config.llm.pythonPath ?? "python3";
  return {
    enabled: config.llm.enabled,
    keyConfigured: !!secrets.llmApiKey,
    model: config.llm.model,
    endpoint: config.llm.endpoint,
    pythonPath,
    sidecarPath: getDefaultLangExtractSidecarPath(),
    runtimeReady: existsSync(getDefaultLangExtractSidecarPath()) && isLangExtractRuntimeReady(pythonPath)
  };
}

function isLangExtractRuntimeReady(pythonPath: string): boolean {
  const result = spawnSync(pythonPath, [
    "-c",
    "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('langextract') else 1)"
  ], { stdio: "ignore", timeout: 3000 });
  return result.status === 0;
}
