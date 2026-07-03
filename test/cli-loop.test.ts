import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_UI_PORT, main } from "../src/cli.js";

test("CLI scans and organize does not create rule fallback cards without LLM config", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cli-"));
  const previousHome = process.env.AI_INBOX_HOME;
  process.env.AI_INBOX_HOME = join(dir, "home");

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
    assert.match(organized.stdout, /created: 0/);
    assert.match(organized.stdout, /engine: llm/);
    assert.match(organized.stdout, /warnings: llm_config_missing/);

    const listed = await capture(() => main(["list"]));
    assert.equal(listed.code, 0);
    assert.match(listed.stdout, /No todos/);
  } finally {
    process.env.AI_INBOX_HOME = previousHome;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI init writes local env config and doctor reports it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cli-init-"));
  const previousHome = process.env.AI_INBOX_HOME;
  process.env.AI_INBOX_HOME = join(dir, "home");

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
    const envText = readFileSync(join(process.env.AI_INBOX_HOME, ".env"), "utf8");
    assert.match(envText, /AI_INBOX_LLM_MODEL=custom\/model/);
    assert.match(envText, /AI_INBOX_LLM_API_KEY=dummy-llm-key-value/);
    const doctor = await capture(() => main(["doctor"]));
    assert.equal(doctor.code, 0);
    assert.match(doctor.stdout, /llm key: configured/);
    assert.doesNotMatch(doctor.stdout, /dummy-llm-key-value/);
  } finally {
    process.env.AI_INBOX_HOME = previousHome;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI reports empty lists and invalid todo updates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cli-empty-"));
  const previousHome = process.env.AI_INBOX_HOME;
  process.env.AI_INBOX_HOME = join(dir, "home");

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
    assert.match(missingScanSource.stderr, /usage: ai-inbox scan/);

    const badSource = await capture(() => main(["scan", "browser", dir]));
    assert.equal(badSource.code, 1);
    assert.match(badSource.stderr, /unsupported source/);

    const missingPath = await capture(() => main(["scan", "codex", join(dir, "missing")]));
    assert.equal(missingPath.code, 1);
    assert.match(missingPath.stderr, /path not found/);
  } finally {
    process.env.AI_INBOX_HOME = previousHome;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exposes common command aliases", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cli-aliases-"));
  const previousHome = process.env.AI_INBOX_HOME;
  process.env.AI_INBOX_HOME = join(dir, "home");

  try {
    const listed = await capture(() => main(["ls"]));
    assert.equal(listed.code, 0);
    assert.match(listed.stdout, /No todos/);

    const extracted = await capture(() => main(["extract"]));
    assert.equal(extracted.code, 0);
    assert.match(extracted.stdout, /created: 0/);
    assert.match(extracted.stdout, /engine: llm/);

    const missingComplete = await capture(() => main(["complete"]));
    assert.equal(missingComplete.code, 1);
    assert.match(missingComplete.stderr, /missing todo id/);

    const missingDismiss = await capture(() => main(["dismiss", "missing"]));
    assert.equal(missingDismiss.code, 1);
    assert.match(missingDismiss.stderr, /todo not found/);
  } finally {
    process.env.AI_INBOX_HOME = previousHome;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI scan uses default source paths with environment overrides", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cli-defaults-"));
  const previousHome = process.env.AI_INBOX_HOME;
  const previousCodex = process.env.AI_INBOX_CODEX_HOME;
  const previousClaude = process.env.AI_INBOX_CLAUDE_HOME;
  process.env.AI_INBOX_HOME = join(dir, "home");
  process.env.AI_INBOX_CODEX_HOME = join(dir, "codex-default");
  process.env.AI_INBOX_CLAUDE_HOME = join(dir, "claude-default");

  try {
    mkdirSync(process.env.AI_INBOX_CODEX_HOME);
    mkdirSync(process.env.AI_INBOX_CLAUDE_HOME);
    writeFileSync(join(process.env.AI_INBOX_CODEX_HOME, "session.jsonl"), [
      JSON.stringify({ role: "user", text: "Please scan default Codex path" })
    ].join("\n"));
    writeFileSync(join(process.env.AI_INBOX_CLAUDE_HOME, "session.jsonl"), [
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
    process.env.AI_INBOX_HOME = previousHome;
    process.env.AI_INBOX_CODEX_HOME = previousCodex;
    process.env.AI_INBOX_CLAUDE_HOME = previousClaude;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI open reports the fixed default port when it is occupied", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cli-open-"));
  const previousHome = process.env.AI_INBOX_HOME;
  process.env.AI_INBOX_HOME = join(dir, "home");
  const blocker = await tryListenOnDefaultPort();

  try {
    const opened = await capture(() => main(["open"]));
    assert.equal(opened.code, 1);
    assert.match(opened.stderr, /3111 is already in use/);
    assert.match(opened.stderr, /ai-inbox open --port <port>/);
  } finally {
    process.env.AI_INBOX_HOME = previousHome;
    if (blocker) {
      await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI start reports the fixed default port when it is occupied", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cli-start-"));
  const previousHome = process.env.AI_INBOX_HOME;
  process.env.AI_INBOX_HOME = join(dir, "home");
  const blocker = await tryListenOnDefaultPort();

  try {
    const opened = await capture(() => main(["start"]));
    assert.equal(opened.code, 1);
    assert.match(opened.stderr, /3111 is already in use/);
    assert.match(opened.stderr, /ai-inbox start --port <port>/);
  } finally {
    process.env.AI_INBOX_HOME = previousHome;
    if (blocker) {
      await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

async function tryListenOnDefaultPort() {
  const blocker = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(DEFAULT_UI_PORT, "127.0.0.1", () => {
        blocker.off("error", reject);
        resolve();
      });
    });
    return blocker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") return undefined;
    throw error;
  }
}

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
