import { createCaptureRecord, createPageCapture } from './shared/schema.js';
import { agentMemoryApi, openViewer } from './shared/api.js';

const RECENT_KEY = 'recentCaptures';
const SYNC_CACHE_KEY = 'autoSyncCache';
const AUTO_SYNC_ALARM = 'agent-memory-lab-auto-sync';
const AI_PAGE_HOSTS = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'perplexity.ai',
  'www.perplexity.ai',
  'grok.com',
  'x.ai',
  'chat.deepseek.com',
  'deepseek.com'
];

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function collectPage() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) throw new Error('没有可读取的当前页面');
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'AGENT_MEMORY_LAB_COLLECT_PAGE' });
    if (response && response.ok) return createPageCapture(response.page);
  } catch {}
  return createPageCapture({
    title: tab.title || '当前页面',
    url: tab.url || ''
  });
}

function isAiConversationTab(tab = {}) {
  const raw = String(tab.url || '');
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    return AI_PAGE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'AGENT_MEMORY_LAB_PING' });
    return true;
  } catch {}
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
    return true;
  } catch {
    return false;
  }
}

async function collectTabPage(tab) {
  if (!tab || !tab.id) throw new Error('没有可读取的标签页');
  await ensureContentScript(tab.id);
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'AGENT_MEMORY_LAB_COLLECT_PAGE' });
    if (response && response.ok) return createPageCapture(response.page);
  } catch {}
  return createPageCapture({
    title: tab.title || '当前页面',
    url: tab.url || ''
  });
}

function syncKeyForCapture(capture) {
  const page = capture && capture.page ? capture.page : {};
  const conversation = capture && capture.conversation ? capture.conversation : {};
  const turns = Array.isArray(conversation.turns) ? conversation.turns : [];
  const last = turns.slice(-3).map((turn) => `${turn.role || 'unknown'}:${turn.text || ''}`).join('\n');
  return `${page.url || page.title || 'browser'}:${conversation.provider || page.host || 'browser'}:${turns.length}:${last}`;
}

async function shouldSyncCapture(capture, force = false) {
  const page = capture && capture.page ? capture.page : {};
  const provider = capture && capture.conversation && capture.conversation.provider ? capture.conversation.provider : '';
  const turns = capture && capture.conversation && Array.isArray(capture.conversation.turns) ? capture.conversation.turns : [];
  if (page.type !== 'ai-chat' || !provider) return false;
  if (!turns.some((turn) => turn && turn.text && String(turn.text).trim().length >= 12)) return false;
  const key = syncKeyForCapture(capture);
  const stored = await chrome.storage.local.get([SYNC_CACHE_KEY]);
  const cache = stored[SYNC_CACHE_KEY] && typeof stored[SYNC_CACHE_KEY] === 'object' ? stored[SYNC_CACHE_KEY] : {};
  if (!force && cache[key]) return false;
  cache[key] = Date.now();
  const entries = Object.entries(cache).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 200);
  await chrome.storage.local.set({ [SYNC_CACHE_KEY]: Object.fromEntries(entries) });
  return true;
}

async function rememberRecent(capture, kind, result) {
  const stored = await chrome.storage.local.get([RECENT_KEY]);
  const list = Array.isArray(stored[RECENT_KEY]) ? stored[RECENT_KEY] : [];
  const next = [createCaptureRecord(capture, kind, result), ...list].slice(0, 8);
  await chrome.storage.local.set({ [RECENT_KEY]: next });
  return next;
}

async function syncPageConversation() {
  const capture = await collectPage();
  return syncCapture(capture, { force: true });
}

async function syncCapture(capture, { force = false } = {}) {
  if (!(await shouldSyncCapture(capture, force))) return { capture, result: { skipped: true } };
  const turns = capture && capture.conversation && Array.isArray(capture.conversation.turns) ? capture.conversation.turns : [];
  const result = await agentMemoryApi('/agentmemory/review', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'sync',
      kind: 'session',
      source: 'browser-sync',
      title: capture.page.title,
      content: '',
      page: capture.page,
      conversation: capture.conversation,
      payload: {
        project: capture.conversation && capture.conversation.provider ? capture.conversation.provider : capture.page.host || 'browser',
        projectScope: 'page',
        sourceLabel: capture.conversation && capture.conversation.provider ? capture.conversation.provider : capture.page.typeLabel || '浏览器',
        provider: capture.conversation && capture.conversation.provider,
        pageType: capture.page.type,
        tags: ['browser', 'auto-sync', capture.page.type ? `page:${capture.page.type}` : '', capture.conversation && capture.conversation.provider ? `source:${capture.conversation.provider.toLowerCase()}` : ''].filter(Boolean),
        turnCount: turns.length
      }
    })
  });
  await rememberRecent(capture, 'sync', result);
  return { capture, result };
}

async function syncOpenAiConversationTabs({ force = false } = {}) {
  const tabs = (await chrome.tabs.query({})).filter(isAiConversationTab);
  const results = [];
  for (const tab of tabs) {
    try {
      const capture = await collectTabPage(tab);
      const synced = await syncCapture(capture, { force });
      results.push({ ok: true, tabId: tab.id, title: capture.page.title, skipped: !!(synced.result && synced.result.skipped) });
    } catch (err) {
      results.push({ ok: false, tabId: tab.id, title: tab.title || '', error: err.message || String(err) });
    }
  }
  return {
    scanned: tabs.length,
    synced: results.filter((item) => item.ok && !item.skipped).length,
    skipped: results.filter((item) => item.ok && item.skipped).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
}

async function getRecentCaptures() {
  const stored = await chrome.storage.local.get([RECENT_KEY]);
  return Array.isArray(stored[RECENT_KEY]) ? stored[RECENT_KEY] : [];
}

async function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'sync-page-conversation',
      title: '同步到 Agent Memory Lab 工作台',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'open-workbench',
      title: '打开 Agent Memory Lab',
      contexts: ['action']
    });
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(AUTO_SYNC_ALARM, { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
  chrome.alarms.create(AUTO_SYNC_ALARM, { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_SYNC_ALARM) syncOpenAiConversationTabs().catch(() => {});
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isAiConversationTab(tab)) {
    setTimeout(() => syncOpenAiConversationTabs().catch(() => {}), 2500);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sync-page-conversation') {
    syncPageConversation().catch(() => {});
  }
  if (info.menuItemId === 'open-workbench') openViewer('dashboard').catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'HEALTH') return agentMemoryApi('/agentmemory/livez', { method: 'GET' });
    if (message.type === 'COLLECT_PAGE') return collectPage();
    if (message.type === 'RECENT_CAPTURES') return getRecentCaptures();
    if (message.type === 'SYNC_PAGE_CONVERSATION') return syncPageConversation();
    if (message.type === 'SYNC_OPEN_AI_TABS') return syncOpenAiConversationTabs({ force: !!message.force });
    if (message.type === 'OPEN_SIDE_PANEL') return chrome.sidePanel.open({ windowId: message.windowId });
    if (message.type === 'OPEN_VIEWER') return openViewer(message.tab || 'dashboard', message.path || '');
    throw new Error('未知操作');
  })().then((data) => sendResponse({ ok: true, data })).catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});
