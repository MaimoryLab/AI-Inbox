import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase, type Database } from "../src/db/index.js";
import { getAppPaths } from "../src/paths.js";
import { createAppServer } from "../src/server/index.js";

test("HTTP API scans sources, lists sessions, observations, runs, and updates todos", async () => {
  const fixture = createFixture();
  const db = openDatabase(getAppPaths(join(fixture.root, "home")));
  const server = await startServer(db);

  try {
    const scan = await postJson(server.url("/sources/scan"), {
      source: "codex",
      path: fixture.codex
    });
    assert.equal(scan.status, 200);
    assert.deepEqual(await scan.json(), {
      source: "codex",
      scanned: 1,
      observations: 1,
      skipped: 0
    });

    const sources = await getJson(server.url("/sources"));
    assert.equal(sources.status, 200);
    const sourceBody = await sources.json();
    assert.equal(sourceBody.find((source: any) => source.source === "codex").sessions, 1);

    const sessions = await getJson(server.url("/sessions"));
    assert.equal(sessions.status, 200);
    const sessionBody = await sessions.json();
    assert.equal(sessionBody.length, 1);

    const observations = await getJson(server.url(`/sessions/${sessionBody[0].id}/observations`));
    assert.equal(observations.status, 200);
    assert.equal((await observations.json())[0].text, "Please add HTTP API routes");

    const organize = await postJson(server.url("/todos/organize"), {});
    const organizeBody = await organize.json();
    assert.equal(organize.status, 200);
    assert.equal(organizeBody.created, 1);

    const run = await getJson(server.url(`/organize-runs/${organizeBody.runId}`));
    assert.equal(run.status, 200);
    assert.equal((await run.json()).runId, organizeBody.runId);

    const todos = await getJson(server.url("/todos"));
    const todo = (await todos.json())[0];
    const patch = await patchJson(server.url(`/todos/${todo.id}`), { status: "done" });
    assert.equal(patch.status, 200);
    assert.equal((await patch.json()).status, "done");

    const updated = await getJson(server.url("/todos"));
    assert.equal((await updated.json())[0].status, "done");
  } finally {
    await server.close();
    db.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("HTTP API returns small explicit errors", async () => {
  const fixture = createFixture();
  const db = openDatabase(getAppPaths(join(fixture.root, "home")));
  const server = await startServer(db);

  try {
    assert.equal((await postJson(server.url("/sources/scan"), { source: "browser", path: fixture.codex })).status, 400);
    assert.equal((await postJson(server.url("/sources/scan"), { source: "codex", path: join(fixture.root, "missing") })).status, 400);
    assert.equal((await getJson(server.url("/sessions/missing/observations"))).status, 404);
    assert.equal((await patchJson(server.url("/todos/missing"), { status: "done" })).status, 404);
    assert.equal((await patchJson(server.url("/todos/missing"), { status: "todo" })).status, 400);
    assert.equal((await getJson(server.url("/organize-runs/missing"))).status, 404);
  } finally {
    await server.close();
    db.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("HTTP API reports missing database", async () => {
  const server = createAppServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = (path: string) => `http://127.0.0.1:${address.port}${path}`;

  try {
    assert.equal((await getJson(url("/sources"))).status, 503);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("HTTP API reports invalid JSON", async () => {
  const fixture = createFixture();
  const db = openDatabase(getAppPaths(join(fixture.root, "home")));
  const server = await startServer(db);

  try {
    const badJson = await fetch(server.url("/sources/scan"), {
      method: "POST",
      body: "{"
    });
    assert.equal(badJson.status, 400);
    assert.equal((await badJson.json()).error, "invalid_json");
  } finally {
    await server.close();
    db.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("HTTP source scan uses default paths with environment overrides", async () => {
  const fixture = createFixture();
  const previousCodex = process.env.AI_TODO_CODEX_HOME;
  process.env.AI_TODO_CODEX_HOME = fixture.codex;
  const db = openDatabase(getAppPaths(join(fixture.root, "home")));
  const server = await startServer(db);

  try {
    const response = await postJson(server.url("/sources/scan"), { source: "codex" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).scanned, 1);
  } finally {
    process.env.AI_TODO_CODEX_HOME = previousCodex;
    await server.close();
    db.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("HTTP browser ingest validates input", async () => {
  const fixture = createFixture();
  const db = openDatabase(getAppPaths(join(fixture.root, "home")));
  const server = await startServer(db);

  try {
    assert.equal((await postJson(server.url("/browser/sessions"), {})).status, 400);
    assert.equal((await postJson(server.url("/browser/sessions"), { messages: [] })).status, 400);
    assert.equal((await postJson(server.url("/browser/sessions"), { messages: [{ text: "" }] })).status, 400);
    assert.equal((await postJson(server.url("/browser/sessions"), { messages: [{ text: 1 }] })).status, 400);
    assert.equal((await postJson(server.url("/browser/sessions"), { messages: [{ text: "x", createdAt: "nope" }] })).status, 400);
    assert.equal((await postJson(server.url("/browser/sessions"), { messages: [{ role: "user", text: "Valid browser todo" }] })).status, 200);
  } finally {
    await server.close();
    db.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "ai-todo-http-"));
  const codex = join(root, "codex");
  mkdirSync(codex);
  writeFileSync(join(codex, "session.jsonl"), [
    JSON.stringify({ role: "user", text: "Please add HTTP API routes", timestamp: "2026-01-01T00:00:00.000Z" })
  ].join("\n"));
  return { root, codex };
}

async function startServer(db: Database) {
  const server = createAppServer({ db });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: (path: string) => `http://127.0.0.1:${address.port}${path}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function getJson(url: string) {
  return fetch(url);
}

function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function patchJson(url: string, body: unknown) {
  return fetch(url, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}
