export const DEFAULTS = {
  apiBase: 'http://localhost:3111',
  viewerBase: '',
  viewerFallbackBase: 'http://localhost:3114'
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(['apiBase', 'viewerBase', 'secret']);
  return {
    apiBase: stored.apiBase || DEFAULTS.apiBase,
    viewerBase: stored.viewerBase || DEFAULTS.viewerBase,
    secret: stored.secret || ''
  };
}

export async function resolveViewerBase(settings = null) {
  const current = settings || await getSettings();
  if (current.viewerBase) return current.viewerBase.replace(/\/$/, '');
  if (await hasAgentMemoryApi(DEFAULTS.viewerFallbackBase, current)) return DEFAULTS.viewerFallbackBase;
  try {
    const res = await fetch(`${current.apiBase}/agentmemory/livez`, { headers: authHeaders(current) });
    const data = await res.json();
    if (data && typeof data.viewerPort === 'number') return `http://localhost:${data.viewerPort}`;
  } catch {}
  return 'http://localhost:3114';
}

export async function resolveApiBase(settings = null) {
  const current = settings || await getSettings();
  const configured = (current.apiBase || DEFAULTS.apiBase).replace(/\/$/, '');
  if (await hasAgentMemoryApi(DEFAULTS.viewerFallbackBase, current)) return DEFAULTS.viewerFallbackBase;
  const viewerBase = (await resolveViewerBase(current)).replace(/\/$/, '');
  if (viewerBase && await hasAgentMemoryApi(viewerBase, current)) return viewerBase;
  if (await hasAgentMemoryApi(configured, current)) return configured;
  return configured;
}

async function hasAgentMemoryApi(base, settings) {
  try {
    const res = await fetch(`${base}/agentmemory/livez`, { headers: authHeaders(settings) });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!(data && data.service === 'agentmemory' && data.status === 'ok');
  } catch {
    return false;
  }
}

export function authHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.secret) headers.Authorization = `Bearer ${settings.secret}`;
  return headers;
}
