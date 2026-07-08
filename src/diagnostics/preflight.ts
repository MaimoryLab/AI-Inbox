import { existsSync } from "node:fs";
import type { AppConfig, AppSecrets } from "../config.js";
import { loadConfig, loadSecrets, parseSettingsUpdate } from "../config.js";
import type { Database } from "../db/index.js";
import type { AppPaths } from "../paths.js";
import { discoverSourcePaths } from "../sources/discovery.js";

export type PreflightStatus = "pass" | "warn" | "fail" | "skipped";

export interface PreflightCheck {
  id: "source_paths" | "source_observations" | "llm_protocol" | "llm_endpoint" | "llm_api_key" | "llm_models" | "llm_chat";
  status: PreflightStatus;
  message: string;
  reason?: string;
  durationMs?: number;
}

export interface PreflightResult {
  ok: boolean;
  canOrganize: boolean;
  durationMs: number;
  checks: PreflightCheck[];
}

export async function runPreflight(db: Database, paths: AppPaths, input?: unknown): Promise<PreflightResult> {
  const started = Date.now();
  const { config, secrets } = resolvePreflightConfig(paths, input);
  const checks: PreflightCheck[] = [];
  checks.push(checkSourcePaths(paths, config, input !== undefined));
  checks.push(checkSourceObservations(db, config));
  checks.push(checkProtocol(config));
  checks.push(checkEndpoint(config));
  checks.push(checkApiKey(secrets));

  const hardFailed = () => checks.some((check) => check.status === "fail");
  if (!hardFailed()) checks.push(await checkModels(config, secrets));
  if (!hardFailed()) checks.push(await checkTinyGeneration(config, secrets));
  if (hardFailed() && !checks.some((check) => check.id === "llm_models")) {
    checks.push({ id: "llm_models", status: "skipped", message: "Skipped because configuration checks failed." });
  }
  if (hardFailed() && !checks.some((check) => check.id === "llm_chat")) {
    checks.push({ id: "llm_chat", status: "skipped", message: "Skipped because configuration checks failed." });
  }

  const ok = checks.every((check) => check.status === "pass" || check.status === "warn" || check.status === "skipped");
  return { ok, canOrganize: ok, durationMs: Date.now() - started, checks };
}

function resolvePreflightConfig(paths: AppPaths, input: unknown | undefined): { config: AppConfig; secrets: AppSecrets } {
  if (input === undefined) return { config: loadConfig(paths), secrets: loadSecrets(paths) };
  const currentSecrets = loadSecrets(paths);
  const { config, apiKey } = parseSettingsUpdate(input);
  return {
    config,
    secrets: apiKey?.trim()
      ? { llmApiKey: apiKey.trim(), llmApiKeySource: "configured" }
      : currentSecrets
  };
}

function checkSourcePaths(paths: AppPaths, config: AppConfig, temporary: boolean): PreflightCheck {
  const configured = Object.values(config.sources).map((source) => source.path).filter((path): path is string => !!path);
  const existing = temporary && configured.length > 0
    ? configured.filter((path) => existsSync(path))
    : discoverSourcePaths(paths).filter((source) => source.status !== "missing");
  if (existing.length > 0) {
    return { id: "source_paths", status: "pass", message: "At least one source path is available." };
  }
  return { id: "source_paths", status: "fail", message: "No source paths were found.", reason: "source_paths_missing" };
}

function checkSourceObservations(db: Database, config: AppConfig): PreflightCheck {
  const since = new Date(Date.now() - config.organize.sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const row = db.prepare(
    "SELECT COUNT(*) AS count FROM observations WHERE role IN ('user', 'assistant') AND created_at >= ?"
  ).get(since) as { count: number } | undefined;
  if ((row?.count ?? 0) > 0) {
    return { id: "source_observations", status: "pass", message: "Source observations are available." };
  }
  return { id: "source_observations", status: "fail", message: "No recent source observations are available.", reason: "source_observations_missing" };
}

function checkProtocol(config: AppConfig): PreflightCheck {
  return { id: "llm_protocol", status: "pass", message: `LLM protocol: ${config.llm.protocol}` };
}

function checkEndpoint(config: AppConfig): PreflightCheck {
  try {
    const url = new URL(config.llm.endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad_protocol");
    return { id: "llm_endpoint", status: "pass", message: "LLM endpoint is valid." };
  } catch {
    return { id: "llm_endpoint", status: "fail", message: "LLM endpoint is invalid.", reason: "endpoint_invalid" };
  }
}

function checkApiKey(secrets: AppSecrets): PreflightCheck {
  if (secrets.llmApiKey) return { id: "llm_api_key", status: "pass", message: `LLM API key is ${secrets.llmApiKeySource ?? "configured"}.` };
  return { id: "llm_api_key", status: "fail", message: "LLM API key is missing.", reason: "api_key_missing" };
}

async function checkModels(config: AppConfig, secrets: AppSecrets): Promise<PreflightCheck> {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(`${baseEndpoint(config.llm.endpoint)}/models`, {
      method: "GET",
      headers: authHeaders(config, secrets.llmApiKey ?? "")
    }, 8000);
    if (response.status === 404 || response.status === 405) {
      return timed({ id: "llm_models", status: "warn", message: "Models endpoint is unavailable; continuing with generation probe.", reason: `http_${response.status}` }, started);
    }
    if (!response.ok) {
      return timed({ id: "llm_models", status: "fail", message: "Models endpoint rejected the request.", reason: `http_${response.status}` }, started);
    }
    const body = await response.json() as { data?: Array<{ id?: string }> };
    const ids = Array.isArray(body.data) ? body.data.map((item) => item.id).filter(Boolean) : [];
    if (ids.length > 0 && !ids.includes(config.llm.model)) {
      return timed({ id: "llm_models", status: "fail", message: "Configured model was not found.", reason: "model_not_found" }, started);
    }
    return timed({ id: "llm_models", status: "pass", message: "Configured model is available." }, started);
  } catch (error) {
    return timed({ id: "llm_models", status: "fail", message: "Models probe failed.", reason: providerReason(error) }, started);
  }
}

async function checkTinyGeneration(config: AppConfig, secrets: AppSecrets): Promise<PreflightCheck> {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(llmUrl(config), {
      method: "POST",
      headers: authHeaders(config, secrets.llmApiKey ?? ""),
      body: JSON.stringify(tinyBody(config))
    }, Math.min(config.llm.timeoutMs, 15000));
    const text = await response.text();
    if (!response.ok) {
      const reason = response.status === 400 && /json|response_format|format/iu.test(text) ? "json_mode_rejected" : `http_${response.status}`;
      return timed({ id: "llm_chat", status: "fail", message: "Tiny generation probe failed.", reason }, started);
    }
    if (!hasTinyJson(config, text)) {
      return timed({ id: "llm_chat", status: "fail", message: "Tiny generation returned invalid JSON.", reason: "invalid_json" }, started);
    }
    return timed({ id: "llm_chat", status: "pass", message: "Tiny generation probe passed." }, started);
  } catch (error) {
    return timed({ id: "llm_chat", status: "fail", message: "Tiny generation probe failed.", reason: providerReason(error) }, started);
  }
}

function tinyBody(config: AppConfig): Record<string, unknown> {
  if (config.llm.protocol === "openai-responses") {
    return {
      model: config.llm.model,
      instructions: "Return only JSON: {\"taskChains\":[]}",
      input: "health check",
      text: { format: { type: "json_object" } }
    };
  }
  if (config.llm.protocol === "anthropic-messages") {
    return {
      model: config.llm.model,
      max_tokens: 128,
      system: "Return only JSON for AI-Inbox diagnostics.",
      messages: [{ role: "user", content: "health check" }],
      tools: [{
        name: "emit_ai_inbox_cards",
        description: "Return an empty AI-Inbox extraction result.",
        input_schema: { type: "object", additionalProperties: true, properties: { taskChains: { type: "array" } } }
      }],
      tool_choice: { type: "tool", name: "emit_ai_inbox_cards" }
    };
  }
  return {
    model: config.llm.model,
    temperature: 0,
    reasoning_effort: config.llm.thinkingDepth,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return only JSON: {\"taskChains\":[]}" },
      { role: "user", content: "health check" }
    ]
  };
}

function hasTinyJson(config: AppConfig, text: string): boolean {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (Array.isArray(body.taskChains)) return true;
    if (config.llm.protocol === "openai-chat") {
      const content = (((body.choices as unknown[])?.[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.content;
      return typeof content === "string" && Array.isArray((JSON.parse(content) as Record<string, unknown>).taskChains);
    }
    if (config.llm.protocol === "openai-responses") {
      return typeof body.output_text === "string" && Array.isArray((JSON.parse(body.output_text) as Record<string, unknown>).taskChains);
    }
    const content = Array.isArray(body.content) ? body.content : [];
    return content.some((block) => {
      if (!block || typeof block !== "object" || Array.isArray(block)) return false;
      const record = block as Record<string, unknown>;
      return record.type === "tool_use" && record.input && typeof record.input === "object" && Array.isArray((record.input as Record<string, unknown>).taskChains);
    });
  } catch {
    return false;
  }
}

function llmUrl(config: AppConfig): string {
  const endpoint = baseEndpoint(config.llm.endpoint);
  if (config.llm.protocol === "openai-responses") return `${endpoint}/responses`;
  if (config.llm.protocol === "anthropic-messages") return `${endpoint}/messages`;
  return `${endpoint}/chat/completions`;
}

function authHeaders(config: AppConfig, apiKey: string): Record<string, string> {
  if (config.llm.protocol === "anthropic-messages") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    };
  }
  return {
    "authorization": `Bearer ${apiKey}`,
    "content-type": "application/json"
  };
}

function baseEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/u, "");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function providerReason(error: unknown): string {
  if ((error as Error).name === "AbortError") return "timeout";
  return "network_error";
}

function timed(check: PreflightCheck, started: number): PreflightCheck {
  return { ...check, durationMs: Date.now() - started };
}
