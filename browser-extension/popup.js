import { getSettings } from './config.js';

const $ = (id) => document.getElementById(id);
let settings = await getSettings();

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

function renderRecent(items) {
  if (!items || !items.length) {
    $('recentList').textContent = '暂无记录';
    return;
  }
  $('recentList').innerHTML = items.slice(0, 4).map((item) => `
    <div class="recent-item">
      <div class="recent-title">${escapeHtml(item.title || '未命名页面')}</div>
      <div class="recent-meta">${item.kind === 'review' ? '待审阅' : item.kind === 'lesson' ? '经验' : '记忆'} · ${escapeHtml(item.host || '')}</div>
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
    $('status').textContent = health && health.status === 'ok' ? '本地服务已连接' : '本地服务可访问';
  } catch {
    $('status').textContent = '未连接本地服务';
  }

  try {
    renderPage(await send('COLLECT_PAGE'));
  } catch (err) {
    $('pageTitle').textContent = '无法读取当前页面';
    $('pageUrl').textContent = err.message || '';
  }

  await refreshRecent();
}

$('saveMemory').addEventListener('click', async () => {
  $('saveMemory').disabled = true;
  setMessage('正在加入待审阅...');
  try {
    await send('SAVE_PAGE_MEMORY');
    await refreshRecent();
    setMessage('已加入待审阅队列', 'ok');
  } catch (err) {
    setMessage(err.message || '保存失败', 'error');
  } finally {
    $('saveMemory').disabled = false;
  }
});

$('saveLesson').addEventListener('click', async () => {
  const note = $('lessonNote').value.trim();
  if (!note) return setMessage('先写一条经验再保存', 'error');
  $('saveLesson').disabled = true;
  setMessage('正在加入待审阅...');
  try {
    await send('SAVE_PAGE_LESSON', { note });
    $('lessonNote').value = '';
    await refreshRecent();
    setMessage('经验候选已加入待审阅', 'ok');
  } catch (err) {
    setMessage(err.message || '保存失败', 'error');
  } finally {
    $('saveLesson').disabled = false;
  }
});

$('openWorkbench').addEventListener('click', () => send('OPEN_VIEWER', { tab: 'dashboard' }).catch(() => chrome.tabs.create({ url: `${settings.viewerBase}/#dashboard` })));
$('openSkills').addEventListener('click', () => send('OPEN_VIEWER', { tab: 'lessons' }).catch(() => chrome.tabs.create({ url: `${settings.viewerBase}/#lessons` })));
$('openSidePanel').addEventListener('click', async () => {
  const win = await chrome.windows.getCurrent();
  await send('OPEN_SIDE_PANEL', { windowId: win.id });
  window.close();
});
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

refresh();
