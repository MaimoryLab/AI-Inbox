import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = !!options.bubbles;
    this.target = null;
  }
}

class FakeNode {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.textContent = attrs.textContent || '';
    if (Object.prototype.hasOwnProperty.call(attrs, 'value')) this.value = attrs.value;
    this.__agentMemoryBound = false;
  }

  get id() {
    return this.attributes.id || '';
  }

  get className() {
    return this.attributes.class || '';
  }

  get innerText() {
    if (Object.prototype.hasOwnProperty.call(this, 'value')) return this.value;
    return this.textContent || this.children.map((child) => child.innerText || '').join(' ');
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    for (const handler of this.listeners.get(event.type) || []) handler.call(this, event);
    if (event.bubbles && this.parentElement) this.parentElement.dispatchEvent(event);
    return true;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  querySelector(selector) {
    return queryAll(this, selector)[0] || null;
  }

  querySelectorAll(selector) {
    return queryAll(this, selector);
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matchesSelector(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
}

function walk(root, out = []) {
  for (const child of root.children || []) {
    out.push(child);
    walk(child, out);
  }
  return out;
}

function queryAll(root, selector) {
  const selectors = String(selector || '').split(',').map((item) => item.trim()).filter(Boolean);
  return walk(root).filter((node) => selectors.some((item) => matchesSelector(node, item)));
}

function matchesSelector(node, selector) {
  if (!selector || !node) return false;
  const parts = selector.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return matchesSelector(node, parts[parts.length - 1]);
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  const attrMatches = [...selector.matchAll(/\[([^\]=*~^$|]+)(\*?=)?"?([^"\]]*)"?\]/g)];
  const tagMatch = selector.match(/^([a-z0-9-]+)/i);
  if (tagMatch && node.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
  for (const match of attrMatches) {
    const value = node.getAttribute(match[1].trim());
    if (value === null) return false;
    if (match[2] === '=' && value !== match[3]) return false;
    if (match[2] === '*=' && !value.includes(match[3])) return false;
  }
  if (!tagMatch && !attrMatches.length) return node.tagName.toLowerCase() === selector.toLowerCase();
  return true;
}

const documentElement = new FakeNode('html');
const body = new FakeNode('body');
documentElement.appendChild(body);
const main = new FakeNode('main');
const form = new FakeNode('form');
const editor = new FakeNode('div', {
  id: 'agentmemory-demo-input',
  contenteditable: 'true',
  textContent: '我们如何向外部试用者解释插件预览？'
});
form.appendChild(editor);
main.appendChild(new FakeNode('article', { 'data-message-author-role': 'user', textContent: 'We need a local preview for external testers.' }));
main.appendChild(new FakeNode('article', { 'data-message-author-role': 'assistant', textContent: 'Use the browser sync status panel and confirm the conversation appears in Sessions.' }));
main.appendChild(form);
body.appendChild(main);

const listeners = [];
const sentMessages = [];
const document = {
  title: 'Agent Memory Lab 插件预览',
  documentElement,
  body,
  querySelector: (selector) => documentElement.querySelector(selector),
  querySelectorAll: (selector) => documentElement.querySelectorAll(selector)
};

let mutationObserverCallback = null;
class FakeMutationObserver {
  constructor(callback) {
    mutationObserverCallback = callback;
  }
  observe() {}
}

const context = vm.createContext({
  document,
  location: { hostname: 'localhost', pathname: '/demo/browser-extension.html', href: 'http://localhost:3114/demo/browser-extension.html' },
  window: {
    addEventListener: () => {},
    getSelection: () => null
  },
  chrome: {
    runtime: {
      onMessage: { addListener: (handler) => listeners.push(handler) },
      sendMessage: (message, callback) => {
        sentMessages.push(message);
        if (callback) callback({ ok: true });
      }
    }
  },
  MutationObserver: FakeMutationObserver,
  setTimeout,
  clearTimeout,
  console
});

vm.runInContext(readFileSync('browser-extension/content-script.js', 'utf8'), context, { filename: 'content-script.js' });
if (mutationObserverCallback) mutationObserverCallback([]);

editor.textContent = '浏览器插件如何预览';
editor.dispatchEvent(new FakeEvent('input', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 1300));

assert(!documentElement.querySelector('agent-memory-lab-widget'), 'Conversation-only extension must not inject memory suggestion widgets.');
assert(sentMessages.some((message) => message.type === 'SYNC_PAGE_CONVERSATION'), 'Content script should schedule browser conversation sync.');

let collected = null;
for (const listener of listeners) {
  listener({ type: 'AGENT_MEMORY_LAB_COLLECT_PAGE' }, {}, (response) => {
    if (response && response.ok) collected = response.page;
  });
}

assert(collected, 'Content script should respond with captured page context.');
assert(collected.aiProvider === 'Agent Memory Demo', 'Demo page should be treated as an AI conversation source.');
assert(Array.isArray(collected.turns) && collected.turns.length >= 2, 'Demo page should expose captured conversation turns.');
assert(!('selection' in collected), 'Content script must not collect selected page text.');
assert(!('promptDraft' in collected), 'Content script must not send input drafts as capture content.');

console.log('browser extension demo conversation sync ok');
