import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase } from "../src/db/index.js";
import { getAppPaths } from "../src/paths.js";
import { parseJsonl } from "../src/parser/jsonl.js";
import { createAppServer } from "../src/server/index.js";
import { scanClaudeCodeSessions } from "../src/sources/claude-code.js";
import { scanCodexSessions } from "../src/sources/codex.js";

test("parseJsonl reads non-empty JSON object lines", () => {
  const records = parseJsonl("{\"text\":\"one\"}\n\n{\"text\":\"two\"}\n");
  assert.deepEqual(records.map((record) => record.value.text), ["one", "two"]);
});

test("codex and claude scanners write one observation model and skip unchanged files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-source-"));
  try {
    mkdirSync(join(dir, "codex"));
    mkdirSync(join(dir, "claude"));
    writeFileSync(join(dir, "codex", "session.jsonl"), [
      JSON.stringify({ role: "user", text: "Please add a CLI doctor command", timestamp: "2026-01-01T00:00:00.000Z" }),
      JSON.stringify({ message: { role: "assistant", content: [{ text: "Implemented doctor" }] } })
    ].join("\n"));
    writeFileSync(join(dir, "claude", "session.jsonl"), [
      JSON.stringify({ role: "user", content: "Fix the scanner checkpoint" })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.deepEqual(scanCodexSessions(db, join(dir, "codex")), {
      source: "codex",
      scanned: 1,
      observations: 2,
      skipped: 0
    });
    assert.deepEqual(scanCodexSessions(db, join(dir, "codex")), {
      source: "codex",
      scanned: 0,
      observations: 0,
      skipped: 1
    });
    assert.equal(scanClaudeCodeSessions(db, join(dir, "claude")).observations, 1);
    const rows = db.prepare("SELECT source, text FROM observations ORDER BY source, text").all();
    db.close();
    assert.equal(rows.length, 3);
    assert.ok(rows.some((row) => row.source === "claude-code" && row.text === "Fix the scanner checkpoint"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkpoint rescans when jsonl file mtime and size change", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-checkpoint-"));
  try {
    mkdirSync(join(dir, "codex"));
    const file = join(dir, "codex", "session.jsonl");
    writeFileSync(file, JSON.stringify({ role: "user", text: "Please scan once" }));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 1);
    writeFileSync(file, [
      JSON.stringify({ role: "user", text: "Please scan once" }),
      JSON.stringify({ role: "user", text: "Please scan twice now" })
    ].join("\n"));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 2);
    const row = db.prepare("SELECT COUNT(*) as count FROM observations").get();
    db.close();
    assert.ok(row);
    assert.equal(row.count, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("browser sessions endpoint ingests observations", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-browser-"));
  const db = openDatabase(getAppPaths(dir));
  const server = createAppServer({ db });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/browser/sessions`, {
      method: "POST",
      body: JSON.stringify({ id: "browser-1", messages: [{ role: "user", text: "Track this browser todo" }] })
    });
    assert.equal(response.status, 200);
    const row = db.prepare("SELECT COUNT(*) as count FROM observations WHERE source = 'browser'").get();
    assert.ok(row);
    assert.equal(row.count, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
