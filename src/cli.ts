#!/usr/bin/env node
import { existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Database } from "./db/index.js";
import { openDatabase } from "./db/index.js";
import { getAppPaths } from "./paths.js";
import { runMcpStdio } from "./mcp/stdio.js";
import { createAppServer, createStartupScanner } from "./server/index.js";
import { scanSource } from "./sources/scan.js";
import { defaultEnvConfig, ensureDefaultEnv, loadConfig, loadSecrets, publicConfig, saveEnvConfig, settingsToEnv, type AppConfig, type EnvConfig } from "./config.js";
import { runPreflight } from "./diagnostics/preflight.js";
import { getLlmDoctorStatus, organizeConfiguredTodos } from "./todos/configured.js";
import { clearTodoData, listTodos, updateTodoStatus } from "./todos/service.js";

export const DEFAULT_UI_PORT = 3111;
const HELP_TEXT = `Usage: ai-inbox [command]

Commands:
  init [options]              Create local config.
  doctor                      Check local config, data, and LLM setup.
  preflight [--json]          Test source and LLM readiness.
  config get [--json]         Print current config.
  config set [options]        Update local config.
  scan <codex|claude-code|cursor> [path]
  extract|organize            Extract todos from configured sessions.
  regenerate --yes            Clear inbox cards and regenerate from all observations.
  list|ls                     List todos.
  done|complete <todo-id>     Mark a todo complete.
  ignore|dismiss <todo-id>    Ignore a todo.
  restore|reopen <todo-id>    Restore a todo to open.
  start [--port <port>]       Start the local UI.
  mcp                         Start the MCP stdio server.`;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const command = argv[0] ?? "doctor";

  if (command === "help" || argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (command === "init") {
    return init(argv.slice(1));
  }

  if (command === "doctor") {
    const paths = getAppPaths();
    mkdirSync(paths.configDir, { recursive: true });
    mkdirSync(paths.dataDir, { recursive: true });
    openDatabase(paths).close();
    const llm = getLlmDoctorStatus(paths);
    console.log(`config: ${paths.configDir}`);
    console.log(`env: ${paths.envPath}`);
    if (!existsSync(paths.envPath)) console.log("env status: missing; run ai-inbox init");
    console.log(`data: ${paths.dataDir}`);
    console.log(`llm enabled: ${llm.enabled}`);
    console.log(`llm protocol: ${llm.protocol}`);
    console.log(`llm key: ${llm.keyStatus}`);
    console.log(`llm model: ${llm.model}`);
    console.log(`llm endpoint: ${llm.endpoint}`);
    console.log("preflight: run ai-inbox preflight for a live source and LLM probe");
    console.log("ok");
    return 0;
  }

  if (command === "preflight") {
    return withDatabase(async (db) => {
      const result = await runPreflight(db, getAppPaths());
      if (argv.includes("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printPreflightResult(result);
      }
      return result.canOrganize ? 0 : 1;
    });
  }

  if (command === "config") {
    return configCommand(argv.slice(1));
  }

  if (command === "scan") {
    return withDatabase((db) => scan(db, argv[1], argv[2]));
  }

  if (command === "extract" || command === "organize") {
    const paths = getAppPaths();
    return withDatabase(async (db) => {
      const result = await organizeConfiguredTodos(db, paths);
      printOrganizeResult(result);
      return 0;
    });
  }

  if (command === "regenerate") {
    if (!argv.includes("--yes")) {
      console.error("usage: ai-inbox regenerate --yes");
      console.error("This clears inbox cards, evidence, task chains, and organize run history before regenerating.");
      return 1;
    }
    const paths = getAppPaths();
    return withDatabase(async (db) => {
      const cleared = clearTodoData(db);
      const result = await organizeConfiguredTodos(db, paths, { full: true });
      console.log(`cleared todos: ${cleared.todos}`);
      console.log(`cleared evidence: ${cleared.evidence}`);
      console.log(`cleared task chains: ${cleared.taskChains}`);
      console.log(`cleared task chain nodes: ${cleared.taskChainNodes}`);
      console.log(`cleared organize runs: ${cleared.organizeRuns}`);
      printOrganizeResult(result);
      return 0;
    });
  }

  if (command === "list" || command === "ls") {
    return withDatabase((db) => {
      const todos = listTodos(db);
      if (todos.length === 0) {
        console.log("No todos");
        return 0;
      }
      for (const todo of todos) {
        console.log(`${todo.id} ${todo.status} ${todo.title}`);
      }
      return 0;
    });
  }

  if (command === "done" || command === "complete" || command === "ignore" || command === "dismiss" || command === "restore" || command === "reopen") {
    const status = command === "done" || command === "complete" ? "done" : command === "restore" || command === "reopen" ? "todo" : "ignored";
    return withDatabase((db) => updateStatus(db, argv[1], status));
  }

  if (command === "start") {
    return startUi(argv.slice(1));
  }

  if (command === "open") {
    return startUi(argv.slice(1));
  }

  if (command === "mcp") {
    await runMcpStdio();
    return 0;
  }

  console.error(`unknown command: ${command}`);
  return 1;
}

async function init(argv: string[]): Promise<number> {
  const paths = getAppPaths();
  const args = parseOptions(argv);
  let env: EnvConfig = {
    AI_INBOX_LLM_ENABLED: args["llm-enabled"],
    AI_INBOX_LLM_PROTOCOL: args["llm-protocol"],
    AI_INBOX_LLM_PROVIDER: args.provider,
    AI_INBOX_LLM_API_KEY: args["api-key"],
    AI_INBOX_LLM_MODEL: args.model,
    AI_INBOX_LLM_ENDPOINT: args.endpoint,
    AI_INBOX_CODEX_HOME: args["codex-home"],
    AI_INBOX_CLAUDE_HOME: args["claude-home"],
    AI_INBOX_CURSOR_HOME: args["cursor-home"],
    AI_INBOX_ORGANIZE_SINCE_DAYS: args["since-days"],
    AI_INBOX_ORGANIZE_MAX_INTERACTIONS_PER_SESSION: args["max-interactions"],
    AI_INBOX_ORGANIZE_MAX_SESSIONS: args["max-sessions"],
    AI_INBOX_ORGANIZE_MAX_OBSERVATIONS_PER_SESSION: args["max-observations"]
  };

  if (process.stdin.isTTY && Object.keys(args).length === 0) {
    env = await promptInit(env);
  }

  ensureDefaultEnv(paths, env);
  mkdirSync(paths.dataDir, { recursive: true });
  openDatabase(paths).close();
  console.log(`env: ${paths.envPath}`);
  console.log("initialized");
  return 0;
}

async function promptInit(defaults: EnvConfig): Promise<EnvConfig> {
  const rl = createInterface({ input, output });
  const env = { ...defaultEnvConfig(), ...defaults };
  try {
    return {
      AI_INBOX_CODEX_HOME: await ask(rl, "Codex source path", env.AI_INBOX_CODEX_HOME),
      AI_INBOX_CLAUDE_HOME: await ask(rl, "Claude Code source path", env.AI_INBOX_CLAUDE_HOME),
      AI_INBOX_CURSOR_HOME: await ask(rl, "Cursor source path", env.AI_INBOX_CURSOR_HOME),
      AI_INBOX_LLM_ENABLED: await ask(rl, "LLM enabled", env.AI_INBOX_LLM_ENABLED),
      AI_INBOX_LLM_PROTOCOL: await ask(rl, "LLM protocol", env.AI_INBOX_LLM_PROTOCOL),
      AI_INBOX_LLM_PROVIDER: await ask(rl, "LLM provider", env.AI_INBOX_LLM_PROVIDER),
      AI_INBOX_LLM_MODEL: await ask(rl, "LLM model", env.AI_INBOX_LLM_MODEL),
      AI_INBOX_LLM_ENDPOINT: await ask(rl, "LLM endpoint", env.AI_INBOX_LLM_ENDPOINT),
      AI_INBOX_LLM_API_KEY: await ask(rl, "LLM API key", env.AI_INBOX_LLM_API_KEY),
      AI_INBOX_ORGANIZE_SINCE_DAYS: await ask(rl, "Look-back days", env.AI_INBOX_ORGANIZE_SINCE_DAYS),
      AI_INBOX_ORGANIZE_MAX_INTERACTIONS_PER_SESSION: await ask(rl, "Max interactions per session", env.AI_INBOX_ORGANIZE_MAX_INTERACTIONS_PER_SESSION),
      AI_INBOX_ORGANIZE_MAX_SESSIONS: await ask(rl, "Max sessions", env.AI_INBOX_ORGANIZE_MAX_SESSIONS),
      AI_INBOX_ORGANIZE_MAX_OBSERVATIONS_PER_SESSION: await ask(rl, "Max observations per session", env.AI_INBOX_ORGANIZE_MAX_OBSERVATIONS_PER_SESSION)
    };
  } finally {
    rl.close();
  }
}

async function ask(rl: ReturnType<typeof createInterface>, label: string, value: string | undefined): Promise<string | undefined> {
  const suffix = value ? ` [${value}]` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || value;
}

function parseOptions(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    index++;
  }
  return args;
}

async function withDatabase(fn: (db: Database) => number | Promise<number>): Promise<number> {
  const db = openDatabase(getAppPaths());
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

async function configCommand(argv: string[]): Promise<number> {
  const action = argv[0];
  const args = parseOptions(argv.slice(1));
  const paths = getAppPaths();
  if (action === "get") {
    const settings = publicConfig(loadConfig(paths), loadSecrets(paths));
    if (argv.includes("--json")) console.log(JSON.stringify(settings, null, 2));
    else {
      console.log(`llm protocol: ${settings.llm.protocol}`);
      console.log(`llm key: ${settings.llm.apiKeySource ?? (settings.llm.apiKeyConfigured ? "configured" : "missing")}`);
      console.log(`llm model: ${settings.llm.model}`);
      console.log(`llm endpoint: ${settings.llm.endpoint}`);
    }
    return 0;
  }
  if (action === "set") {
    const current = loadConfig(paths);
    const next: AppConfig = {
      sources: {
        codex: args["codex-home"] ? { path: args["codex-home"] } : current.sources.codex,
        "claude-code": args["claude-home"] ? { path: args["claude-home"] } : current.sources["claude-code"],
        cursor: args["reset-cursor-path"] ? {} : args["cursor-home"] ? { path: args["cursor-home"] } : current.sources.cursor
      },
      llm: {
        ...current.llm,
        enabled: args["llm-enabled"] === undefined ? current.llm.enabled : args["llm-enabled"] === "true",
        protocol: (args["llm-protocol"] ?? current.llm.protocol) as AppConfig["llm"]["protocol"],
        model: args.model ?? current.llm.model,
        endpoint: args.endpoint ?? current.llm.endpoint,
        thinkingDepth: (args["thinking-depth"] ?? current.llm.thinkingDepth) as AppConfig["llm"]["thinkingDepth"],
        timeoutMs: args["timeout-ms"] ? Number(args["timeout-ms"]) : current.llm.timeoutMs
      },
      organize: {
        ...current.organize,
        sinceDays: args["since-days"] ? Number(args["since-days"]) : current.organize.sinceDays,
        maxInteractionsPerSession: args["max-interactions"] ? Number(args["max-interactions"]) : current.organize.maxInteractionsPerSession,
        maxSessions: args["max-sessions"] ? Number(args["max-sessions"]) : current.organize.maxSessions,
        maxObservationsPerSession: args["max-observations"] ? Number(args["max-observations"]) : current.organize.maxObservationsPerSession
      }
    };
    saveEnvConfig(paths, settingsToEnv(next, loadSecrets(paths), args["api-key"]));
    console.log("settings updated");
    return 0;
  }
  console.error("usage: ai-inbox config <get|set> [options]");
  return 1;
}

async function startUi(argv: string[] = [], command = "start"): Promise<number> {
  const args = parseOptions(argv);
  const port = args.port ? Number(args.port) : DEFAULT_UI_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("invalid port");
    return 1;
  }
  const paths = getAppPaths();
  const db = openDatabase(paths);
  const startupScanner = createStartupScanner(db, paths);
  const server = createAppServer({ db, paths, startupScan: startupScanner.status });
  try {
    await listen(server, port);
  } catch (error) {
    db.close();
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error(`${port} is already in use. Try ai-inbox ${command} --port <port>.`);
      return 1;
    }
    console.error((error as Error).message);
    return 1;
  }
  startupScanner.start();
  const address = server.address();
  if (!address || typeof address === "string") return 1;
  console.log(`AI-Inbox UI: http://127.0.0.1:${address.port}/`);
  console.log("Press Ctrl+C to stop.");
  await new Promise<void>((resolve) => {
    const stop = () => {
      server.close(() => {
        db.close();
        resolve();
      });
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return 0;
}

function listen(server: ReturnType<typeof createAppServer>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function scan(db: Database, source: string | undefined, path: string | undefined): number {
  if (!source) {
    console.error("usage: ai-inbox scan <codex|claude-code|cursor> [path]");
    return 1;
  }

  const scan = scanSource(db, source, path);
  if (!scan.ok && scan.error === "unsupported_source") {
    console.error(`unsupported source: ${source}`);
    return 1;
  }
  if (!scan.ok) {
    console.error(`path not found for ${source}`);
    return 1;
  }

  const result = scan.result;
  console.log(`source: ${result.source}`);
  console.log(`scanned: ${result.scanned}`);
  console.log(`observations: ${result.observations}`);
  console.log(`skipped: ${result.skipped}`);
  return 0;
}

function updateStatus(db: Database, id: string | undefined, status: "todo" | "done" | "ignored"): number {
  if (!id) {
    console.error("missing todo id");
    return 1;
  }
  if (!updateTodoStatus(db, id, status)) {
    console.error(`todo not found: ${id}`);
    return 1;
  }
  console.log(`${status}: ${id}`);
  return 0;
}

function printOrganizeResult(result: Awaited<ReturnType<typeof organizeConfiguredTodos>>): void {
  console.log(`scanned: ${result.scanned}`);
  console.log(`created: ${result.created}`);
  console.log(`updated: ${result.updated}`);
  console.log(`completed: ${result.completed}`);
  console.log(`ignored: ${result.ignored}`);
  console.log(`engine: ${result.engine}`);
  if (result.warnings.length > 0) console.log(`warnings: ${result.warnings.join(",")}`);
  for (const failure of result.details?.batchFailures ?? []) {
    console.log(`failure: ${failure.warning} ${failure.reason} retryable=${failure.retryable}`);
  }
}

function printPreflightResult(result: Awaited<ReturnType<typeof runPreflight>>): void {
  console.log(`can organize: ${result.canOrganize}`);
  console.log(`duration ms: ${result.durationMs}`);
  for (const check of result.checks) {
    console.log(`${check.status} ${check.id}${check.reason ? ` ${check.reason}` : ""}: ${check.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
