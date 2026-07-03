import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

test("browser extension site config covers supported AI hosts", () => {
  const config = loadSiteConfig();
  const supported = [
    ["chatgpt", "chatgpt.com"],
    ["chatgpt", "chat.openai.com"],
    ["claude", "claude.ai"],
    ["gemini", "gemini.google.com"],
    ["perplexity", "perplexity.ai"],
    ["perplexity", "www.perplexity.ai"],
    ["grok", "grok.com"],
    ["grok", "x.ai"],
    ["deepseek", "chat.deepseek.com"],
    ["deepseek", "deepseek.com"]
  ];

  for (const [id, host] of supported) {
    assert.equal(config.providerForHost(host)?.id, id);
  }
  assert.equal(config.providerForHost("labs.chatgpt.com")?.id, "chatgpt");
  assert.equal(config.providerForHost("example.com"), null);
});

test("browser extension manifest includes supported AI hosts", () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "browser-extension", "manifest.json"), "utf8"));
  const patterns = [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://perplexity.ai/*",
    "https://www.perplexity.ai/*",
    "https://grok.com/*",
    "https://x.ai/*",
    "https://chat.deepseek.com/*",
    "https://deepseek.com/*"
  ];

  for (const pattern of patterns) {
    assert.ok(manifest.host_permissions.includes(pattern), pattern);
    assert.ok(manifest.content_scripts[0].matches.includes(pattern), pattern);
  }
  assert.ok(manifest.permissions.includes("alarms"));
  assert.ok(manifest.permissions.includes("tabs"));
});

test("browser extension sends messages without token setup or MV2 callback assumptions", () => {
  const worker = readFileSync(join(process.cwd(), "browser-extension", "service-worker.js"), "utf8");
  const options = readFileSync(join(process.cwd(), "browser-extension", "options.html"), "utf8");

  assert.doesNotMatch(worker, /\[\s*response\s*\]\s*=\s*await chrome\.tabs\.sendMessage/);
  assert.doesNotMatch(worker, /x-ai-index-token/);
  assert.match(worker, /\/api\/browser-sessions/);
  assert.match(worker, /\/browser\/sessions/);
  assert.doesNotMatch(options, /localToken/);
});

function loadSiteConfig() {
  const source = readFileSync(join(process.cwd(), "browser-extension", "shared", "site-config.js"), "utf8");
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(source, context);
  return (context.globalThis as any).AIIndexSiteConfig;
}
