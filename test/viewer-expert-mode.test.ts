import * as vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

// STEP-05: 专家模式开关。默认三栏干净;开启后放行被隐藏视图并在导航末尾
// 渲染进阶按钮。这些用例锁定:① 默认关 → normalizeTab 折回主三栏、无 expert 组
// ② ?expert=1 / localStorage 开 → 被隐藏 tab 放行、渲染 9 个进阶按钮。

function loadViewerSandbox(opts) {
  opts = opts || {};
  const rendered = renderViewerDocument();
  if (!rendered.found) throw new Error("viewer document not found");
  const scriptMatch = rendered.html.match(
    /<script nonce="[^"]+">([\s\S]*?)<\/script>/,
  );
  if (!scriptMatch) throw new Error("viewer script not found");

  const store = Object.assign({}, opts.localStorage || {});
  const makeEl = (id = "") => {
    const children = [];
    const attrs = new Map();
    const classes = new Set();
    const el = {
      id,
      innerHTML: "",
      textContent: "",
      style: {},
      dataset: {},
      classList: {
        add: (n) => classes.add(n),
        remove: (n) => classes.delete(n),
        contains: (n) => classes.has(n),
        toggle: (n, f) => {
          const on = f ?? !classes.has(n);
          if (on) classes.add(n);
          else classes.delete(n);
          return on;
        },
      },
      children,
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      removeAttribute: (k) => attrs.delete(k),
      addEventListener: () => {},
      appendChild: (c) => {
        children.push(c);
        c.parentNode = el;
        return c;
      },
      removeChild: (c) => {
        const i = children.indexOf(c);
        if (i >= 0) children.splice(i, 1);
        return c;
      },
      querySelector: (sel) => {
        if (sel === ".tab-main") return el._tabMain || null;
        return null;
      },
      querySelectorAll: () => [],
      scrollIntoView: () => {},
    };
    return el;
  };

  const elements = {};
  // 模拟真实 DOM:getElementById 先查显式注册单例,再深度搜索已 append 的子树。
  // 对动态 id(tab-expert-group)严格反映挂载状态(未挂载→null,源码据此判断去重);
  // 其余未知 id 自动补一个 mock,让 boot 期各种 addEventListener 不炸。
  function findById(node, id) {
    if (!node || !node.children) return null;
    for (const c of node.children) {
      if (c.id === id) return c;
      const found = findById(c, id);
      if (found) return found;
    }
    return null;
  }
  const DYNAMIC_IDS = new Set(["tab-expert-group"]);
  const roots = [];
  const getElement = (id) => {
    if (elements[id]) return elements[id];
    for (const r of roots) {
      const found = r.id === id ? r : findById(r, id);
      if (found) return found;
    }
    if (DYNAMIC_IDS.has(id)) return null;
    elements[id] = makeEl(id);
    return elements[id];
  };
  // tab-bar 内含 .tab-main(querySelector 命中)
  const tabBar = makeEl("tab-bar");
  const tabMain = makeEl("tab-main");
  tabBar._tabMain = tabMain;
  tabBar.appendChild(tabMain);
  elements["tab-bar"] = tabBar;
  elements["expert-toggle"] = makeEl("expert-toggle");
  roots.push(tabBar);

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      documentElement: { dataset: {} },
      body: makeEl("body"),
      createElement: () => makeEl(),
      getElementById: getElement,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
    },
    window: {
      location: {
        search: opts.search || "",
        port: "3113",
        protocol: "http:",
        hostname: "localhost",
        host: "localhost:3113",
        origin: "http://localhost:3113",
      },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
    },
    history: { replaceState() {}, pushState() {} },
    location: { hash: "", pathname: "/", search: opts.search || "" },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    WebSocket: function () {},
    navigator: { userAgent: "vitest" },
    Element: function () {},
    alert() {},
    setInterval: () => 0,
    clearInterval() {},
    setTimeout: () => 0,
    clearTimeout() {},
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
    decodeURIComponent,
  };

  // 去掉 boot 三连(switchTab/connectWs/startDashboardAutoRefresh)避免触发渲染副作用
  const script = scriptMatch[1]
    .replace(/\n\s*renderExpertTabs\(\);/, "\n")
    .replace(/\n\s*switchTab\(tabFromRoute\(\), \{ replaceRoute: true \}\);/, "\n")
    .replace(/\n\s*connectWs\(\);/, "\n")
    .replace(/\n\s*startDashboardAutoRefresh\(\);/, "\n");

  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { sandbox, getElement, tabMain };
}

describe("viewer expert mode (STEP-05)", () => {
  it("defaults off: hides expert views and redirects them to the core three tabs", () => {
    const { sandbox } = loadViewerSandbox();
    expect(sandbox.expertModeEnabled()).toBe(false);
    expect(sandbox.normalizeTab("graph")).toBe("dashboard");
    expect(sandbox.normalizeTab("profile")).toBe("dashboard");
    expect(sandbox.normalizeTab("actions")).toBe("actions");
    sandbox.renderExpertTabs();
    // 关闭时不渲染进阶组
    expect(sandbox.document.getElementById("tab-expert-group")).toBeNull();
  });

  it("enables via ?expert=1 and lets hidden tabs through normalizeTab", () => {
    const { sandbox } = loadViewerSandbox({ search: "?expert=1" });
    expect(sandbox.expertModeEnabled()).toBe(true);
    expect(sandbox.normalizeTab("graph")).toBe("graph");
    expect(sandbox.normalizeTab("audit")).toBe("audit");
  });

  it("enables via localStorage and renders all expert buttons into .tab-main", () => {
    const { sandbox, tabMain } = loadViewerSandbox({
      localStorage: { viewer_expert_mode: "1" },
    });
    expect(sandbox.expertModeEnabled()).toBe(true);
    sandbox.renderExpertTabs();
    const group = tabMain.children.find((c) => c.id === "tab-expert-group");
    expect(group).toBeTruthy();
    expect(group.children.length).toBe(sandbox.EXPERT_TABS.length);
    // 每个进阶按钮带 data-tab
    group.children.forEach((b) => {
      expect(b.getAttribute("data-tab")).toBeTruthy();
    });
  });

  it("?expert=0 overrides a stored enabled flag", () => {
    const { sandbox } = loadViewerSandbox({
      search: "?expert=0",
      localStorage: { viewer_expert_mode: "1" },
    });
    expect(sandbox.expertModeEnabled()).toBe(false);
    expect(sandbox.normalizeTab("graph")).toBe("dashboard");
  });

  it("renderExpertTabs is idempotent (no duplicate groups on repeat calls)", () => {
    const { sandbox, tabMain } = loadViewerSandbox({
      localStorage: { viewer_expert_mode: "1" },
    });
    sandbox.renderExpertTabs();
    sandbox.renderExpertTabs();
    const groups = tabMain.children.filter((c) => c.id === "tab-expert-group");
    expect(groups.length).toBe(1);
  });
});