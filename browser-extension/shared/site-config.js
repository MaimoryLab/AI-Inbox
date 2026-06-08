export const AI_PROVIDERS = {
  agentmemory_demo: {
    id: 'agentmemoryDemo',
    label: 'Agent Memory Demo',
    hosts: ['localhost', '127.0.0.1'],
    pathIncludes: ['/demo/browser-extension.html'],
    editorSelectors: ['#agentmemory-demo-input', '[data-agentmemory-demo-input]', '[contenteditable="true"]'],
    turnSelectors: ['[data-message-author-role]', 'main article'],
    sendSelectors: ['button.primary']
  },
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    editorSelectors: ['#prompt-textarea', '[data-testid="prompt-textarea"]', 'textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    turnSelectors: ['[data-message-author-role]', '[data-testid*="conversation-turn"]', 'main article'],
    sendSelectors: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]']
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    hosts: ['claude.ai'],
    editorSelectors: ['div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"]', 'textarea', 'p[data-placeholder]'],
    turnSelectors: ['[data-testid*="message"]', 'main [class*="font-claude"]', 'main article'],
    sendSelectors: ['button[aria-label*="Send"]', 'button[type="submit"]']
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    hosts: ['gemini.google.com'],
    editorSelectors: ['rich-textarea [contenteditable="true"]', 'rich-textarea textarea', '[contenteditable="true"]', 'textarea'],
    turnSelectors: ['user-query', 'model-response', 'message-content', 'main article'],
    sendSelectors: ['button[aria-label*="Send"]', 'button[aria-label*="提交"]']
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    hosts: ['perplexity.ai', 'www.perplexity.ai'],
    editorSelectors: ['textarea[placeholder]', 'textarea', '[contenteditable="true"]'],
    turnSelectors: ['[data-testid*="thread"]', '[class*="prose"]', 'main article'],
    sendSelectors: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]']
  },
  grok: {
    id: 'grok',
    label: 'Grok',
    hosts: ['grok.com', 'x.ai'],
    editorSelectors: ['textarea', '[contenteditable="true"]'],
    turnSelectors: ['[data-testid*="message"]', 'main article'],
    sendSelectors: ['button[aria-label*="Send"]']
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    hosts: ['chat.deepseek.com', 'deepseek.com'],
    editorSelectors: ['textarea', '[contenteditable="true"]'],
    turnSelectors: ['[class*="message"]', 'main article'],
    sendSelectors: ['button[aria-label*="Send"]']
  }
};

export function getProviderForHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  const path = typeof location !== 'undefined' && location && location.pathname ? String(location.pathname) : '';
  return Object.values(AI_PROVIDERS).find((provider) => {
    const hostMatches = provider.hosts.some((item) => host === item || host.endsWith(`.${item}`));
    if (!hostMatches) return false;
    return !provider.pathIncludes || provider.pathIncludes.some((item) => path.includes(item));
  }) || null;
}

export function isSupportedAiHost(hostname) {
  return !!getProviderForHost(hostname);
}
