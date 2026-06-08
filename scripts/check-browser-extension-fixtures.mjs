import { AI_PROVIDERS, getProviderForHost } from '../browser-extension/shared/site-config.js';

const fixtures = [
  {
    id: 'agentmemoryDemo',
    host: 'localhost',
    path: '/demo/browser-extension.html',
    html: `
      <main>
        <article data-message-author-role="user">We need a local preview for external testers.</article>
        <article data-message-author-role="assistant">The demo should show the memory hint near the prompt.</article>
        <form><div id="agentmemory-demo-input" contenteditable="true">How should we improve the extension demo?</div></form>
      </main>
    `
  },
  {
    id: 'chatgpt',
    host: 'chatgpt.com',
    html: `
      <main>
        <article data-message-author-role="user">Please remember this product direction for later.</article>
        <article data-message-author-role="assistant">I will keep the local-first review workflow in mind.</article>
        <form><div id="prompt-textarea" contenteditable="true">How should we improve the browser extension?</div></form>
      </main>
    `
  },
  {
    id: 'claude',
    host: 'claude.ai',
    html: `
      <main>
        <section data-testid="user-message">Use the Agent Memory Lab design language.</section>
        <section data-testid="assistant-message">Keep the UI restrained and local-first.</section>
        <form><div class="ProseMirror" contenteditable="true">Summarize relevant memory before I ask.</div></form>
      </main>
    `
  },
  {
    id: 'gemini',
    host: 'gemini.google.com',
    html: `
      <main>
        <user-query>Find my memory about browser plugins.</user-query>
        <model-response>Here is the relevant local context.</model-response>
        <rich-textarea><div contenteditable="true">What did we learn from Mem0?</div></rich-textarea>
      </main>
    `
  },
  {
    id: 'perplexity',
    host: 'www.perplexity.ai',
    html: `
      <main>
        <div data-testid="thread-message">Compare cross-AI memory tools.</div>
        <div class="prose">Agent Memory Lab keeps long-term writes reviewable.</div>
        <form><textarea placeholder="Ask anything">Bring in local memory about plugins.</textarea></form>
      </main>
    `
  },
  {
    id: 'grok',
    host: 'grok.com',
    html: `
      <main>
        <article data-testid="message-user">Use previous product decisions.</article>
        <article data-testid="message-assistant">I found the local-first plugin plan.</article>
        <textarea>What should the side panel show?</textarea>
      </main>
    `
  },
  {
    id: 'deepseek',
    host: 'chat.deepseek.com',
    html: `
      <main>
        <div class="message user">Remember the review queue requirement.</div>
        <div class="message assistant">The extension should not write silently.</div>
        <div contenteditable="true">Generate the next delivery checklist.</div>
      </main>
    `
  }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeHtml(html) {
  return String(html || '').replace(/\s+/g, ' ');
}

function selectorMatches(html, selector) {
  const normalized = normalizeHtml(html);
  const alternatives = String(selector || '').split(',').map((item) => item.trim()).filter(Boolean);
  return alternatives.some((item) => simpleSelectorMatches(normalized, item));
}

function simpleSelectorMatches(html, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    let cursor = 0;
    for (const part of parts) {
      const index = findSimplePart(html.slice(cursor), part);
      if (index < 0) return false;
      cursor += index + 1;
    }
    return true;
  }
  return findSimplePart(html, selector) >= 0;
}

function findSimplePart(html, selector) {
  if (selector.startsWith('#')) {
    return html.search(new RegExp(`<[^>]+\\bid=["']${escapeRegExp(selector.slice(1))}["'][^>]*>`, 'i'));
  }

  const tagMatch = selector.match(/^([a-z0-9-]+)/i);
  const classMatch = selector.match(/\.([a-z0-9_-]+)/i);
  const attrMatch = selector.match(/\[([^\]=*~^$|]+)(\*?=)?["']?([^"'\]]*)["']?\]/i);
  const tag = tagMatch ? tagMatch[1] : '[a-z0-9-]+';
  const tagPattern = `<${tag}\\b[^>]*`;

  if (classMatch) {
    const className = escapeRegExp(classMatch[1]);
    const pattern = `${tagPattern}\\bclass=["'][^"']*(^|\\s)${className}(\\s|$)[^"']*["'][^>]*>`;
    if (html.search(new RegExp(pattern, 'i')) < 0) return -1;
  }

  if (attrMatch) {
    const name = escapeRegExp(attrMatch[1].trim());
    const operator = attrMatch[2] || '';
    const value = escapeRegExp(attrMatch[3] || '');
    const attrPattern = operator === '*='
      ? `${tagPattern}\\b${name}=["'][^"']*${value}[^"']*["'][^>]*>`
      : operator
        ? `${tagPattern}\\b${name}=["']${value}["'][^>]*>`
        : `${tagPattern}\\b${name}(=["'][^"']*["'])?[^>]*>`;
    return html.search(new RegExp(attrPattern, 'i'));
  }

  if (classMatch) return html.search(new RegExp(`${tagPattern}>`, 'i'));
  return html.search(new RegExp(`<${escapeRegExp(selector)}\\b[^>]*>`, 'i'));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const fixture of fixtures) {
  globalThis.location = { pathname: fixture.path || '/' };
  const provider = getProviderForHost(fixture.host);
  assert(provider, `${fixture.id}: provider not found for ${fixture.host}`);
  assert(provider.id === fixture.id, `${fixture.id}: expected provider ${fixture.id}, got ${provider.id}`);
  assert(provider.editorSelectors.some((selector) => selectorMatches(fixture.html, selector)), `${fixture.id}: no editor selector matches fixture`);
  assert(provider.turnSelectors.some((selector) => selectorMatches(fixture.html, selector)), `${fixture.id}: no turn selector matches fixture`);
}

for (const provider of Object.values(AI_PROVIDERS)) {
  assert(Array.isArray(provider.hosts) && provider.hosts.length > 0, `${provider.id}: missing hosts`);
  assert(Array.isArray(provider.editorSelectors) && provider.editorSelectors.length > 0, `${provider.id}: missing editor selectors`);
  assert(Array.isArray(provider.turnSelectors) && provider.turnSelectors.length > 0, `${provider.id}: missing turn selectors`);
}

console.log(`browser extension AI fixtures ok (${fixtures.length} providers)`);
