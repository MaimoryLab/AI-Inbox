import * as vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

// STEP-03: 待办→证据跳转。待办卡指向裸 obs_id,证据栏按 session 组织,
// 后端无 obs_id→session 反查端点。resolveObsSession 遍历已加载会话,
// 缓存/内嵌优先、未命中才请求 observations?sessionId=,命中即停。
// 这个单测锁定该解析逻辑(命中缓存 / 命中网络 / 未命中)。

function loadViewerSandbox() {
  const rendered = renderViewerDocument();
  expect(rendered.found).toBe(true);
  if (!rendered.found) throw new Error("viewer document not found");

  const scriptMatch = rendered.html.match(
    /<script nonce="[^"]+">([\s\S]*?)<\/script>/,
  );
  expect(scriptMatch).not.toBeNull();
  if (!scriptMatch) throw new Error("viewer script not found");

  const documentListeners = new Map<string, Array<(event: any) => void>>();
  const windowListeners = new Map<string, Array<(event: any) => void>>();
  const elements = new Map<string, any>();
  const createMockElement = (id = "") => {
    const attributes = new Map<string, string>();
    const classes = new Set<string>();
    const listeners = new Map<string, Array<(event?: unknown) => void>>();
    return {
      id,
      innerHTML: "",
      textContent: "",
      value: "",
      checked: false,
      dataset: {},
      style: {},
      listeners,
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
        contains: (name: string) => classes.has(name),
        toggle: (name: string, force?: boolean) => {
          const enabled = force ?? !classes.has(name);
          if (enabled) classes.add(name);
          else classes.delete(name);
          return enabled;
        },
      },
      addEventListener: (type: string, handler: (event?: unknown) => void) => {
        const current = listeners.get(type) || [];
        current.push(handler);
        listeners.set(type, current);
      },
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: unknown) => {
        attributes.set(name, String(value));
      },
      removeAttribute: (name: string) => {
        attributes.delete(name);
      },
      scrollIntoView: () => {},
      appendChild: () => {},
      closest: () => null,
      querySelectorAll: () => [],
    };
  };
  const getElement = (id: string) => {
    if (!elements.has(id)) elements.set(id, createMockElement(id));
    return elements.get(id);
  };

  const document = {
    documentElement: { dataset: {} },
    body: createMockElement("body"),
    createElement: () => createMockElement(),
    getElementById: getElement,
    querySelectorAll: () => [],
    addEventListener: (type: string, handler: (event: any) => void) => {
      const current = documentListeners.get(type) || [];
      current.push(handler);
      documentListeners.set(type, current);
    },
  };

  const sandbox: Record<string, any> = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document,
    window: {
      location: {
        search: "",
        port: "3113",
        protocol: "http:",
        hostname: "localhost",
        host: "localhost:3113",
        origin: "http://localhost:3113",
      },
      matchMedia: () => ({ matches: false }),
      addEventListener: (type: string, handler: (event: any) => void) => {
        const current = windowListeners.get(type) || [];
        current.push(handler);
        windowListeners.set(type, current);
      },
    },
    history: { replaceState: () => {}, pushState: () => {} },
    location: { hash: "", pathname: "/", search: "" },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    WebSocket: function WebSocket() {},
    navigator: { userAgent: "vitest" },
    Element: function Element() {},
    alert: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    URLSearchParams,
    Date,
    Math,
    Promise,
    JSON,
    Array,
    Object,
    String,
    Number,
    parseInt,
    encodeURIComponent,
  };

  const scriptWithoutAutoStart = scriptMatch[1].replace(
    /\n\s*loadTab\('dashboard'\);\n\s*connectWs\(\);\n\s*startDashboardAutoRefresh\(\);\s*$/,
    "\n",
  );

  vm.createContext(sandbox);
  vm.runInContext(scriptWithoutAutoStart, sandbox);

  return { sandbox };
}

describe("viewer evidence jump — resolveObsSession (STEP-03)", () => {
  it("resolves the session from an embedded/cached observation without fetching", async () => {
    const { sandbox } = loadViewerSandbox();
    let fetchCalls = 0;
    sandbox.fetch = async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({}) };
    };
    sandbox.state.sessions.items = [
      {
        id: "sess-a",
        embeddedObservations: [{ id: "obs-other" }, { id: "obs-target" }],
      },
    ];

    const resolved = await sandbox.resolveObsSession("obs-target");
    expect(resolved).toBe("sess-a");
    expect(fetchCalls).toBe(0);
  });

  it("falls back to observations?sessionId= and stops at the first hit", async () => {
    const { sandbox } = loadViewerSandbox();
    const requested: string[] = [];
    sandbox.fetch = async (input: unknown) => {
      const url = String(input);
      if (url.includes("observations?sessionId=")) {
        requested.push(url);
        const hit = url.includes("sess-b");
        return {
          ok: true,
          json: async () => ({
            observations: hit
              ? [{ id: "obs-x" }, { id: "obs-target" }]
              : [{ id: "obs-y" }],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };
    sandbox.state.sessions.items = [
      { id: "sess-a" },
      { id: "sess-b" },
      { id: "sess-c" },
    ];

    const resolved = await sandbox.resolveObsSession("obs-target");
    expect(resolved).toBe("sess-b");
    // 命中即停:sess-c 不应再被请求
    expect(requested.some((u) => u.includes("sess-c"))).toBe(false);
  });

  it("returns null when no loaded session contains the observation", async () => {
    const { sandbox } = loadViewerSandbox();
    sandbox.fetch = async (input: unknown) => {
      const url = String(input);
      if (url.includes("observations?sessionId=")) {
        return { ok: true, json: async () => ({ observations: [{ id: "obs-z" }] }) };
      }
      return { ok: true, json: async () => ({}) };
    };
    sandbox.state.sessions.items = [{ id: "sess-a" }, { id: "sess-b" }];

    const resolved = await sandbox.resolveObsSession("obs-missing");
    expect(resolved).toBeNull();
  });

  it("returns null for an empty observation id without scanning", async () => {
    const { sandbox } = loadViewerSandbox();
    let fetchCalls = 0;
    sandbox.fetch = async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({}) };
    };
    sandbox.state.sessions.items = [{ id: "sess-a" }];

    const resolved = await sandbox.resolveObsSession("");
    expect(resolved).toBeNull();
    expect(fetchCalls).toBe(0);
  });
});

