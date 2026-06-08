import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AI_PROVIDERS } from '../browser-extension/shared/site-config.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractContentProviders() {
  const source = readFileSync('browser-extension/content-script.js', 'utf8');
  const startToken = 'const AI_PROVIDERS = [';
  const start = source.indexOf(startToken);
  assert(start >= 0, 'Content script is missing AI_PROVIDERS.');

  const arrayStart = source.indexOf('[', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = arrayStart; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(arrayStart, i + 1);
        return vm.runInNewContext(`(${literal})`, Object.create(null));
      }
    }
  }
  throw new Error('Could not parse content script AI_PROVIDERS array.');
}

function normalizeProvider(provider) {
  const normalized = {};
  for (const key of [
    'id',
    'label',
    'hosts',
    'pathIncludes',
    'editorSelectors',
    'anchorSelectors',
    'adjacentSelectors',
    'placement',
    'turnSelectors',
    'sendSelectors'
  ]) {
    if (provider[key] !== undefined) normalized[key] = provider[key];
  }
  return normalized;
}

const sharedProviders = Object.values(AI_PROVIDERS).map(normalizeProvider);
const contentProviders = extractContentProviders().map(normalizeProvider);

assert(sharedProviders.length === contentProviders.length, `Provider count mismatch: shared=${sharedProviders.length}, content=${contentProviders.length}`);

const sharedById = new Map(sharedProviders.map((provider) => [provider.id, provider]));
const contentById = new Map(contentProviders.map((provider) => [provider.id, provider]));

for (const id of sharedById.keys()) {
  assert(contentById.has(id), `Content script missing provider ${id}.`);
}
for (const id of contentById.keys()) {
  assert(sharedById.has(id), `Shared site config missing provider ${id}.`);
}

for (const [id, shared] of sharedById.entries()) {
  const content = contentById.get(id);
  const sharedJson = JSON.stringify(shared);
  const contentJson = JSON.stringify(content);
  assert(sharedJson === contentJson, `${id}: content script site config drifted from shared/site-config.js.`);
}

console.log(`browser extension site config sync ok (${sharedProviders.length} providers)`);
