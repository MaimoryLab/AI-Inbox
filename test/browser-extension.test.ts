import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

test("browser extension site config covers supported AI hosts", () => {
  const config = loadSiteConfig();
  const supported = supportedHosts();

  for (const [id, host] of supported) {
    assert.equal(config.providerForHost(host)?.id, id);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(
    config.providers.flatMap((provider: any) => provider.hosts.map((host: string) => [provider.id, host])),
  )), supported);
  assert.equal(config.providerForHost("labs.chatgpt.com")?.id, "chatgpt");
  assert.equal(config.providerForHost("example.com"), null);
  for (const provider of config.providers) {
    assert.ok(provider.turnSelectors.length > 0, provider.id);
    assert.ok(provider.editorSelectors.length > 0, provider.id);
  }
});

test("browser extension manifest includes supported AI hosts", () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "browser-extension", "manifest.json"), "utf8"));
  const patterns = supportedHosts().map(([, host]) => `https://${host}/*`);

  assert.equal(manifest.name, "AI-Inbox Browser Sessions");
  assert.equal(manifest.action.default_title, "AI-Inbox");
  for (const pattern of patterns) {
    assert.ok(manifest.host_permissions.includes(pattern), pattern);
    assert.ok(manifest.content_scripts[0].matches.includes(pattern), pattern);
  }
  assert.deepEqual(
    manifest.host_permissions.filter((pattern: string) => pattern.startsWith("https://")),
    patterns
  );
  assert.deepEqual(manifest.content_scripts[0].matches, patterns);
  assert.ok(manifest.permissions.includes("alarms"));
  assert.ok(manifest.permissions.includes("tabs"));
});

test("browser extension sends messages without token setup or MV2 callback assumptions", () => {
  const worker = readFileSync(join(process.cwd(), "browser-extension", "service-worker.js"), "utf8");
  const options = readFileSync(join(process.cwd(), "browser-extension", "options.html"), "utf8");

  assert.doesNotMatch(worker, /\[\s*response\s*\]\s*=\s*await chrome\.tabs\.sendMessage/);
  assert.doesNotMatch(worker, /x-ai-index-token/);
  assert.doesNotMatch(worker, /lastSignature/);
  assert.match(worker, /autoSyncCache/);
  assert.match(worker, /\/api\/browser-sessions/);
  assert.match(worker, /\/browser\/sessions/);
  assert.doesNotMatch(options, /localToken/);
});

test("browser extension service worker caches automatic captures independently", async () => {
  const first = fakeCapture("https://chatgpt.com/c/first", "First answer");
  const second = fakeCapture("https://chatgpt.com/c/second", "Second answer");
  const { context, storage, posted } = runServiceWorker({
    capturesByTab: new Map([[1, first], [2, second]])
  });

  const firstResult = await context.syncTab(1, { automatic: true });
  const secondResult = await context.syncTab(2, { automatic: true });
  const repeatedFirstResult = await context.syncTab(1, { automatic: true });

  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  assert.equal(repeatedFirstResult.skipped, true);
  assert.equal(posted.length, 2);
  assert.equal(Object.keys(storage.autoSyncCache).length, 2);
  assert.equal(storage.lastSignature, undefined);
  assert.deepEqual(posted.map((capture: any) => capture.page.url), [
    "https://chatgpt.com/c/first",
    "https://chatgpt.com/c/second"
  ]);
});

test("browser extension content script returns diagnostics and only visible turns", () => {
  const page = runContentScriptCollect({
    hostname: "chatgpt.com",
    href: "https://chatgpt.com/c/demo",
    title: "ChatGPT demo",
    elements: [
      fakeElement({ selector: "#prompt-textarea", text: "draft that must not be sent", width: 200, height: 32 }),
      fakeElement({ selector: "button[data-testid='send-button']", text: "Send", width: 24, height: 24 }),
      fakeElement({ selector: "[data-message-author-role]", role: "user", text: "Visible user request", width: 400, height: 80 }),
      fakeElement({ selector: "[data-message-author-role]", role: "assistant", text: "Hidden assistant response", width: 0, height: 0 }),
      fakeElement({ selector: "[data-message-author-role]", role: "assistant", text: "Visible assistant answer", width: 400, height: 120 })
    ]
  });

  assert.equal(page.ok, true);
  assert.equal(page.capture.page.url, "https://chatgpt.com/c/demo");
  assert.equal(page.capture.conversation.provider, "chatgpt");
  assert.deepEqual(JSON.parse(JSON.stringify(page.capture.conversation.turns.map((turn: any) => turn.text))), [
    "Visible user request",
    "Visible assistant answer"
  ]);
  assert.equal(page.capture.diagnostics.supportedAiPage, true);
  assert.equal(page.capture.diagnostics.editorFound, true);
  assert.equal(page.capture.diagnostics.sendFound, true);
  assert.equal(page.capture.diagnostics.promptLength, "draft that must not be sent".length);
  assert.equal(page.capture.diagnostics.turnSelector, "[data-message-author-role]");
  assert.equal(page.capture.diagnostics.turnSelectorCount, 2);
  assert.equal(page.capture.diagnostics.matchedSelectors.editor, "#prompt-textarea");
});

test("browser extension content script reports unsupported page diagnostics", () => {
  const page = runContentScriptCollect({
    hostname: "example.com",
    href: "https://example.com/",
    title: "Example",
    elements: []
  });

  assert.equal(page.ok, false);
  assert.equal(page.error, "unsupported_page");
  assert.equal(page.diagnostics.supportedAiPage, false);
  assert.equal(page.diagnostics.turnCount, 0);
});

function loadSiteConfig() {
  const source = readFileSync(join(process.cwd(), "browser-extension", "shared", "site-config.js"), "utf8");
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(source, context);
  return (context.globalThis as any).AIIndexSiteConfig;
}

function runServiceWorker(input: { capturesByTab: Map<number, any> }) {
  const serviceWorker = readFileSync(join(process.cwd(), "browser-extension", "service-worker.js"), "utf8");
  const storage: Record<string, any> = {};
  const posted: any[] = [];
  const context = vm.createContext({
    globalThis: {},
    importScripts() {},
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} }
      },
      alarms: {
        create() {},
        onAlarm: { addListener() {} }
      },
      tabs: {
        onUpdated: { addListener() {} },
        sendMessage(tabId: number) {
          const capture = input.capturesByTab.get(tabId);
          return Promise.resolve(capture ? { ok: true, capture } : { ok: false, error: "no_capture" });
        },
        query() {
          return Promise.resolve([]);
        }
      },
      scripting: {
        executeScript() {
          return Promise.resolve();
        }
      },
      storage: {
        local: {
          get(keys: string | string[]) {
            if (Array.isArray(keys)) return Promise.resolve(Object.fromEntries(keys.map((key) => [key, storage[key]])));
            return Promise.resolve({ [keys]: storage[keys] });
          },
          set(values: Record<string, any>) {
            Object.assign(storage, values);
            return Promise.resolve();
          }
        }
      }
    },
    fetch(_url: string, init: { body: string }) {
      const capture = JSON.parse(init.body);
      posted.push(capture);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sessionId: `session-${posted.length}`, observations: capture.conversation.turns.length })
      });
    },
    setTimeout,
    Promise,
    Date,
    JSON,
    Object,
    Number
  });
  context.globalThis = context;
  vm.runInContext(serviceWorker, context);
  return { context: context as any, storage, posted };
}

function runContentScriptCollect(input: { hostname: string; href: string; title: string; elements: any[] }) {
  const siteConfig = readFileSync(join(process.cwd(), "browser-extension", "shared", "site-config.js"), "utf8");
  const contentScript = readFileSync(join(process.cwd(), "browser-extension", "content-script.js"), "utf8");
  let listener: any;
  const context = vm.createContext({
    globalThis: {},
    location: { hostname: input.hostname, href: input.href },
    document: {
      title: input.title,
      documentElement: {},
      querySelectorAll(selector: string) {
        return input.elements.filter((element) => element.matchesSelector(selector));
      }
    },
    chrome: {
      runtime: {
        onMessage: { addListener(fn: any) { listener = fn; } },
        sendMessage() { return Promise.resolve(); }
      }
    },
    MutationObserver: class {
      observe() {}
    },
    clearTimeout,
    setTimeout,
    getComputedStyle(element: any) {
      return element.style;
    }
  });
  context.globalThis = context;
  vm.runInContext(siteConfig, context);
  vm.runInContext(contentScript, context);
  let response: any;
  listener({ type: "AI_INDEX_COLLECT_PAGE" }, {}, (value: unknown) => { response = value; });
  return response;
}

function fakeElement(input: { selector: string; text: string; width: number; height: number; role?: string }) {
  return {
    innerText: input.text,
    textContent: input.text,
    className: "",
    style: { visibility: "visible", display: input.width && input.height ? "block" : "none" },
    parentElement: null,
    classList: { contains() { return false; } },
    tagName: "div",
    getBoundingClientRect() {
      return { width: input.width, height: input.height };
    },
    getAttribute(name: string) {
      if (name === "data-message-author-role") return input.role || null;
      return null;
    },
    closest() {
      return null;
    },
    matchesSelector(selectorList: string) {
      return selectorList.split(",").map((selector) => selector.trim()).includes(input.selector);
    }
  };
}

function fakeCapture(url: string, answer: string) {
  return {
    schemaVersion: 1,
    capturedAt: "2026-07-06T00:00:00.000Z",
    page: { url, title: "ChatGPT", host: "chatgpt.com" },
    conversation: {
      provider: "chatgpt",
      turns: [
        { role: "user", text: "Question" },
        { role: "assistant", text: answer }
      ]
    },
    diagnostics: {
      supportedAiPage: true,
      editorFound: true,
      sendFound: true,
      turnSelector: "[data-message-author-role]",
      turnSelectorCount: 2,
      promptLength: 8,
      checkedAt: "2026-07-06T00:00:00.000Z"
    }
  };
}

function supportedHosts(): Array<[string, string]> {
  return [
    ["chatgpt", "chatgpt.com"],
    ["chatgpt", "chat.openai.com"],
    ["claude", "claude.ai"],
    ["gemini", "gemini.google.com"],
    ["perplexity", "perplexity.ai"],
    ["perplexity", "www.perplexity.ai"],
    ["grok", "grok.com"],
    ["grok", "x.ai"],
    ["deepseek", "chat.deepseek.com"],
    ["deepseek", "deepseek.com"],
    ["doubao", "doubao.com"],
    ["doubao", "www.doubao.com"],
    ["qwen", "www.qianwen.com"],
    ["qwen", "qianwen.aliyun.com"],
    ["qwen", "tongyi.aliyun.com"],
    ["qwen", "qwen.ai"],
    ["qwen", "chat.qwen.ai"],
    ["kimi", "kimi.com"],
    ["kimi", "www.kimi.com"],
    ["kimi", "kimi.moonshot.cn"],
    ["zhipu", "chatglm.cn"],
    ["zhipu", "www.chatglm.cn"],
    ["wenxin", "yiyan.baidu.com"],
    ["wenxin", "wenxin.baidu.com"],
    ["yuanbao", "yuanbao.tencent.com"],
    ["spark", "xinghuo.xfyun.cn"],
    ["spark", "spark.xfyun.cn"],
    ["hailuo", "hailuoai.com"],
    ["hailuo", "hailuoai.video"],
    ["baichuan", "ying.baichuan-ai.com"],
    ["baichuan", "www.baichuan-ai.com"]
  ];
}
