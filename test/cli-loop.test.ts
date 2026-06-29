import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      JSON.stringify({ role: "user", text: "Please add CLI list output", timestamp: new Date().toISOString() })
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
    assert.match(organized.stdout, /engine: rules/);
    assert.match(organized.stdout, /warnings: llm_config_missing/);

    const listed = await capture(() => main(["list"]));
    assert.equal(listed.code, 0);
    assert.match(listed.stdout, /\btodo\b/);
    assert.match(listed.stdout, /Add CLI list output/);
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

test("CLI init writes local env config and doctor reports it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-cli-init-"));
  const previousHome = process.env.AI_TODO_HOME;
  process.env.AI_TODO_HOME = join(dir, "home");

  try {
    const init = await capture(() => main([
      "init",
      "--api-key", "dummy-llm-key-value",
      "--model", "custom/model",
      "--endpoint", "https://llm.example.test/v1",
      "--codex-home", join(dir, "codex"),
      "--claude-home", join(dir, "claude"),
      "--since-days", "30",
      "--max-interactions", "15"
    ]));
    assert.equal(init.code, 0);
    const envText = readFileSync(join(process.env.AI_TODO_HOME, ".env"), "utf8");
    assert.match(envText, /AI_TODO_LLM_MODEL=custom\/model/);
    assert.match(envText, /AI_TODO_LLM_API_KEY=dummy-llm-key-value/);
    const doctor = await capture(() => main(["doctor"]));
    assert.equal(doctor.code, 0);
    assert.match(doctor.stdout, /llm key: configured/);
    assert.doesNotMatch(doctor.stdout, /dummy-llm-key-value/);
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

    const missingScanSource = await capture(() => main(["scan"]));
    assert.equal(missingScanSource.code, 1);
    assert.match(missingScanSource.stderr, /usage: ai-todo scan/);

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

test("CLI scan uses default source paths with environment overrides", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-cli-defaults-"));
  const previousHome = process.env.AI_TODO_HOME;
  const previousCodex = process.env.AI_TODO_CODEX_HOME;
  const previousClaude = process.env.AI_TODO_CLAUDE_HOME;
  process.env.AI_TODO_HOME = join(dir, "home");
  process.env.AI_TODO_CODEX_HOME = join(dir, "codex-default");
  process.env.AI_TODO_CLAUDE_HOME = join(dir, "claude-default");

  try {
    mkdirSync(process.env.AI_TODO_CODEX_HOME);
    mkdirSync(process.env.AI_TODO_CLAUDE_HOME);
    writeFileSync(join(process.env.AI_TODO_CODEX_HOME, "session.jsonl"), [
      JSON.stringify({ role: "user", text: "Please scan default Codex path" })
    ].join("\n"));
    writeFileSync(join(process.env.AI_TODO_CLAUDE_HOME, "session.jsonl"), [
      JSON.stringify({ role: "user", content: "Please scan default Claude path" })
    ].join("\n"));
    const explicit = join(dir, "explicit-codex");
    mkdirSync(explicit);
    writeFileSync(join(explicit, "session.jsonl"), [
      JSON.stringify({ role: "user", text: "Please scan explicit Codex path" })
    ].join("\n"));

    const codex = await capture(() => main(["scan", "codex"]));
    assert.equal(codex.code, 0);
    assert.match(codex.stdout, /scanned: 1/);

    const claude = await capture(() => main(["scan", "claude-code"]));
    assert.equal(claude.code, 0);
    assert.match(claude.stdout, /scanned: 1/);

    const explicitScan = await capture(() => main(["scan", "codex", explicit]));
    assert.equal(explicitScan.code, 0);
    assert.match(explicitScan.stdout, /scanned: 1/);
  } finally {
    process.env.AI_TODO_HOME = previousHome;
    process.env.AI_TODO_CODEX_HOME = previousCodex;
    process.env.AI_TODO_CLAUDE_HOME = previousClaude;
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
