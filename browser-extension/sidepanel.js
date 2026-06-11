const $ = (id) => document.getElementById(id);
const AI_SITE_TEST_CARDS_PATH = '/docs/browser-extension-ai-site-test-cards-cn.md';
let latestCapture = null;

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

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function buildDiagnosticReport(capture) {
  const page = capture && capture.page ? capture.page : {};
  const diagnostics = capture && capture.diagnostics ? capture.diagnostics : {};
  const conversation = capture && capture.conversation ? capture.conversation : {};
  const manifest = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest() : {};
  const matched = diagnostics.matchedSelectors || {};
  return {
    product: 'Agent Memory Lab Browser Extension',
    extension: {
      name: manifest.name || 'Agent Memory Lab',
      version: manifest.version || '',
      manifestVersion: manifest.manifest_version || 3
    },
    generatedAt: new Date().toISOString(),
    validationGuide: {
      title: '浏览器插件真实 AI 站点测试卡',
      path: AI_SITE_TEST_CARDS_PATH,
      requiredProducts: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity']
    },
    page: {
      title: page.title || '',
      url: page.url || '',
      host: page.host || '',
      origin: page.origin || '',
      type: page.type || '',
      typeLabel: page.typeLabel || ''
    },
    ai: {
      supportedAiPage: !!diagnostics.supportedAiPage,
      provider: diagnostics.provider || conversation.provider || '',
      editorFound: !!diagnostics.editorFound,
      editorSelector: diagnostics.editorSelector || '',
      anchorFound: !!diagnostics.anchorFound,
      anchorSelector: diagnostics.anchorSelector || '',
      anchorSource: diagnostics.anchorSource || '',
      adjacentSelector: diagnostics.adjacentSelector || '',
      sendFound: !!diagnostics.sendFound,
      sendSelector: diagnostics.sendSelector || '',
      turnSelector: diagnostics.turnSelector || '',
      turnSelectorCount: diagnostics.turnSelectorCount || 0,
      matchedSelectors: {
        editor: matched.editor || diagnostics.editorSelector || '',
        anchor: matched.anchor || diagnostics.anchorSelector || '',
        anchorSource: matched.anchorSource || diagnostics.anchorSource || '',
        adjacent: matched.adjacent || diagnostics.adjacentSelector || '',
        send: matched.send || diagnostics.sendSelector || '',
        turn: matched.turn || diagnostics.turnSelector || ''
      },
      placement: diagnostics.placement || '',
      promptLength: diagnostics.promptLength || 0,
      turnCount: diagnostics.turnCount || 0,
      checkedAt: diagnostics.checkedAt || ''
    },
    manualValidation: {
      diagnosticsCopied: true,
      siteInputStillWorks: false,
      browser: '填写浏览器名称和版本',
      notes: '填写无隐私信息的验收备注'
    }
  };
}

function providerArg(value) {
  const provider = String(value || '').trim();
  return provider ? ` --provider "${provider.replace(/"/g, '\\"')}"` : '';
}

function buildEvidenceCommand(capture) {
  const diagnostics = capture && capture.diagnostics ? capture.diagnostics : {};
  const provider = diagnostics.provider || (capture && capture.conversation && capture.conversation.provider) || '';
  return `npm run wizard:ai-validation-evidence -- --clipboard${providerArg(provider)}`;
}

function setConnectionState(state, text) {
  const card = $('connectionCard');
  card.className = `connection-card ${state}`;
  if (state === 'connected') {
    $('connectionTitle').textContent = '正在自动同步';
    $('connectionText').textContent = text || '网页 AI 会话会自动进入本地工作台。';
    $('connectionAction').textContent = '刷新';
    return;
  }
  if (state === 'offline') {
    $('connectionTitle').textContent = '本地工作台未连接';
    $('connectionText').textContent = text || '先启动 Agent Memory Lab，再同步网页会话。';
    $('connectionAction').textContent = '重试';
    return;
  }
  $('connectionTitle').textContent = '检查连接中';
  $('connectionText').textContent = '正在确认能否同步到本地工作台。';
  $('connectionAction').textContent = '重试';
}

function draftMetaText(capture) {
  const page = capture && capture.page ? capture.page : {};
  const provider = capture && capture.conversation && capture.conversation.provider ? capture.conversation.provider : '';
  const source = provider || page.typeLabel || page.host || '浏览器';
  return `${source} · 只同步会话原文`;
}

function renderSyncState(capture) {
  const turns = capture && capture.conversation && Array.isArray(capture.conversation.turns) ? capture.conversation.turns : [];
  const provider = capture && capture.conversation && capture.conversation.provider ? capture.conversation.provider : '';
  $('turnSummary').textContent = `${turns.length} 条`;
  $('syncMode').textContent = provider ? '自动' : '等待';
  $('draftAssist').textContent = turns.length
    ? `已读到 ${turns.length} 条网页对话，会自动同步到工作台。`
    : '还没有读到真实对话。打开或展开 AI 对话后会自动同步。';
  $('draftMeta').textContent = draftMetaText(capture);
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

function renderDiagnostics(capture) {
  const diagnostics = capture && capture.diagnostics ? capture.diagnostics : {};
  const section = $('aiDiagnostics');
  if (!diagnostics.supportedAiPage) {
    section.hidden = true;
    $('copyDiagnostics').disabled = true;
    $('copyEvidenceCommand').disabled = true;
    $('evidenceCommandHint').hidden = true;
    return;
  }
  section.hidden = false;
  $('copyDiagnostics').disabled = false;
  $('copyEvidenceCommand').disabled = false;
  $('evidenceCommandHint').hidden = false;
  $('aiProvider').textContent = diagnostics.provider || 'AI 页面';
  const readyForTrial = !!(diagnostics.supportedAiPage && diagnostics.turnCount > 0);
  const missing = [];
  if (!diagnostics.supportedAiPage) missing.push('AI 页面');
  if (!diagnostics.turnCount) missing.push('会话内容');
  $('aiValidationSummary').className = `validation-summary ${readyForTrial ? 'ready' : 'needs-check'}`;
  $('aiValidationSummary').innerHTML = `
    <strong>${readyForTrial ? '会话抓取正常' : '会话抓取未就绪'}</strong>
    <span>${readyForTrial ? '已读到网页里的 AI 会话。' : `还缺：${escapeHtml(missing.join('、') || '页面结构确认')}`}</span>
  `;
  const rows = [
    { label: '页面', value: diagnostics.provider || '已识别', ok: true },
    { label: '输入框', value: diagnostics.editorFound ? '可用' : '未找到', ok: !!diagnostics.editorFound },
    { label: '发送按钮', value: diagnostics.sendFound ? '未受影响' : '未确认', ok: !!diagnostics.sendFound },
    { label: '已抓取会话', value: `${diagnostics.turnCount || 0} 条`, ok: (diagnostics.turnCount || 0) > 0 }
  ];
  $('aiDiagnosticList').innerHTML = rows.map((row) => `
    <div class="diagnostic-row${row.ok ? '' : ' warn'}">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(row.value)}</strong>
    </div>
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
      <div class="recent-meta">${escapeHtml(item.typeLabel || item.host || '')} · 会话同步</div>
      <div class="recent-title">${escapeHtml(item.title || '未命名页面')}</div>
    </article>
  `).join('');
}

function renderCapture(capture) {
  latestCapture = capture;
  const page = capture.page || {};
  $('pageType').textContent = page.typeLabel || '网页';
  $('pageTitle').textContent = page.title || '当前页面';
  $('pageUrl').textContent = page.url || '';
  $('privacy').textContent = '只同步会话';
  $('privacy').className = 'type-pill';
  renderSyncState(capture);
  renderDiagnostics(capture);
  renderTurns(capture.conversation && capture.conversation.turns ? capture.conversation.turns : []);
}

async function refresh() {
  setMessage('');
  setConnectionState('checking');
  try {
    const health = await send('HEALTH');
    $('status').textContent = health && health.status === 'ok' ? '本地工作台已连接' : '本地工作台可访问';
    setConnectionState('connected');
  } catch {
    $('status').textContent = '未连接本地工作台';
    setConnectionState('offline');
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

$('refresh').addEventListener('click', refresh);
$('connectionAction').addEventListener('click', refresh);
$('copyDiagnostics').addEventListener('click', async () => {
  try {
    await copyText(JSON.stringify(buildDiagnosticReport(latestCapture), null, 2));
    setMessage('已复制问题信息', 'ok');
  } catch (err) {
    setMessage(err.message || '复制失败', 'error');
  }
});
$('copyEvidenceCommand').addEventListener('click', async () => {
  try {
    await copyText(buildEvidenceCommand(latestCapture));
    setMessage('已复制检查步骤', 'ok');
  } catch (err) {
    setMessage(err.message || '复制失败', 'error');
  }
});
$('syncNow').addEventListener('click', async () => {
  $('syncNow').disabled = true;
  setMessage('正在扫描已打开的 AI 会话...');
  try {
    const data = await send('SYNC_OPEN_AI_TABS', { force: true });
    setMessage(`已扫描 ${data.scanned || 0} 个 AI 会话标签页，同步 ${data.synced || 0} 个`, 'ok');
  } catch (err) {
    setMessage(err.message || '同步失败', 'error');
  } finally {
    $('syncNow').disabled = false;
  }
});
$('openWorkbench').addEventListener('click', () => send('OPEN_VIEWER', { tab: 'sessions' }).catch(() => {}));
$('closePanel').addEventListener('click', () => window.close());

refresh();
