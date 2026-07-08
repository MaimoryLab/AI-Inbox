import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultConfig, saveEnvConfig, settingsToEnv } from "../src/config.js";
import { openDatabase } from "../src/db/index.js";
import { runPreflight } from "../src/diagnostics/preflight.js";
import { getAppPaths } from "../src/paths.js";
import { createAppServer } from "../src/server/index.js";

test("preflight returns missing api key without provider calls", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-preflight-missing-key-"));
  let calls = 0;
  const provider = await startMockProvider(async () => {
    calls++;
    return jsonResponse({});
  });

  try {
    const paths = getAppPaths(dir);
    const db = openDatabase(paths);
    try {
      saveEnvConfig(paths, settingsToEnv({
        ...defaultConfig(),
        llm: { ...defaultConfig().llm, endpoint: provider.url("/v1") }
      }, {}));
      const result = await runPreflight(db, paths);
      assert.equal(result.ok, false);
      assert.equal(result.canOrganize, false);
      assert.equal(result.checks.find((check) => check.id === "llm_api_key")?.reason, "api_key_missing");
      assert.equal(calls, 0);
    } finally {
      db.close();
    }
  } finally {
    await provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("preflight warns on missing models endpoint but passes tiny generation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-preflight-ok-"));
  const sourcePath = join(dir, "codex");
  mkdirSync(sourcePath, { recursive: true });
  const provider = await startMockProvider(async (request) => {
    if (request.url === "/v1/models") return jsonResponse({ error: "missing" }, 404);
    assert.equal(request.url, "/v1/chat/completions");
    return jsonResponse({ choices: [{ message: { content: JSON.stringify({ taskChains: [] }) } }] });
  });

  try {
    const paths = getAppPaths(dir);
    const db = openDatabase(paths);
    try {
      insertObservation(db, sourcePath);
      saveEnvConfig(paths, settingsToEnv({
        ...defaultConfig(),
        sources: { codex: { path: sourcePath }, "claude-code": {}, cursor: {} },
        llm: { ...defaultConfig().llm, endpoint: provider.url("/v1") }
      }, {}, "dummy-llm-key-value"));
      const result = await runPreflight(db, paths);
      assert.equal(result.ok, true);
      assert.equal(result.canOrganize, true);
      assert.equal(result.checks.find((check) => check.id === "llm_models")?.status, "warn");
      assert.equal(result.checks.find((check) => check.id === "llm_chat")?.status, "pass");
    } finally {
      db.close();
    }
  } finally {
    await provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HTTP preflight accepts temporary settings without saving them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-http-preflight-"));
  const sourcePath = join(dir, "codex");
  mkdirSync(sourcePath, { recursive: true });
  const provider = await startMockProvider(async (request) => {
    if (request.url === "/v1/models") return jsonResponse({ data: [{ id: "test/model" }] });
    return jsonResponse({ output_text: JSON.stringify({ taskChains: [] }) });
  });

  try {
    const paths = getAppPaths(dir);
    const db = openDatabase(paths);
    const server = createAppServer({ db, paths });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = (path: string) => `http://127.0.0.1:${address.port}${path}`;
    try {
      insertObservation(db, sourcePath);
      const response = await fetch(url("/diagnostics/preflight"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sources: { codex: { path: sourcePath }, "claude-code": {}, cursor: {} },
          llm: {
            ...defaultConfig().llm,
            protocol: "openai-responses",
            model: "test/model",
            endpoint: provider.url("/v1"),
            apiKey: "dummy-llm-key-value"
          },
          organize: defaultConfig().organize
        })
      });
      assert.equal(response.status, 200);
      const body = await response.json() as any;
      assert.equal(body.canOrganize, true);
      assert.equal(body.checks.find((check: any) => check.id === "llm_chat").status, "pass");
      assert.equal(defaultConfig().llm.protocol, "openai-chat");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      db.close();
    }
  } finally {
    await provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function insertObservation(db: ReturnType<typeof openDatabase>, sourcePath: string) {
  db.prepare("INSERT INTO sessions (id, source, path, updated_at) VALUES (?, ?, ?, ?)").run(
    "preflight-session",
    "codex",
    sourcePath,
    new Date().toISOString()
  );
  db.prepare("INSERT INTO observations (id, session_id, source, role, text, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    "preflight-observation",
    "preflight-session",
    "codex",
    "user",
    "Please create a card",
    new Date().toISOString()
  );
}

function jsonResponse(body: unknown, status = 200) {
  return { status, body };
}

async function startMockProvider(
  handler: (request: IncomingMessage) => Promise<{ status: number; body: unknown }>
) {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const result = await handler(request);
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: (error as Error).message }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: (path: string) => `http://127.0.0.1:${address.port}${path}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
