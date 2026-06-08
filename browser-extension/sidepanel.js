const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response || !response.ok) throw new Error((response && response.error) || '操作失败');
  return response.data;
}

function setMessage(text, kind = '') {
  $('message').textContent = text || '';
  $('message').className = `message ${kind}`.trim();
}

function renderCandidateList(node, items, kind) {
  if (!items || !items.length) {
    node.className = 'candidate-list empty';
    node.textContent = '暂无候选';
    return;
  }
  node.className = 'candidate-list';
  node.innerHTML = items.map((text) => `
    <article class="candidate">
      <p>${escapeHtml(text)}</p>
      <button data-save-kind="${kind}" data-save-text="${escapeHtml(text)}">送去审阅</button>
    </article>
  `).join('');
}

function renderTurns(turns) {
  const chatSection = $('chatSection');
  if (!turns || !turns.length) {
    chatSection.hidden = true;
    return;
  }
  chatSection.hidden = false;
  $('turnCount').textContent = String(turns.length);
  $('turnList').innerHTML = turns.map((turn) => `
    <article class="turn">
      <div class="turn-label">${turn.role === 'user' ? '用户' : turn.role === 'assistant' ? 'AI' : '对话'}</div>
      <p>${escapeHtml(turn.text)}</p>
    </article>
  `).join('');
}

function renderRecent(items) {
  const node = $('recentList');
  if (!items || !items.length) {
    node.className = 'recent-list empty';
    node.textContent = '暂无记录';
    return;
  }
  node.className = 'recent-list';
  node.innerHTML = items.slice(0, 6).map((item) => `
    <article class="recent-item">
      <div class="recent-meta">${escapeHtml(item.typeLabel || item.host || '')} · ${item.kind === 'review' ? '待审阅' : item.kind === 'lesson' ? '经验' : '记忆'}</div>
      <div class="recent-title">${escapeHtml(item.title || '未命名页面')}</div>
    </article>
  `).join('');
}

function renderCapture(capture) {
  const page = capture.page || {};
  $('pageType').textContent = page.typeLabel || '网页';
  $('pageTitle').textContent = page.title || '当前页面';
  $('pageUrl').textContent = page.url || '';
  const reasons = capture.privacy && capture.privacy.reasons ? capture.privacy.reasons : [];
  $('privacy').textContent = reasons.length ? reasons.join('、') : '隐私风险低';
  $('privacy').className = `privacy ${capture.privacy && capture.privacy.risk === 'medium' ? 'medium' : 'low'}`;
  const memories = capture.candidates && capture.candidates.memories ? capture.candidates.memories : [];
  const lessons = capture.candidates && capture.candidates.lessons ? capture.candidates.lessons : [];
  $('memoryCount').textContent = String(memories.length);
  $('lessonCount').textContent = String(lessons.length);
  renderCandidateList($('memoryCandidates'), memories, 'memory');
  renderCandidateList($('lessonCandidates'), lessons, 'lesson');
  renderTurns(capture.conversation && capture.conversation.turns ? capture.conversation.turns : []);
}

async function refresh() {
  setMessage('');
  try {
    const health = await send('HEALTH');
    $('status').textContent = health && health.status === 'ok' ? '本地工作台已连接' : '本地工作台可访问';
  } catch {
    $('status').textContent = '未连接本地工作台';
  }
  try {
    renderCapture(await send('COLLECT_PAGE'));
  } catch (err) {
    $('pageTitle').textContent = '无法读取当前页面';
    $('pageUrl').textContent = err.message || '';
  }
  try {
    renderRecent(await send('RECENT_CAPTURES'));
  } catch {
    renderRecent([]);
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-save-kind]');
  if (!target) return;
  target.disabled = true;
  setMessage('正在同步...');
  try {
    await send('SAVE_CANDIDATE', { kind: target.dataset.saveKind, text: target.dataset.saveText });
    setMessage('已加入待审阅队列', 'ok');
    await refresh();
  } catch (err) {
    setMessage(err.message || '同步失败', 'error');
  } finally {
    target.disabled = false;
  }
});

$('refresh').addEventListener('click', refresh);
$('savePage').addEventListener('click', async () => {
  $('savePage').disabled = true;
  setMessage('正在加入待审阅...');
  try {
    await send('SAVE_PAGE_MEMORY');
    setMessage('页面已加入待审阅', 'ok');
    await refresh();
  } catch (err) {
    setMessage(err.message || '保存失败', 'error');
  } finally {
    $('savePage').disabled = false;
  }
});
$('openWorkbench').addEventListener('click', () => send('OPEN_VIEWER', { tab: 'dashboard' }).catch(() => {}));
$('openSkills').addEventListener('click', () => send('OPEN_VIEWER', { tab: 'lessons' }).catch(() => {}));

refresh();
