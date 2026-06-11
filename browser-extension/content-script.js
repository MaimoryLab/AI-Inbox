(() => {
  if (window.__AGENT_MEMORY_LAB_CONTENT_SCRIPT_LOADED__) return;
  window.__AGENT_MEMORY_LAB_CONTENT_SCRIPT_LOADED__ = true;

  const AI_PROVIDERS = [
    { id: 'agentmemoryDemo', label: 'Agent Memory Demo', hosts: ['localhost', '127.0.0.1'], pathIncludes: ['/demo/browser-extension.html'], editorSelectors: ['#agentmemory-demo-input', '[data-agentmemory-demo-input]', '[contenteditable="true"]'], anchorSelectors: ['#agentmemory-demo-input', 'form', 'main'], placement: 'input-corner', turnSelectors: ['[data-message-author-role]', 'main article'], sendSelectors: ['button.primary'] },
    { id: 'chatgpt', label: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'], editorSelectors: ['#prompt-textarea', '[data-testid="prompt-textarea"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'], anchorSelectors: ['[data-testid="composer-trailing-actions"]', '.composer-trailing-actions', 'form', 'main form'], adjacentSelectors: ['button[aria-label="Dictate button"]', 'button[aria-label*="mic" i]', 'button[aria-label*="voice" i]'], placement: 'toolbar-end', turnSelectors: ['[data-message-author-role]', '[data-testid*="conversation-turn"]', 'main article'], sendSelectors: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]'] },
    { id: 'claude', label: 'Claude', hosts: ['claude.ai'], editorSelectors: ['div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"]', 'textarea', 'p[data-placeholder]'], anchorSelectors: ['form', '[data-testid*="input"]', '[contenteditable="true"]'], placement: 'input-corner', turnSelectors: ['[data-testid*="message"]', 'main [class*="font-claude"]', 'main article'], sendSelectors: ['button[aria-label*="Send"]', 'button[type="submit"]'] },
    { id: 'gemini', label: 'Gemini', hosts: ['gemini.google.com'], editorSelectors: ['rich-textarea [contenteditable="true"]', 'rich-textarea textarea', '[contenteditable="true"]', 'textarea'], anchorSelectors: ['rich-textarea', '.input-area-container', 'form', '[contenteditable="true"]'], placement: 'input-corner', turnSelectors: ['user-query', 'model-response', 'message-content', 'main article'], sendSelectors: ['button[aria-label*="Send"]', 'button[aria-label*="提交"]'] },
    { id: 'perplexity', label: 'Perplexity', hosts: ['perplexity.ai', 'www.perplexity.ai'], editorSelectors: ['textarea[placeholder]', 'textarea', '[contenteditable="true"]'], anchorSelectors: ['form', 'textarea[placeholder]', '[contenteditable="true"]'], placement: 'input-corner', turnSelectors: ['[data-testid*="thread"]', '[class*="prose"]', 'main article'], sendSelectors: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]'] },
    { id: 'grok', label: 'Grok', hosts: ['grok.com', 'x.ai'], editorSelectors: ['textarea', '[contenteditable="true"]'], anchorSelectors: ['form', 'textarea', '[contenteditable="true"]'], placement: 'input-corner', turnSelectors: ['[data-testid*="message"]', 'main article'], sendSelectors: ['button[aria-label*="Send"]'] },
    { id: 'deepseek', label: 'DeepSeek', hosts: ['chat.deepseek.com', 'deepseek.com'], editorSelectors: ['textarea', '[contenteditable="true"]'], anchorSelectors: ['form', 'textarea', '[contenteditable="true"]'], placement: 'input-corner', turnSelectors: ['[class*="message"]', 'main article'], sendSelectors: ['button[aria-label*="Send"]'] }
  ];
  let syncTimer = null;
  let lastSyncKey = '';
  let pendingSyncKey = '';
  const MAX_CAPTURE_TURNS = 160;
  const MAX_CAPTURE_NODES = 360;

  function getProviderForHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    const path = String(location.pathname || '');
    return AI_PROVIDERS.find((provider) => {
      const hostMatches = provider.hosts.some((item) => host === item || host.endsWith(`.${item}`));
      if (!hostMatches) return false;
      return !provider.pathIncludes || provider.pathIncludes.some((item) => path.includes(item));
    }) || null;
  }

  function textFromMeta(name) {
    const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  function collectPageContext() {
    const title = document.title || textFromMeta('og:title') || location.hostname;
    const provider = getProviderForHost(location.hostname);
    const turns = collectAiChatTurns(provider);
    const promptDraft = collectPromptDraft(provider);
    const diagnostics = collectDiagnostics(provider, promptDraft, turns);
    return {
      title,
      url: location.href,
      host: location.hostname,
      aiProvider: provider ? provider.label : '',
      turns,
      diagnostics
    };
  }

  function collectAiChatTurns(provider) {
    if (!provider) return [];
    const selectors = provider.turnSelectors.concat(['main article']);
    const nodes = Array.from(document.querySelectorAll(selectors.join(',')));
    const turns = [];
    const seen = new Set();
    for (const node of nodes.slice(-MAX_CAPTURE_NODES)) {
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 12 || seen.has(text)) continue;
      seen.add(text);
      const explicitRole = node.getAttribute('data-message-author-role');
      const role = explicitRole || inferRole(node, turns.length);
      turns.push({ role, text });
    }
    return turns.slice(-MAX_CAPTURE_TURNS);
  }

  function findSelectorMatch(selectors) {
    for (const selector of selectors || []) {
      const el = document.querySelector(selector);
      if (el) return { el, selector };
    }
    return null;
  }

  function findTurnSelectorMatch(provider) {
    if (!provider) return null;
    for (const selector of provider.turnSelectors || []) {
      const count = document.querySelectorAll(selector).length;
      if (count) return { selector, count };
    }
    return null;
  }

  function collectPromptDraft(provider) {
    if (!provider) return '';
    for (const selector of provider.editorSelectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const text = ('value' in el ? el.value : el.innerText || el.textContent || '').trim();
      if (text) return text;
    }
    return '';
  }

  function findEditor(provider) {
    const match = findEditorMatch(provider);
    return match ? match.el : null;
  }

  function findEditorMatch(provider) {
    if (!provider) return null;
    return findSelectorMatch(provider.editorSelectors);
  }

  function findAnchor(provider) {
    const match = findAnchorMatch(provider);
    return match ? match.el : null;
  }

  function findAnchorMatch(provider) {
    if (!provider) return null;
    const editorMatch = findEditorMatch(provider);
    const configuredMatch = findSelectorMatch(provider.anchorSelectors || []);
    if (configuredMatch) return { ...configuredMatch, source: 'configured' };
    const editor = editorMatch ? editorMatch.el : null;
    if (editor) {
      const fallback = editor.closest('form') || editor.parentElement || editor;
      if (fallback) return { el: fallback, selector: editorMatch.selector, source: 'editor-fallback' };
    }
    return null;
  }

  function findAdjacentAnchor(provider) {
    const match = findSelectorMatch(provider && provider.adjacentSelectors ? provider.adjacentSelectors : []);
    return match ? match.el : null;
  }

  function collectDiagnostics(provider, promptDraft, turns) {
    const editorMatch = findEditorMatch(provider);
    const anchorMatch = findAnchorMatch(provider);
    const adjacentMatch = findSelectorMatch(provider && provider.adjacentSelectors ? provider.adjacentSelectors : []);
    const sendMatch = findSelectorMatch(provider && provider.sendSelectors ? provider.sendSelectors : []);
    const turnMatch = findTurnSelectorMatch(provider);
    return {
      supportedAiPage: !!provider,
      provider: provider ? provider.label : '',
      editorFound: !!editorMatch,
      editorSelector: editorMatch ? editorMatch.selector : '',
      anchorFound: !!anchorMatch,
      anchorSelector: anchorMatch ? anchorMatch.selector : '',
      anchorSource: anchorMatch ? anchorMatch.source || 'configured' : '',
      adjacentSelector: adjacentMatch ? adjacentMatch.selector : '',
      sendFound: !!sendMatch,
      sendSelector: sendMatch ? sendMatch.selector : '',
      turnSelector: turnMatch ? turnMatch.selector : '',
      turnSelectorCount: turnMatch ? turnMatch.count : 0,
      matchedSelectors: {
        editor: editorMatch ? editorMatch.selector : '',
        anchor: anchorMatch ? anchorMatch.selector : '',
        anchorSource: anchorMatch ? anchorMatch.source || 'configured' : '',
        adjacent: adjacentMatch ? adjacentMatch.selector : '',
        send: sendMatch ? sendMatch.selector : '',
        turn: turnMatch ? turnMatch.selector : ''
      },
      placement: provider ? provider.placement || 'input-corner' : '',
      promptLength: String(promptDraft || '').length,
      turnCount: Array.isArray(turns) ? turns.length : 0,
      memoryWidgetVisible: false,
      checkedAt: new Date().toISOString()
    };
  }

  function browserSyncKey(provider, turns) {
    const last = (turns || []).slice(-3).map((turn) => `${turn.role || 'unknown'}:${turn.text || ''}`).join('\n');
    return `${provider.id}:${location.href}:${(turns || []).length}:${last}`;
  }

  function scheduleConversationSync(provider) {
    if (!provider) return;
    const turns = collectAiChatTurns(provider);
    const hasConversation = turns.some((turn) => turn && turn.text && String(turn.text).trim().length >= 12);
    if (!hasConversation) return;
    const key = browserSyncKey(provider, turns);
    if (key === lastSyncKey) return;
    if (key === pendingSyncKey) return;
    if (syncTimer) clearTimeout(syncTimer);
    pendingSyncKey = key;
    syncTimer = setTimeout(() => {
      const freshTurns = collectAiChatTurns(provider);
      const nextKey = browserSyncKey(provider, freshTurns);
      pendingSyncKey = '';
      if (nextKey === lastSyncKey || !freshTurns.length) return;
      lastSyncKey = nextKey;
      chrome.runtime.sendMessage({ type: 'SYNC_PAGE_CONVERSATION' }, () => {});
    }, 1200);
  }

  function bootConversationSync() {
    const provider = getProviderForHost(location.hostname);
    if (!provider) return;
    const scan = () => {
      if (document.visibilityState === 'hidden') return;
      scheduleConversationSync(provider);
    };
    const attach = () => {
      const editor = findEditor(provider);
      if (!editor || editor.__agentMemoryBound) return;
      editor.__agentMemoryBound = true;
      ['input', 'keyup', 'paste', 'compositionend'].forEach((eventName) => {
        editor.addEventListener(eventName, () => {
          scheduleConversationSync(provider);
        }, true);
      });
      scheduleConversationSync(provider);
    };
    attach();
    [800, 2400, 5200, 9000].forEach((delay) => setTimeout(scan, delay));
    if (document.addEventListener) document.addEventListener('visibilitychange', scan);
    if (typeof setInterval === 'function') setInterval(scan, 15000);
    new MutationObserver(() => {
      attach();
      scheduleConversationSync(provider);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function inferRole(node, index) {
    const label = `${node.getAttribute('aria-label') || ''} ${node.className || ''}`.toLowerCase();
    if (/user|human|you|用户/.test(label)) return 'user';
    if (/assistant|agent|model|claude|chatgpt|gemini|回答/.test(label)) return 'assistant';
    return index % 2 === 0 ? 'user' : 'assistant';
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'AGENT_MEMORY_LAB_PING') {
      sendResponse({ ok: true });
      return true;
    }
    if (message && message.type === 'AGENT_MEMORY_LAB_COLLECT_PAGE') {
      sendResponse({ ok: true, page: collectPageContext() });
      return true;
    }
    return false;
  });

  bootConversationSync();
})();
