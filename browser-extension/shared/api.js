import { getSettings, authHeaders } from '../config.js';

export async function agentMemoryApi(path, options = {}) {
  const settings = await getSettings();
  const res = await fetch(`${settings.apiBase}${path}`, {
    ...options,
    headers: { ...authHeaders(settings), ...(options.headers || {}) }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  return data;
}

export async function openViewer(tab = 'dashboard', path = '') {
  const settings = await getSettings();
  if (path) return chrome.tabs.create({ url: `${settings.viewerBase}${path.startsWith('/') ? path : `/${path}`}` });
  return chrome.tabs.create({ url: `${settings.viewerBase}/#${tab}` });
}
