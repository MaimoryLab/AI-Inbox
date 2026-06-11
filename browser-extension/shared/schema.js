import { PAGE_TYPE_LABELS, detectAiProvider, detectPageType } from './page-types.js';

export const CAPTURE_SCHEMA_VERSION = 1;
export const MAX_CAPTURE_TURNS = 160;
export const MAX_TURN_TEXT_LENGTH = 6000;

export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl || '');
    return {
      url: url.href,
      host: url.hostname,
      origin: url.origin
    };
  } catch {
    return { url: rawUrl || '', host: '', origin: '' };
  }
}

export function createPageCapture(page = {}) {
  const normalized = normalizeUrl(page.url);
  const now = new Date().toISOString();
  const pageType = detectPageType({ ...page, ...normalized });
  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    capturedAt: now,
    source: 'browser-extension',
    page: {
      type: pageType,
      typeLabel: PAGE_TYPE_LABELS[pageType] || '网页',
      title: String(page.title || '当前页面').trim(),
      url: normalized.url,
      host: page.host || normalized.host,
      origin: normalized.origin
    },
    conversation: {
      provider: String(page.aiProvider || detectAiProvider({ ...page, ...normalized }) || ''),
      turns: Array.isArray(page.turns) ? page.turns.map(normalizeTurn).filter(Boolean).slice(-MAX_CAPTURE_TURNS) : []
    },
    diagnostics: normalizeDiagnostics(page.diagnostics)
  };
}

function normalizeDiagnostics(value) {
  const input = value && typeof value === 'object' ? value : {};
  const matched = input.matchedSelectors && typeof input.matchedSelectors === 'object' ? input.matchedSelectors : {};
  return {
    supportedAiPage: !!input.supportedAiPage,
    provider: String(input.provider || ''),
    editorFound: !!input.editorFound,
    editorSelector: String(input.editorSelector || ''),
    anchorFound: !!input.anchorFound,
    anchorSelector: String(input.anchorSelector || ''),
    anchorSource: String(input.anchorSource || ''),
    adjacentSelector: String(input.adjacentSelector || ''),
    sendFound: !!input.sendFound,
    sendSelector: String(input.sendSelector || ''),
    turnSelector: String(input.turnSelector || ''),
    turnSelectorCount: Number.isFinite(Number(input.turnSelectorCount)) ? Number(input.turnSelectorCount) : 0,
    matchedSelectors: {
      editor: String(matched.editor || input.editorSelector || ''),
      anchor: String(matched.anchor || input.anchorSelector || ''),
      anchorSource: String(matched.anchorSource || input.anchorSource || ''),
      adjacent: String(matched.adjacent || input.adjacentSelector || ''),
      send: String(matched.send || input.sendSelector || ''),
      turn: String(matched.turn || input.turnSelector || '')
    },
    placement: String(input.placement || ''),
    promptLength: Number.isFinite(Number(input.promptLength)) ? Number(input.promptLength) : 0,
    turnCount: Number.isFinite(Number(input.turnCount)) ? Number(input.turnCount) : 0,
    memoryWidgetVisible: !!input.memoryWidgetVisible,
    checkedAt: String(input.checkedAt || '')
  };
}

function normalizeTurn(turn) {
  if (!turn || !turn.text) return null;
  return {
    role: turn.role === 'user' || turn.role === 'assistant' ? turn.role : 'unknown',
    text: String(turn.text).trim().slice(0, MAX_TURN_TEXT_LENGTH)
  };
}

export function createCaptureRecord(capture, kind, result) {
  const item = result && result.item ? result.item : null;
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    title: capture.page.title,
    url: capture.page.url,
    host: capture.page.host,
    type: capture.page.type,
    typeLabel: capture.page.typeLabel,
    savedAt: new Date().toISOString(),
    resultId: result && (result.id || result.memoryId || result.lessonId || result.actionId || (item && item.id) || '')
  };
}
