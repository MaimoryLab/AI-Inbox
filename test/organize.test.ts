import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase } from "../src/db/index.js";
import { getAppPaths } from "../src/paths.js";
import { createAppServer } from "../src/server/index.js";
import { ingestBrowserSession } from "../src/sources/browser.js";
import { listTodos, organizeTodos, scopeObservations } from "../src/todos/service.js";

test("rules-only organize creates evidence-backed todo cards without duplicates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-"));
  try {
    const db = openDatabase(getAppPaths(dir));
    ingestBrowserSession(db, {
      id: "browser-1",
      messages: [
        { role: "user", text: "Please add a CLI doctor command" },
        { role: "assistant", text: "Implemented the doctor command" }
      ]
    });

    const first = await organizeTodos(db);
    assert.equal(first.engine, "rules");
    assert.deepEqual(first.warnings, ["llm_enhancer_unavailable"]);
    assert.equal(first.scanned, 2);
    assert.equal(first.created, 1);
    assert.equal(first.updated, 0);
    assert.equal(first.sources[0]?.source, "browser");

    const second = await organizeTodos(db);
    assert.equal(second.created, 0);
    assert.equal(second.updated, 1);

    const todos = listTodos(db);
    db.close();
    assert.equal(todos.length, 1);
    assert.equal(todos[0].title, "Add a CLI doctor command");
    assert.equal(todos[0].status, "todo");
    assert.equal(todos[0].evidenceIds.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("optional enhancer can improve card title and description", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-enhance-"));
  try {
    const db = openDatabase(getAppPaths(dir));
    ingestBrowserSession(db, {
      id: "browser-1",
      messages: [{ role: "user", text: "Please add api route docs because users need examples" }]
    });

    const result = await organizeTodos(db, {
      enhancer: async (candidate) => ({
        title: "Add API route examples",
        description: `Enhanced: ${candidate.description}`
      })
    });
    const todos = listTodos(db);
    db.close();

    assert.equal(result.engine, "rules+llm");
    assert.deepEqual(result.warnings, []);
    assert.equal(todos[0].title, "Add API route examples");
    assert.equal(todos[0].description, "Enhanced: Please add api route docs because users need examples");
    assert.equal(todos[0].evidenceIds.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("optional enhancer failure falls back to rules card with warning", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-enhance-fallback-"));
  try {
    const db = openDatabase(getAppPaths(dir));
    ingestBrowserSession(db, {
      id: "browser-1",
      messages: [{ role: "user", text: "Please add API route docs" }]
    });

    const result = await organizeTodos(db, {
      enhancer: async () => {
        throw new Error("provider unavailable");
      }
    });
    const todos = listTodos(db);
    db.close();

    assert.equal(result.engine, "rules");
    assert.deepEqual(result.warnings, ["llm_enhancer_failed"]);
    assert.equal(todos[0].title, "Add API route docs");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid enhancer output falls back to rules card with warning", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-enhance-invalid-"));
  try {
    const db = openDatabase(getAppPaths(dir));
    ingestBrowserSession(db, {
      id: "browser-1",
      messages: [{ role: "user", text: "Please add API route docs" }]
    });

    const result = await organizeTodos(db, {
      enhancer: async () => ({ title: "", description: "ignored" })
    });
    const todos = listTodos(db);
    db.close();

    assert.equal(result.engine, "rules");
    assert.deepEqual(result.warnings, ["llm_enhancer_invalid"]);
    assert.equal(todos[0].title, "Add API route docs");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("organize endpoint returns OrganizeResult", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-http-"));
  const paths = getAppPaths(dir);
  const db = openDatabase(paths);
  ingestBrowserSession(db, {
    id: "browser-1",
    messages: [{ role: "user", text: "Need update settings persistence" }]
  });
  const server = createAppServer({ db, paths });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/todos/organize`, { method: "POST" });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.engine, "rules");
    assert.equal(result.created, 1);
    assert.equal(result.ignored, 0);
    assert.deepEqual(result.warnings, ["llm_config_missing"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("organize endpoint can use configured llm extraction", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-http-llm-"));
  const paths = getAppPaths(dir);
  const db = openDatabase(paths);
  ingestBrowserSession(db, {
    id: "browser-1",
    messages: [{ role: "user", text: "Please add HTTP LLM cards" }]
  });
  const observationId = String((db.prepare("SELECT id FROM observations LIMIT 1").get() as any).id);
  const server = createAppServer({
    db,
    paths,
    organizeOptions: {
      llmExtractor: async () => ({
        ok: true,
        todos: [{
          title: "Add HTTP LLM cards",
          description: "Use the configured LLM path from the HTTP endpoint.",
          confidence: 0.9,
          sourceObservationId: observationId,
          quote: "Please add HTTP LLM cards",
          dedupeKey: "http-llm-cards"
        }]
      })
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/todos/organize`, { method: "POST" });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.engine, "llm");
    assert.equal(result.created, 1);
    assert.deepEqual(result.warnings, []);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rules-only organize merges duplicate todo wording", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-merge-"));
  try {
    const db = openDatabase(getAppPaths(dir));
    ingestBrowserSession(db, {
      id: "browser-1",
      messages: [
        { role: "user", text: "Please add CLI list output" },
        { role: "user", text: "Need to add cli list output." },
        { role: "user", text: "Please take a look when you have time." }
      ]
    });

    const result = await organizeTodos(db);
    const todos = listTodos(db);
    db.close();

    assert.equal(result.created, 1);
    assert.equal(todos.length, 1);
    assert.equal(todos[0].title, "Add CLI list output");
    assert.equal(todos[0].evidenceIds.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("llm organize creates grounded cards and dedupes by model key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-llm-"));
  try {
    const db = openDatabase(getAppPaths(dir));
    ingestBrowserSession(db, {
      id: "browser-1",
      messages: [
        { role: "user", text: "Please add LLM settings UI" },
        { role: "user", text: "Please add LLM settings UI" }
      ]
    });
    const observationId = String((db.prepare("SELECT id FROM observations ORDER BY created_at, id LIMIT 1").get() as any).id);

    const result = await organizeTodos(db, {
      llmExtractor: async () => ({
        ok: true,
        todos: [{
          title: "Add LLM settings UI",
          description: "Add settings controls for the LLM provider.",
          confidence: 0.91,
          sourceObservationId: observationId,
          quote: "Please add LLM settings UI",
          dedupeKey: "add-llm-settings-ui"
        }]
      })
    });
    const second = await organizeTodos(db, {
      llmExtractor: async () => ({
        ok: true,
        todos: [{
          title: "Add LLM settings UI",
          description: "Add settings controls for the LLM provider.",
          confidence: 0.91,
          sourceObservationId: observationId,
          quote: "Please add LLM settings UI",
          dedupeKey: "add-llm-settings-ui"
        }]
      })
    });
    const todos = listTodos(db);
    db.close();

    assert.equal(result.engine, "llm");
    assert.deepEqual(result.warnings, []);
    assert.equal(result.created, 1);
    assert.equal(second.created, 0);
    assert.equal(second.updated, 1);
    assert.equal(todos.length, 1);
    assert.equal(todos[0].title, "Add LLM settings UI");
    assert.equal(todos[0].evidenceIds.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("llm organize falls back to rules when extractor is unavailable", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-llm-fallback-"));
  try {
    const db = openDatabase(getAppPaths(dir));
    ingestBrowserSession(db, {
      id: "browser-1",
      messages: [{ role: "user", text: "Please add fallback warnings" }]
    });

    const result = await organizeTodos(db, {
      llmExtractor: async () => ({ ok: false, warning: "llm_config_missing" })
    });
    const todos = listTodos(db);
    db.close();

    assert.equal(result.engine, "rules");
    assert.deepEqual(result.warnings, ["llm_config_missing"]);
    assert.equal(todos[0].title, "Add fallback warnings");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("llm organize rejects ungrounded model output and falls back", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-organize-llm-invalid-"));
  try {
    const db = openDatabase(getAppPaths(dir));
    ingestBrowserSession(db, {
      id: "browser-1",
      messages: [{ role: "user", text: "Please add grounded evidence checks" }]
    });
    const observationId = String((db.prepare("SELECT id FROM observations LIMIT 1").get() as any).id);

    const result = await organizeTodos(db, {
      llmExtractor: async () => ({
        ok: true,
        todos: [{
          title: "Add unrelated todo",
          description: "This quote is not grounded.",
          confidence: 0.9,
          sourceObservationId: observationId,
          quote: "missing quote",
          dedupeKey: "bad"
        }]
      })
    });
    const todos = listTodos(db);
    db.close();

    assert.equal(result.engine, "rules");
    assert.deepEqual(result.warnings, ["llm_no_valid_candidates"]);
    assert.equal(todos[0].title, "Add grounded evidence checks");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("organize scope filters old observations and keeps recent interactions per session", () => {
  const now = Date.now();
  const observations = [
    observation("old", "s1", "user", "old", new Date(now - 10 * 86400000).toISOString()),
    observation("u1", "s1", "user", "one", new Date(now - 3000).toISOString()),
    observation("a1", "s1", "assistant", "reply one", new Date(now - 2500).toISOString()),
    observation("u2", "s1", "user", "two", new Date(now - 2000).toISOString()),
    observation("a2", "s1", "assistant", "reply two", new Date(now - 1500).toISOString()),
    observation("u3", "s1", "user", "three", new Date(now - 1000).toISOString())
  ];
  assert.deepEqual(
    scopeObservations(observations, { sinceDays: 7, maxInteractionsPerSession: 2 }).map((item) => item.id),
    ["u2", "a2", "u3"]
  );
});

function observation(id: string, sessionId: string, role: string, text: string, createdAt: string) {
  return { id, sessionId, source: "browser" as const, role, text, createdAt };
}
