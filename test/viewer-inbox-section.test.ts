import * as vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

// STEP-C2: 待回应分区接真实 inbox 数据。这些用例锁定 renderAwaitingReplySection()
// 的纯渲染契约——给定 state.inbox.items,产出 question/briefing 两类卡片、
// 复用「看原文 →」跳证据、空态去掉「尚未接通」。不依赖运行中的 daemon。

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadViewerSandbox() {
  const rendered = renderViewerDocument();
  if (!rendered.found) throw new Error("viewer document not found");
  const scriptMatch = rendered.html.match(
    /<script nonce="[^"]+">([\s\S]*?)<\/script>/,
  );
  if (!scriptMatch) throw new Error("viewer script not found");

  const elements = new Map<string, any>();
  const createMockElement = (id = "") => ({
    id,
    innerHTML: "",
    textContent: "",
    value: "",
    checked: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getAttribute: () => null,
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    closest: () => null,
    querySelectorAll: () => [],
  });
  const getElement = (id: string) => {
    if (!elements.has(id)) elements.set(id, createMockElement(id));
    return elements.get(id);
  };

  const tabs = [
    "dashboard", "graph", "memories", "timeline", "sessions", "lessons",
    "actions", "crystals", "audit", "activity", "profile", "replay",
  ];
  const tabButtons = tabs.map((tab) => ({ ...createMockElement(), dataset: { tab } }));
  const views = tabs.map((tab) => ({ ...createMockElement(`view-${tab}`), id: `view-${tab}` }));
  const querySelectorAll = (selector: string) => {
    if (selector === ".tab-bar button") return tabButtons;
    if (selector === ".view") return views;
    return [];
  };

  const document = {
    documentElement: { dataset: {} },
    createElement: () => {
      let text = "";
      return {
        set textContent(value: unknown) { text = String(value ?? ""); },
        get innerHTML() { return htmlEscape(text); },
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {},
        getAttribute: () => null,
        removeAttribute() {},
        appendChild() {},
        querySelectorAll: () => [],
      };
    },
    getElementById: getElement,
    querySelectorAll,
    addEventListener() {},
  };

  const sandbox: Record<string, any> = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document,
    window: {
      location: { search: "", port: "3113", protocol: "http:", hostname: "localhost", host: "localhost:3113", origin: "http://localhost:3113" },
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
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
    Date, Math, Promise, JSON, Array, Object, String, Number,
    parseInt, encodeURIComponent,
  };

  const scriptWithoutAutoStart = scriptMatch[1].replace(
    /\n\s*loadTab\('dashboard'\);\n\s*connectWs\(\);\n\s*startDashboardAutoRefresh\(\);\s*$/,
    "\n",
  );
  vm.createContext(sandbox);
  vm.runInContext(scriptWithoutAutoStart, sandbox);
  return { sandbox };
}

describe("STEP-C2 viewer 待回应分区接真数据", () => {
  it("空 inbox 渲染诚实空态,且不再出现「尚未接通」", () => {
    const { sandbox } = loadViewerSandbox();
    sandbox.state.inbox = { loaded: true, items: [] };
    const html = sandbox.renderAwaitingReplySection();
    expect(html).toContain("暂无待回应");
    expect(html).not.toContain("尚未接通");
    expect(html).not.toContain("即将上线");
    expect(html).not.toContain("inbox-card");
  });

  it("question 渲染为 🔴 卡片,带「来自」与计数", () => {
    const { sandbox } = loadViewerSandbox();
    sandbox.state.inbox = {
      loaded: true,
      items: [
        { id: "inbox_1", kind: "question", body: "要不要给 `/admin/*` 加鉴权?", fromAgent: "auth-refactor", status: "awaiting", createdAt: "2026-06-13T09:00:00Z" },
      ],
    };
    const html = sandbox.renderAwaitingReplySection();
    expect(html).toContain("inbox-card-question");
    expect(html).toContain("待回应 (1)");
    expect(html).toContain("来自 auth-refactor");
    expect(html).toContain("Agent 在等你回");
    // body 走 renderMarkdownSafe:反引号代码片段成 <code class="md-code">
    expect(html).toContain('<code class="md-code">');
    expect(html).not.toContain("inbox-card-briefing");
  });

  it("briefing 渲染为 📋 子区卡片,不计入待回应计数", () => {
    const { sandbox } = loadViewerSandbox();
    sandbox.state.inbox = {
      loaded: true,
      items: [
        { id: "inbox_b", kind: "briefing", body: "今天完成了 3 件", fromAgent: "line-c", status: "awaiting", createdAt: "2026-06-13T09:00:00Z" },
      ],
    };
    const html = sandbox.renderAwaitingReplySection();
    expect(html).toContain("inbox-card-briefing");
    expect(html).toContain("Agent 整理 (1)");
    expect(html).toContain("知悉即可");
    // 没有 question 时,标题不带 (n) 计数、不显示「在等你回」徽标
    expect(html).not.toContain("待回应 (");
    expect(html).not.toContain("Agent 在等你回");
  });

  it("有 sourceObservationIds 时渲染「看原文 →」按钮,复用 jump-to-evidence", () => {
    const { sandbox } = loadViewerSandbox();
    sandbox.state.inbox = {
      loaded: true,
      items: [
        { id: "inbox_e", kind: "question", body: "看证据", status: "awaiting", createdAt: "2026-06-13T09:00:00Z", sourceObservationIds: ["obs_xyz"] },
      ],
    };
    const html = sandbox.renderAwaitingReplySection();
    expect(html).toContain('data-action="jump-to-evidence"');
    expect(html).toContain('data-obs-id="obs_xyz"');
    expect(html).toContain("看原文");
  });

  it("无 sourceObservationIds 时不渲染「看原文 →」", () => {
    const { sandbox } = loadViewerSandbox();
    sandbox.state.inbox = {
      loaded: true,
      items: [{ id: "inbox_n", kind: "question", body: "无证据", status: "awaiting", createdAt: "2026-06-13T09:00:00Z" }],
    };
    const html = sandbox.renderAwaitingReplySection();
    expect(html).not.toContain("jump-to-evidence");
    expect(html).not.toContain("看原文");
  });

  it("question 与 briefing 混合:各自分区,question 在前", () => {
    const { sandbox } = loadViewerSandbox();
    sandbox.state.inbox = {
      loaded: true,
      items: [
        { id: "b1", kind: "briefing", body: "汇报", status: "awaiting", createdAt: "2026-06-13T09:05:00Z" },
        { id: "q1", kind: "question", body: "问题", status: "awaiting", createdAt: "2026-06-13T09:00:00Z" },
      ],
    };
    const html = sandbox.renderAwaitingReplySection();
    expect(html).toContain("inbox-card-question");
    expect(html).toContain("inbox-card-briefing");
    // question 子区在 briefing 子区之前
    expect(html.indexOf("inbox-card-question")).toBeLessThan(html.indexOf("Agent 整理 ("));
  });

  it("body 经 renderMarkdownSafe 转义,杜绝 XSS 注入", () => {
    const { sandbox } = loadViewerSandbox();
    sandbox.state.inbox = {
      loaded: true,
      items: [{ id: "x", kind: "question", body: "<img src=x onerror=alert(1)>", status: "awaiting", createdAt: "2026-06-13T09:00:00Z" }],
    };
    const html = sandbox.renderAwaitingReplySection();
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img");
  });
});
