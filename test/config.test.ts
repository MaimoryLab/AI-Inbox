import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getAppPaths } from "../src/paths.js";
import {
  defaultConfig,
  ensureDefaultEnv,
  formatEnvFile,
  loadConfig,
  loadEnvConfig,
  loadSecrets,
  maskSecret,
  parseEnvFile,
  publicConfig,
  saveConfig,
  saveEnvConfig,
  saveSecrets,
  settingsToEnv
} from "../src/config.js";
import { openDatabase } from "../src/db/index.js";
import { discoverSourcePaths, ensureDiscoveredSourceEnv } from "../src/sources/discovery.js";
import { resolveSourcePath, resolveSourcePaths, scanConfiguredSources } from "../src/sources/scan.js";

test("config reads defaults and persists source paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-config-"));
  try {
    const paths = getAppPaths(dir);
    assert.deepEqual(loadConfig(paths), {
      sources: {
        codex: {},
        "claude-code": {}
      },
      llm: {
        enabled: true,
        provider: "openai",
        model: "deepseek/deepseek-v4-flash",
        endpoint: "https://api.novita.ai/openai/v1",
        thinkingDepth: "low",
        timeoutMs: 120000
      },
      organize: {
        sinceDays: 7,
        maxInteractionsPerSession: 10,
        maxSessions: 16,
        maxObservationsPerSession: 40
      }
    });

    const config = {
      sources: {
        codex: { path: join(dir, "codex") },
        "claude-code": { path: join(dir, "claude") }
      },
      llm: {
        enabled: true,
        provider: "openai" as const,
        model: "custom/model",
        endpoint: "https://llm.example.test/v1",
        thinkingDepth: "high" as const,
        timeoutMs: 30000
      },
      organize: {
        sinceDays: 14,
        maxInteractionsPerSession: 20,
        maxSessions: 12,
        maxObservationsPerSession: 30
      }
    };
    saveConfig(paths, config);
    assert.deepEqual(loadConfig(paths), config);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config rejects invalid files and preserves source path precedence", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-config-invalid-"));
  const previousCodex = process.env.AI_INBOX_CODEX_HOME;
  delete process.env.AI_INBOX_CODEX_HOME;

  try {
    const paths = getAppPaths(dir);
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(paths.configPath, "{");
    assert.throws(() => loadConfig(paths), /config_invalid/);

    const explicit = join(dir, "explicit");
    const env = join(dir, "env");
    const configPath = join(dir, "config-codex");
    saveConfig(paths, {
      sources: { codex: { path: configPath }, "claude-code": {} },
      llm: {
        enabled: true,
        provider: "openai",
        model: "deepseek/deepseek-v4-flash",
        endpoint: "https://api.novita.ai/openai/v1",
        thinkingDepth: "low",
        timeoutMs: 120000
      },
      organize: {
        sinceDays: 7,
        maxInteractionsPerSession: 10,
        maxSessions: 8,
        maxObservationsPerSession: 40
      }
    });
    assert.equal(resolveSourcePath("codex", explicit, paths), explicit);
    process.env.AI_INBOX_CODEX_HOME = env;
    assert.equal(resolveSourcePath("codex", undefined, paths), env);
    delete process.env.AI_INBOX_CODEX_HOME;
    assert.equal(resolveSourcePath("codex", undefined, paths), configPath);
  } finally {
    if (previousCodex === undefined) {
      delete process.env.AI_INBOX_CODEX_HOME;
    } else {
      process.env.AI_INBOX_CODEX_HOME = previousCodex;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config rejects invalid llm settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-config-llm-invalid-"));
  try {
    const paths = getAppPaths(dir);
    assert.throws(() => saveConfig(paths, {
      sources: { codex: {}, "claude-code": {} },
      llm: {
        enabled: true,
        provider: "anthropic" as any,
        model: "model",
        endpoint: "https://example.test/v1",
        thinkingDepth: "medium",
        timeoutMs: 120000
      },
      organize: { sinceDays: 7, maxInteractionsPerSession: 10, maxSessions: 8, maxObservationsPerSession: 40 }
    }), /config_invalid/);
    assert.throws(() => saveConfig(paths, {
      sources: { codex: {}, "claude-code": {} },
      llm: {
        enabled: true,
        provider: "openai",
        model: "",
        endpoint: "https://example.test/v1",
        thinkingDepth: "medium",
        timeoutMs: 120000
      },
      organize: { sinceDays: 7, maxInteractionsPerSession: 10, maxSessions: 8, maxObservationsPerSession: 40 }
    }), /config_invalid/);
    assert.throws(() => saveConfig(paths, {
      sources: { codex: {}, "claude-code": {} },
      llm: {
        enabled: true,
        provider: "openai",
        model: "model",
        endpoint: "",
        thinkingDepth: "medium",
        timeoutMs: 120000
      },
      organize: { sinceDays: 7, maxInteractionsPerSession: 10, maxSessions: 8, maxObservationsPerSession: 40 }
    }), /config_invalid/);
    assert.throws(() => saveConfig(paths, {
      sources: { codex: {}, "claude-code": {} },
      llm: {
        enabled: true,
        provider: "openai",
        model: "model",
        endpoint: "https://example.test/v1",
        thinkingDepth: "medium",
        timeoutMs: 0
      },
      organize: { sinceDays: 7, maxInteractionsPerSession: 10, maxSessions: 8, maxObservationsPerSession: 40 }
    }), /config_invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("secrets persist separately and mask api keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-secrets-"));
  try {
    const paths = getAppPaths(dir);
    assert.deepEqual(loadSecrets(paths), {});
    saveSecrets(paths, { llmApiKey: "dummy-llm-key-value" });
    assert.equal(loadSecrets(paths).llmApiKey, "dummy-llm-key-value");
    assert.equal(maskSecret("dummy-llm-key-value"), "dum****alue");
    assert.ok(existsSync(paths.secretsPath));
    assert.match(readFileSync(paths.secretsPath, "utf8"), /dummy-llm-key-value/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("managed release artifact secrets are used without leaking the key", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-managed-secrets-"));
  const previousConfig = process.env.AI_INBOX_MANAGED_LLM_CONFIG;
  const previousManagedKey = process.env.AI_INBOX_MANAGED_LLM_API_KEY;
  const previousManagedKeys = process.env.AI_INBOX_MANAGED_LLM_API_KEYS;
  try {
    const paths = getAppPaths(dir);
    const managedConfig = join(dir, "managed-llm.json");
    writeFileSync(managedConfig, JSON.stringify({
      endpoint: "https://api.novita.ai/openai/v1",
      model: "deepseek/deepseek-v4-flash",
      apiKeys: ["dummy-managed-key-a", "dummy-managed-key-b"],
      createdAt: "2026-07-06T00:00:00.000Z"
    }));
    process.env.AI_INBOX_MANAGED_LLM_CONFIG = managedConfig;
    process.env.AI_INBOX_MANAGED_LLM_API_KEY = "dummy-runtime-key";
    process.env.AI_INBOX_MANAGED_LLM_API_KEYS = "dummy-runtime-key-a,dummy-runtime-key-b";

    const managed = loadSecrets(paths);
    assert.equal(managed.llmApiKeySource, "managed");
    assert.ok(["dummy-managed-key-a", "dummy-managed-key-b"].includes(managed.llmApiKey ?? ""));
    assert.equal(loadSecrets(paths).llmApiKey, managed.llmApiKey);

    const publicSettings = publicConfig(defaultConfig(), managed);
    assert.equal(publicSettings.llm.apiKeyConfigured, true);
    assert.equal(publicSettings.llm.apiKeySource, "managed");
    assert.equal(publicSettings.llm.apiKeyMasked, "managed");
    assert.equal(settingsToEnv(defaultConfig(), managed).AI_INBOX_LLM_API_KEY, undefined);

    saveSecrets(paths, { llmApiKey: "dummy-user-key" });
    assert.deepEqual(loadSecrets(paths), { llmApiKey: "dummy-user-key", llmApiKeySource: "configured" });
    saveSecrets(paths, {});
    assert.equal(loadSecrets(paths).llmApiKeySource, "managed");
  } finally {
    if (previousConfig === undefined) delete process.env.AI_INBOX_MANAGED_LLM_CONFIG;
    else process.env.AI_INBOX_MANAGED_LLM_CONFIG = previousConfig;
    if (previousManagedKey === undefined) delete process.env.AI_INBOX_MANAGED_LLM_API_KEY;
    else process.env.AI_INBOX_MANAGED_LLM_API_KEY = previousManagedKey;
    if (previousManagedKeys === undefined) delete process.env.AI_INBOX_MANAGED_LLM_API_KEYS;
    else process.env.AI_INBOX_MANAGED_LLM_API_KEYS = previousManagedKeys;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("managed runtime environment secrets are a fallback after artifact lookup", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-managed-env-"));
  const previousConfig = process.env.AI_INBOX_MANAGED_LLM_CONFIG;
  const previousManagedKey = process.env.AI_INBOX_MANAGED_LLM_API_KEY;
  const previousManagedKeys = process.env.AI_INBOX_MANAGED_LLM_API_KEYS;
  try {
    const paths = getAppPaths(dir);
    process.env.AI_INBOX_MANAGED_LLM_CONFIG = join(dir, "missing-managed-llm.json");
    delete process.env.AI_INBOX_MANAGED_LLM_API_KEY;
    process.env.AI_INBOX_MANAGED_LLM_API_KEYS = "dummy-env-key-a\ndummy-env-key-b";

    const managed = loadSecrets(paths);
    assert.equal(managed.llmApiKeySource, "managed");
    assert.ok(["dummy-env-key-a", "dummy-env-key-b"].includes(managed.llmApiKey ?? ""));
  } finally {
    if (previousConfig === undefined) delete process.env.AI_INBOX_MANAGED_LLM_CONFIG;
    else process.env.AI_INBOX_MANAGED_LLM_CONFIG = previousConfig;
    if (previousManagedKey === undefined) delete process.env.AI_INBOX_MANAGED_LLM_API_KEY;
    else process.env.AI_INBOX_MANAGED_LLM_API_KEY = previousManagedKey;
    if (previousManagedKeys === undefined) delete process.env.AI_INBOX_MANAGED_LLM_API_KEYS;
    else process.env.AI_INBOX_MANAGED_LLM_API_KEYS = previousManagedKeys;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env config parses comments, quotes, defaults, and masks api keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-env-"));
  try {
    const paths = getAppPaths(dir);
    saveEnvConfig(paths, parseEnvFile([
      "# local config",
      "AI_INBOX_CODEX_HOME='/tmp/codex sessions'",
      "AI_INBOX_LLM_MODEL=custom/model # comment",
      "AI_INBOX_LLM_API_KEY=\"dummy-llm-key-value\"",
      "AI_INBOX_ORGANIZE_SINCE_DAYS=30"
    ].join("\n")));
    const env = loadEnvConfig(paths);
    assert.equal(env.AI_INBOX_CODEX_HOME, "/tmp/codex sessions");
    assert.equal(env.AI_INBOX_LLM_MODEL, "custom/model");
    assert.equal(loadSecrets(paths).llmApiKey, "dummy-llm-key-value");
    assert.match(formatEnvFile(env), /AI_INBOX_LLM_API_KEY=dummy-llm-key-value/);
    assert.throws(() => parseEnvFile("UNSUPPORTED=value"), /env_invalid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env config ignores removed python setting for existing installs", () => {
  const removedKey = "AI_INBOX_LLM_" + "PYTHON";
  assert.deepEqual(parseEnvFile(`${removedKey}=python3\nAI_INBOX_LLM_MODEL=custom/model`), {
    AI_INBOX_LLM_MODEL: "custom/model"
  });
});

test("default env generation writes necessary values without empty api key", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-env-default-"));
  try {
    const paths = getAppPaths(dir);
    ensureDefaultEnv(paths);
    const text = readFileSync(paths.envPath, "utf8");
    assert.match(text, /AI_INBOX_CODEX_HOME=.*\.codex/);
    assert.doesNotMatch(text, /AI_INBOX_CODEX_HOME=.*\.codex\/sessions/);
    assert.match(text, /AI_INBOX_LLM_MODEL=deepseek\/deepseek-v4-flash/);
    assert.match(text, /AI_INBOX_LLM_THINKING_DEPTH=low/);
    assert.match(text, /AI_INBOX_ORGANIZE_SINCE_DAYS=7/);
    assert.match(text, /AI_INBOX_ORGANIZE_MAX_SESSIONS=16/);
    assert.match(text, /AI_INBOX_ORGANIZE_MAX_OBSERVATIONS_PER_SESSION=40/);
    assert.doesNotMatch(text, /AI_INBOX_LLM_API_KEY/);
    assert.equal((readFileSync(paths.envPath).byteLength > 0), true);
    if (process.platform !== "win32") assert.equal(statSync(paths.envPath).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("partial source init keeps unconfigured sources out of env but startup scan checks missing defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-env-partial-source-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const previousClaude = process.env.AI_INBOX_CLAUDE_HOME;
  delete process.env.AI_INBOX_CLAUDE_HOME;

  try {
    process.env.HOME = dir;
    process.env.USERPROFILE = dir;
    const paths = getAppPaths(dir);
    const codexHome = join(dir, ".codex");
    mkdirSync(join(codexHome, "sessions"), { recursive: true });
    mkdirSync(join(dir, ".claude", "projects"), { recursive: true });

    ensureDefaultEnv(paths, { AI_INBOX_CODEX_HOME: codexHome });
    const text = readFileSync(paths.envPath, "utf8");
    assert.match(text, /AI_INBOX_CODEX_HOME=/);
    assert.doesNotMatch(text, /AI_INBOX_CLAUDE_HOME/);

    const db = openDatabase(paths);
    try {
      const scan = scanConfiguredSources(db, paths);
      assert.deepEqual(scan.sources.map((source) => source.source), ["codex", "claude-code"]);
      assert.ok(scan.warnings.includes("codex_no_sessions"));
      assert.ok(scan.warnings.includes("claude-code_no_sessions"));
    } finally {
      db.close();
    }
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    if (previousClaude === undefined) delete process.env.AI_INBOX_CLAUDE_HOME;
    else process.env.AI_INBOX_CLAUDE_HOME = previousClaude;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("configured scan counts Windows-style session paths under configured roots", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-windows-paths-"));
  try {
    const paths = getAppPaths(dir);
    const codexHome = join(dir, ".codex");
    mkdirSync(join(codexHome, "sessions"), { recursive: true });
    ensureDefaultEnv(paths, { AI_INBOX_CODEX_HOME: codexHome });

    const windowsRoot = join(codexHome, "sessions").replace(/\//gu, "\\");
    const db = openDatabase(paths);
    try {
      db.prepare("INSERT INTO sessions (id, source, path, updated_at) VALUES ('win-session', 'codex', ?, '2026-01-01T00:00:00.000Z')")
        .run(`${windowsRoot}\\2026\\01\\01\\session.jsonl`);
      const scan = scanConfiguredSources(db, paths);
      assert.ok(!scan.warnings.includes("codex_no_sessions"));
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("source discovery writes missing agent paths without overwriting configured env", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-discovery-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const previousCodex = process.env.AI_INBOX_CODEX_HOME;
  const previousClaude = process.env.AI_INBOX_CLAUDE_HOME;
  delete process.env.AI_INBOX_CODEX_HOME;
  delete process.env.AI_INBOX_CLAUDE_HOME;

  try {
    process.env.HOME = dir;
    process.env.USERPROFILE = dir;
    const paths = getAppPaths(join(dir, "home"));
    mkdirSync(join(dir, ".codex", "sessions"), { recursive: true });
    mkdirSync(join(dir, ".claude", "projects"), { recursive: true });

    const discovered = discoverSourcePaths(paths);
    assert.deepEqual(discovered.map((source) => [source.source, source.status]), [
      ["codex", "discovered"],
      ["claude-code", "discovered"]
    ]);

    ensureDiscoveredSourceEnv(paths);
    const env = loadEnvConfig(paths);
    assert.equal(env.AI_INBOX_CODEX_HOME, join(dir, ".codex"));
    assert.equal(env.AI_INBOX_CLAUDE_HOME, join(dir, ".claude", "projects"));

    process.env.AI_INBOX_CODEX_HOME = join(dir, "custom-codex");
    ensureDiscoveredSourceEnv(paths);
    assert.equal(loadEnvConfig(paths).AI_INBOX_CODEX_HOME, join(dir, ".codex"));
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    if (previousCodex === undefined) delete process.env.AI_INBOX_CODEX_HOME;
    else process.env.AI_INBOX_CODEX_HOME = previousCodex;
    if (previousClaude === undefined) delete process.env.AI_INBOX_CLAUDE_HOME;
    else process.env.AI_INBOX_CLAUDE_HOME = previousClaude;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("source discovery leaves env empty when agent paths are missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-discovery-missing-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const previousCodex = process.env.AI_INBOX_CODEX_HOME;
  const previousClaude = process.env.AI_INBOX_CLAUDE_HOME;
  delete process.env.AI_INBOX_CODEX_HOME;
  delete process.env.AI_INBOX_CLAUDE_HOME;

  try {
    process.env.HOME = dir;
    process.env.USERPROFILE = dir;
    const paths = getAppPaths(join(dir, "home"));
    const discovery = ensureDiscoveredSourceEnv(paths);
    assert.deepEqual(discovery.map((source) => [source.source, source.status]), [
      ["codex", "missing"],
      ["claude-code", "missing"]
    ]);
    assert.deepEqual(loadEnvConfig(paths), {});
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    if (previousCodex === undefined) delete process.env.AI_INBOX_CODEX_HOME;
    else process.env.AI_INBOX_CODEX_HOME = previousCodex;
    if (previousClaude === undefined) delete process.env.AI_INBOX_CLAUDE_HOME;
    else process.env.AI_INBOX_CLAUDE_HOME = previousClaude;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex home expands to sessions and archived sessions roots", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-codex-roots-"));
  try {
    const codexHome = join(dir, ".codex");
    mkdirSync(join(codexHome, "sessions"), { recursive: true });
    mkdirSync(join(codexHome, "archived_sessions"), { recursive: true });
    assert.deepEqual(resolveSourcePaths("codex", codexHome), [
      join(codexHome, "sessions"),
      join(codexHome, "archived_sessions")
    ]);
    assert.equal(resolveSourcePath("codex", codexHome), join(codexHome, "sessions"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stale temporary source paths are ignored when loading config", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-stale-config-"));
  try {
    const paths = getAppPaths(dir);
    saveEnvConfig(paths, parseEnvFile("AI_INBOX_CODEX_HOME=/var/folders/x/ai-inbox-http-deadbeef/codex"));
    assert.deepEqual(loadConfig(paths).sources.codex, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
