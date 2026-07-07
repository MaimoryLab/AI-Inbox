const DEFAULT_API_BASE = "http://127.0.0.1:3111";
const MESSAGE_COLLECT = "AI_INDEX_COLLECT_PAGE";
const MESSAGE_PAGE_CHANGED = "AI_INDEX_PAGE_CHANGED";
const MESSAGE_SYNC_ACTIVE = "AI_INDEX_SYNC_ACTIVE_TAB";
const MESSAGE_STATUS = "AI_INDEX_STATUS";
const AUTO_SYNC_CACHE_KEY = "autoSyncCache";
const MAX_AUTO_SYNC_CACHE_ENTRIES = 200;
importScripts("shared/site-config.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE_PAGE_CHANGED && sender.tab?.id) {
    syncTab(sender.tab.id, { automatic: true }).catch(() => {});
    return false;
  }
  if (message?.type === MESSAGE_SYNC_ACTIVE) {
    syncActiveTab().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE_STATUS) {
    getStatus().then(sendResponse);
    return true;
  }
  return false;
});

chrome.alarms?.create?.("ai-index-sync-tabs", { periodInMinutes: 1 });
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("ai-index-sync-tabs", { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("ai-index-sync-tabs", { periodInMinutes: 1 });
});
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name !== "ai-index-sync-tabs") return;
  syncOpenAiTabs().catch(() => {});
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isSupportedUrl(tab.url || "")) return;
  setTimeout(() => syncOpenAiTabs().catch(() => {}), 2500);
});

async function syncActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return recordResult({ ok: false, error: "no_active_tab" });
  return syncTab(tab.id, { automatic: false });
}

async function syncOpenAiTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((tab) => isSupportedUrl(tab.url || "") && tab.id).map((tab) => syncTab(tab.id, { automatic: true })));
}

async function syncTab(tabId, options) {
  try {
    const collected = await collectFromTab(tabId);
    if (!collected.ok) {
      return recordResult({
        ...collected,
        automatic: options.automatic,
        diagnostics: diagnosticsSummary(collected)
      });
    }
    const { capture } = collected;
    const turnCount = capture.conversation.turns.length;
    const provider = capture.conversation.provider;
    const url = capture.page.url;
    const diagnostics = diagnosticsSummary(capture);
    const signature = captureSignature(collected.capture);
    if (options.automatic && await hasCachedCapture(signature)) {
      return recordResult({ ok: true, skipped: true, turnCount, provider, url, diagnostics });
    }
    const apiBase = await getApiBase();
    const response = await postBrowserSession(apiBase, collected.capture);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return recordResult({ ok: false, error: body.error || `http_${response.status}`, turnCount, provider, url, diagnostics });
    }
    await rememberCapture(signature);
    return recordResult({
      ok: true,
      sessionId: body.sessionId,
      observations: body.observations,
      turnCount,
      provider,
      url,
      diagnostics
    });
  } catch (error) {
    return recordResult({ ok: false, error: error?.message || "sync_failed" });
  }
}

async function collectFromTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: MESSAGE_COLLECT });
    return response || { ok: false, error: "no_response" };
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["shared/site-config.js", "content-script.js"] });
    const response = await chrome.tabs.sendMessage(tabId, { type: MESSAGE_COLLECT });
    return response || { ok: false, error: "no_response" };
  }
}

async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  return typeof apiBase === "string" && apiBase.trim() ? apiBase.trim() : DEFAULT_API_BASE;
}

async function postBrowserSession(apiBase, capture) {
  const base = apiBase.replace(/\/+$/, "");
  const init = {
    method: "POST",
    headers: await requestHeaders(),
    body: JSON.stringify(capture)
  };
  const response = await fetch(`${base}/api/browser-sessions`, init);
  if (response.status !== 404) return response;
  const body = await response.clone().json().catch(() => ({}));
  return body.error === "not_found" ? fetch(`${base}/browser/sessions`, init) : response;
}

async function requestHeaders() {
  return { "content-type": "application/json" };
}

async function getStatus() {
  const { lastResult, apiBase } = await chrome.storage.local.get(["lastResult", "apiBase"]);
  return { apiBase: apiBase || DEFAULT_API_BASE, lastResult: lastResult || null };
}

async function recordResult(result) {
  const lastResult = { ...result, syncedAt: new Date().toISOString() };
  await chrome.storage.local.set({ lastResult });
  return lastResult;
}

function captureSignature(capture) {
  const turns = capture.conversation.turns;
  return JSON.stringify({
    provider: capture.conversation.provider,
    url: capture.page.url,
    count: turns.length,
    tail: turns.slice(-3).map((turn) => `${turn.role}:${turn.text}`)
  });
}

async function hasCachedCapture(signature) {
  const { [AUTO_SYNC_CACHE_KEY]: cache } = await chrome.storage.local.get(AUTO_SYNC_CACHE_KEY);
  return !!(cache && typeof cache === "object" && cache[signature]);
}

async function rememberCapture(signature) {
  const { [AUTO_SYNC_CACHE_KEY]: cache } = await chrome.storage.local.get(AUTO_SYNC_CACHE_KEY);
  const nextCache = cache && typeof cache === "object" ? { ...cache } : {};
  nextCache[signature] = Date.now();
  const entries = Object.entries(nextCache)
    .sort((first, second) => Number(second[1]) - Number(first[1]))
    .slice(0, MAX_AUTO_SYNC_CACHE_ENTRIES);
  await chrome.storage.local.set({ [AUTO_SYNC_CACHE_KEY]: Object.fromEntries(entries) });
}

function diagnosticsSummary(input) {
  const diagnostics = input?.diagnostics && typeof input.diagnostics === "object" ? input.diagnostics : input;
  if (!diagnostics || typeof diagnostics !== "object") return undefined;
  return {
    supportedAiPage: !!diagnostics.supportedAiPage,
    editorFound: !!diagnostics.editorFound,
    sendFound: !!diagnostics.sendFound,
    turnSelector: diagnostics.turnSelector || "",
    turnSelectorCount: Number(diagnostics.turnSelectorCount) || 0,
    promptLength: Number(diagnostics.promptLength) || 0,
    checkedAt: diagnostics.checkedAt || ""
  };
}

function isSupportedUrl(url) {
  return globalThis.AIIndexSiteConfig?.isSupportedUrl?.(url) || false;
}
