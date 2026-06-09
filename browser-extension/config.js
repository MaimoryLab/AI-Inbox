export const DEFAULTS = {
  apiBase: 'http://localhost:3111',
  viewerBase: ''
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
  try {
    const res = await fetch(`${current.apiBase}/agentmemory/livez`, { headers: authHeaders(current) });
    const data = await res.json();
    if (data && typeof data.viewerPort === 'number') return `http://localhost:${data.viewerPort}`;
  } catch {}
  return 'http://localhost:3113';
}

export function authHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.secret) headers.Authorization = `Bearer ${settings.secret}`;
  return headers;
}
