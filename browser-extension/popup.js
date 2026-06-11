import { getSettings, resolveViewerBase } from './config.js';
const $ = (id) => document.getElementById(id);
let settings = await getSettings();
let latestCapture = null;

function renderVersion() {
  const manifest = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest() : {};
  $('versionInfo').textContent = `Extension v${manifest.version || '0.1.0'}`;
}

function setMessage(text, kind = '') {
  $('message').textContent = text || '';
  $('message').className = `message ${kind}`.trim();
}

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response || !response.ok) throw new Error((response && response.error) || '操作失败');
  return response.data;
}

function renderPage(capture) {
  const page = capture && capture.page ? capture.page : capture;
  $('pageTitle').textContent = page.title || '当前页面';
  $('pageUrl').textContent = page.url || '';
}

function renderSyncState(capture) {
  latestCapture = capture;
  const page = capture && capture.page ? capture.page : {};
  const provider = capture && capture.conversation && capture.conversation.provider ? capture.conversation.provider : '';
  const turns = capture && capture.conversation && Array.isArray(capture.conversation.turns) ? capture.conversation.turns : [];
  $('syncBadge').textContent = turns.length ? `${turns.length} 条` : provider ? '等待会话' : '非 AI 页';
  $('syncBadge').className = `sync-badge ${turns.length ? 'ready' : provider ? 'waiting' : ''}`;
  $('statusTitle').textContent = turns.length ? '已自动抓取' : provider ? '等待真实会话' : '当前不是 AI 会话页';
  $('draftAssist').textContent = turns.length
    ? `已读到 ${turns.length} 条网页对话。保持页面打开，后续变化会自动同步。`
    : provider ? '还没有读到真实对话。展开历史消息或发送一轮对话后会自动同步。' : '打开 ChatGPT、Claude、Gemini 等 AI 会话页后，插件会自动同步。';
  $('draftMeta').textContent = `${provider || page.typeLabel || page.host || '浏览器'} · 只同步会话原文`;
  $('syncNow').disabled = false;
}

function renderRecent(items) {
  if (!items || !items.length) {
    $('recentList').textContent = '暂无记录';
    return;
  }
  $('recentList').innerHTML = items.slice(0, 4).map((item) => `
      <div class="recent-item">
        <div class="recent-title">${escapeHtml(item.title || '未命名页面')}</div>
      <div class="recent-meta">会话同步 · ${escapeHtml(item.host || '')}</div>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

async function refreshRecent() {
  try {
    renderRecent(await send('RECENT_CAPTURES'));
  } catch {
    renderRecent([]);
  }
}

async function refresh() {
  try {
    const health = await send('HEALTH');
    $('status').textContent = health && health.status === 'ok' ? '本地工作台已连接' : '本地工作台可访问';
  } catch {
    $('status').textContent = '未连接本地工作台';
  }

  try {
    const capture = await send('COLLECT_PAGE');
    renderPage(capture);
    renderSyncState(capture);
  } catch (err) {
    $('pageTitle').textContent = '无法读取当前页面';
    $('pageUrl').textContent = err.message || '';
    $('draftMeta').textContent = '当前页面不可读取';
  }

  await refreshRecent();
}

$('syncNow').addEventListener('click', async () => {
  $('syncNow').disabled = true;
  setMessage('正在扫描已打开的 AI 会话...');
  try {
    const data = await send('SYNC_OPEN_AI_TABS', { force: true });
    await refreshRecent();
    setMessage(`已补扫 ${data.scanned || 0} 个 AI 会话标签页，同步 ${data.synced || 0} 个`, 'ok');
  } catch (err) {
    setMessage(err.message || '同步失败', 'error');
  } finally {
    $('syncNow').disabled = false;
  }
});

$('openWorkbench').addEventListener('click', async () => {
  await send('OPEN_VIEWER', { tab: 'sessions' }).catch(async () => chrome.tabs.create({ url: `${await resolveViewerBase(settings)}/#sessions` }));
  window.close();
});
$('closePopup').addEventListener('click', () => window.close());

renderVersion();
refresh();
