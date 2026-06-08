import { createCaptureRecord, createPageCapture, captureToLessonPayload, captureToMemoryPayload } from './shared/schema.js';
import { agentMemoryApi, openViewer } from './shared/api.js';

const RECENT_KEY = 'recentCaptures';

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
    url: tab.url || '',
    description: '',
    selection: '',
    headings: []
  });
}

async function rememberRecent(capture, kind, result) {
  const stored = await chrome.storage.local.get([RECENT_KEY]);
  const list = Array.isArray(stored[RECENT_KEY]) ? stored[RECENT_KEY] : [];
  const next = [createCaptureRecord(capture, kind, result), ...list].slice(0, 8);
  await chrome.storage.local.set({ [RECENT_KEY]: next });
  return next;
}

async function savePageMemory() {
  const capture = await collectPage();
  const payload = captureToMemoryPayload(capture);
  const result = await agentMemoryApi('/agentmemory/review', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'memory',
      title: capture.page.title,
      content: payload.content,
      source: 'browser-extension',
      page: capture.page,
      payload
    })
  });
  await rememberRecent(capture, 'review', result);
  return { capture, result };
}

async function savePageLesson(note) {
  const capture = await collectPage();
  const payload = captureToLessonPayload(capture, note);
  const result = await agentMemoryApi('/agentmemory/review', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'lesson',
      title: capture.page.title,
      content: payload.content,
      source: 'browser-extension',
      page: capture.page,
      payload
    })
  });
  await rememberRecent(capture, 'review', result);
  return { capture, result };
}

async function saveCandidate(kind, text) {
  const capture = await collectPage();
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('没有可保存的候选内容');
  if (kind === 'lesson') {
    const payload = captureToLessonPayload(capture, trimmed);
    const result = await agentMemoryApi('/agentmemory/review', {
      method: 'POST',
      body: JSON.stringify({ kind: 'lesson', title: capture.page.title, content: trimmed, source: 'browser-extension', page: capture.page, payload })
    });
    await rememberRecent(capture, 'review', result);
    return { capture, result };
  }
  const payload = {
    ...captureToMemoryPayload(capture),
    content: `浏览器候选记忆：${trimmed}\n来源：${capture.page.title}\nURL：${capture.page.url}`
  };
  const result = await agentMemoryApi('/agentmemory/review', {
    method: 'POST',
    body: JSON.stringify({ kind: 'memory', title: capture.page.title, content: payload.content, source: 'browser-extension', page: capture.page, payload })
  });
  await rememberRecent(capture, 'review', result);
  return { capture, result };
}

async function getRecentCaptures() {
  const stored = await chrome.storage.local.get([RECENT_KEY]);
  return Array.isArray(stored[RECENT_KEY]) ? stored[RECENT_KEY] : [];
}

async function searchMemories(query) {
  const text = String(query || '').trim();
  if (text.length < 3) return { results: [] };
  return agentMemoryApi('/agentmemory/search', {
    method: 'POST',
    body: JSON.stringify({ query: text, limit: 5, format: 'compact', token_budget: 900 })
  });
}

async function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-page-memory',
      title: '保存到 Agent Memory Lab',
      contexts: ['page', 'selection', 'link']
    });
    chrome.contextMenus.create({
      id: 'open-workbench',
      title: '打开 Agent Memory Lab',
      contexts: ['action']
    });
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'save-page-memory') savePageMemory().catch(() => {});
  if (info.menuItemId === 'open-workbench') openViewer('dashboard').catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'HEALTH') return agentMemoryApi('/agentmemory/health', { method: 'GET' });
    if (message.type === 'COLLECT_PAGE') return collectPage();
    if (message.type === 'RECENT_CAPTURES') return getRecentCaptures();
    if (message.type === 'SAVE_PAGE_MEMORY') return savePageMemory();
    if (message.type === 'SAVE_PAGE_LESSON') return savePageLesson(message.note || '');
    if (message.type === 'SAVE_CANDIDATE') return saveCandidate(message.kind || 'memory', message.text || '');
    if (message.type === 'SEARCH_MEMORIES') return searchMemories(message.query || '');
    if (message.type === 'OPEN_SIDE_PANEL') return chrome.sidePanel.open({ windowId: message.windowId });
    if (message.type === 'OPEN_VIEWER') return openViewer(message.tab || 'dashboard');
    throw new Error('未知操作');
  })().then((data) => sendResponse({ ok: true, data })).catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});
