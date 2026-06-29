import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "../src/cli.js";

test("CLI runs scan, organize, list, done, and ignore", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-cli-"));
  const previousHome = process.env.AI_TODO_HOME;
  process.env.AI_TODO_HOME = join(dir, "home");

  try {
    const sessions = join(dir, "codex");
    mkdirSync(sessions);
    writeFileSync(join(sessions, "session.jsonl"), [
      JSON.stringify({ role: "user", text: "Please add CLI list output", timestamp: "2026-01-01T00:00:00.000Z" })
    ].join("\n"));

    const scanned = await capture(() => main(["scan", "codex", sessions]));
    assert.equal(scanned.code, 0);
    assert.match(scanned.stdout, /scanned: 1/);
    assert.match(scanned.stdout, /observations: 1/);
    const rescanned = await capture(() => main(["scan", "codex", sessions]));
    assert.equal(rescanned.code, 0);
    assert.match(rescanned.stdout, /skipped: 1/);
    const organized = await capture(() => main(["organize"]));
    assert.equal(organized.code, 0);
    assert.match(organized.stdout, /created: 1/);

    const listed = await capture(() => main(["list"]));
    assert.equal(listed.code, 0);
    assert.match(listed.stdout, /\btodo\b/);
    assert.match(listed.stdout, /add CLI list output/);
    const id = listed.stdout.match(/^([a-f0-9]{40})\s+/m)?.[1];
    assert.ok(id);

    assert.equal((await capture(() => main(["done", id]))).code, 0);
    assert.match((await capture(() => main(["list"]))).stdout, /\bdone\b/);

    assert.equal((await capture(() => main(["ignore", id]))).code, 0);
    assert.match((await capture(() => main(["list"]))).stdout, /\bignored\b/);
  } finally {
    process.env.AI_TODO_HOME = previousHome;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI reports empty lists and invalid todo updates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-cli-empty-"));
  const previousHome = process.env.AI_TODO_HOME;
  process.env.AI_TODO_HOME = join(dir, "home");

  try {
    const listed = await capture(() => main(["list"]));
    assert.equal(listed.code, 0);
    assert.match(listed.stdout, /No todos/);

    const missingId = await capture(() => main(["done"]));
    assert.equal(missingId.code, 1);
    assert.match(missingId.stderr, /missing todo id/);

    const unknownId = await capture(() => main(["ignore", "missing"]));
    assert.equal(unknownId.code, 1);
    assert.match(unknownId.stderr, /todo not found/);

    const missingScanArgs = await capture(() => main(["scan"]));
    assert.equal(missingScanArgs.code, 1);
    assert.match(missingScanArgs.stderr, /usage: ai-todo scan/);

    const badSource = await capture(() => main(["scan", "browser", dir]));
    assert.equal(badSource.code, 1);
    assert.match(badSource.stderr, /unsupported source/);

    const missingPath = await capture(() => main(["scan", "codex", join(dir, "missing")]));
    assert.equal(missingPath.code, 1);
    assert.match(missingPath.stderr, /path not found/);
  } finally {
    process.env.AI_TODO_HOME = previousHome;
    rmSync(dir, { recursive: true, force: true });
  }
});

async function capture(fn: () => Promise<number>) {
  let stdout = "";
  let stderr = "";
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    stdout += `${args.join(" ")}\n`;
  };
  console.error = (...args: unknown[]) => {
    stderr += `${args.join(" ")}\n`;
  };
  try {
    return { code: await fn(), stdout, stderr };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
