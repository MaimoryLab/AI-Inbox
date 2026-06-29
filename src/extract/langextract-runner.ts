import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AppConfig, AppSecrets } from "../config.js";
import type { LlmExtractResult, LlmTodoCandidate, ObservationForOrganize } from "../todos/service.js";

const ADJACENT_SIDECAR = fileURLToPath(new URL("./todo-extract-langextract.py", import.meta.url));
const SOURCE_TREE_SIDECAR = fileURLToPath(new URL("../../../src/extract/todo-extract-langextract.py", import.meta.url));
const MAX_STDOUT_CHARS = 1_000_000;
const MAX_STDERR_CHARS = 200_000;

export function getDefaultLangExtractSidecarPath(): string {
  return existsSync(ADJACENT_SIDECAR) ? ADJACENT_SIDECAR : SOURCE_TREE_SIDECAR;
}

export function createLangExtractRunner(
  config: AppConfig["llm"],
  secrets: AppSecrets,
  sidecarPath = getDefaultLangExtractSidecarPath()
): (observations: ObservationForOrganize[]) => Promise<LlmExtractResult> {
  return async (observations) => {
    if (!config.enabled || !secrets.llmApiKey) return { ok: false, warning: "llm_config_missing" };
    const blocks = observations
      .filter((observation) => observation.role === "user")
      .map((observation) => ({
        sourceObservationId: observation.id,
        sessionId: observation.sessionId,
        timestamp: observation.createdAt,
        source: observation.source,
        text: observation.text
      }));
    if (blocks.length === 0) return { ok: true, todos: [] };
    try {
      const output = await runSidecar(config, secrets.llmApiKey, sidecarPath, JSON.stringify({ blocks }));
      const parsed = parseSidecarOutput(output);
      return parsed ? { ok: true, todos: parsed } : { ok: false, warning: "llm_output_invalid" };
    } catch (error) {
      if ((error as Error).message === "timeout") return { ok: false, warning: "llm_timeout" };
      if ((error as Error).message === "runtime") return { ok: false, warning: "llm_runtime_missing" };
      return { ok: false, warning: "llm_provider_failed" };
    }
  };
}

function runSidecar(config: AppConfig["llm"], apiKey: string, sidecarPath: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.pythonPath ?? "python3", [sidecarPath], {
      env: {
        ...process.env,
        AI_TODO_LLM_PROVIDER: config.provider,
        AI_TODO_LLM_MODEL: config.model,
        AI_TODO_LLM_ENDPOINT: config.endpoint,
        AI_TODO_LLM_API_KEY: apiKey,
        AI_TODO_LLM_THINKING_DEPTH: config.thinkingDepth
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(new Error("timeout"));
    }, config.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_STDOUT_CHARS) fail(new Error("output"));
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > MAX_STDERR_CHARS) fail(new Error("provider"));
    });
    child.on("error", () => {
      fail(new Error("runtime"));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || "provider"));
    });
    child.stdin.end(input);
  });
}

function parseSidecarOutput(output: string): LlmTodoCandidate[] | null {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    if (!Array.isArray(parsed.todos)) return null;
    const todos: LlmTodoCandidate[] = [];
    for (const item of parsed.todos) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      if (
        typeof record.title !== "string" ||
        typeof record.description !== "string" ||
        typeof record.confidence !== "number" ||
        typeof record.sourceObservationId !== "string" ||
        typeof record.quote !== "string" ||
        typeof record.dedupeKey !== "string"
      ) return null;
      todos.push({
        title: record.title,
        description: record.description,
        confidence: record.confidence,
        sourceObservationId: record.sourceObservationId,
        quote: record.quote,
        dedupeKey: record.dedupeKey
      });
    }
    return todos;
  } catch {
    return null;
  }
}
