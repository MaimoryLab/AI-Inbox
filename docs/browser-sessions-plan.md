# Browser Sessions Initial Plan

## Context

The current `codex/next` tree already has a small browser source seam:

- `src/contracts.ts` and `src/web/src/types.ts` include `browser` in `SourceKind`.
- `src/sources/browser.ts` can validate a minimal `{ id?, path?, messages }` payload and write it as `sessions` plus `observations`.
- `src/sources/service.ts` lists `browser` alongside `codex` and `claude-code`.

The missing piece is the browser-side capture and a stable local HTTP contract for it.

The old project reference is `/Users/ppio/Documents/AI-TodoProject/AI-Todo`, mainly:

- `browser-extension/content-script.js`
- `browser-extension/service-worker.js`
- `browser-extension/shared/schema.js`
- `browser-extension/shared/site-config.js`
- `browser-extension/shared/api.js`
- `browser-extension/shared/config.js`

Do not migrate the old Agent Memory Lab review queue, memory/skill candidate system, viewer fallback server, or `/agentmemory/review` API shape.

Execution runbook: [browser-sessions-task-chain.md](./browser-sessions-task-chain.md)

## First-Version Scope

Build the smallest useful Chrome MV3 extension and backend contract:

1. Capture ChatGPT and Claude browser conversations from the DOM.
2. Send a normalized session payload to local AI-Index at `http://127.0.0.1:3111`.
3. Store the payload as `browser` sessions and observations.
4. Let existing LLM-only todo extraction consume browser sessions through the normal organize flow.
5. Show only basic extension status: connected, last sync, captured turn count, manual sync.

Skipped for v1: side panel diagnostics, approval queues, rules fallback, multi-backend viewer compatibility, marketplace packaging.

## Proposed Contract

Use a dedicated AI-Index endpoint instead of the old `/agentmemory/review` path:

`POST /api/browser-sessions`

Request body:

```json
{
  "schemaVersion": 1,
  "capturedAt": "2026-07-02T00:00:00.000Z",
  "page": {
    "url": "https://chatgpt.com/...",
    "title": "ChatGPT",
    "host": "chatgpt.com"
  },
  "conversation": {
    "provider": "chatgpt",
    "turns": [
      { "role": "user", "text": "..." },
      { "role": "assistant", "text": "..." }
    ]
  }
}
```

Backend maps this into existing `BrowserSessionInput`:

- `id`: stable hash of provider plus normalized URL.
- `path`: page URL.
- `messages`: `conversation.turns`, preserving `capturedAt` or per-turn timestamps when available.

## Implementation Tasks

### Task 1: Backend Browser Ingest Endpoint

Add `POST /api/browser-sessions` in `src/server/index.ts`.

Acceptance criteria:

- Valid capture payload returns `{ ok: true, sessionId, observations }`.
- Invalid body returns a 400 with an actionable error.
- The endpoint reuses `validateBrowserSessionInput`/`ingestBrowserSession` or a tiny adapter in `src/sources/browser.ts`.

Verification:

- Add focused HTTP API tests in `test/http-api.test.ts` or a new small browser-source test.
- Run `npm test -- --runInBand` only if the repo test runner supports it; otherwise `npm test`.

Dependencies: none.

Likely files:

- `src/server/index.ts`
- `src/sources/browser.ts`
- `test/http-api.test.ts`

### Task 2: Browser Capture Schema Adapter

Extend `src/sources/browser.ts` to accept the capture shape without making it a general plugin framework.

Acceptance criteria:

- Supports `conversation.turns` with non-empty text.
- Accepts only known roles or normalizes unknown roles to `unknown`.
- Caps turns at a conservative limit, matching current product limits where available.

Verification:

- Unit test validation and DB insert behavior.

Dependencies: Task 1 can stub this, but final endpoint depends on it.

Likely files:

- `src/sources/browser.ts`
- `test/sources.test.ts`

### Task 3: Minimal Chrome MV3 Extension

Create a `browser-extension/` directory with static extension files.

Acceptance criteria:

- `manifest.json` loads a content script and service worker.
- Content script recognizes ChatGPT and Claude by host.
- Content script extracts visible turns into `{ role, text }`.
- Service worker posts to `/api/browser-sessions`.

Verification:

- Manual load-unpacked test in Chrome.
- Static test or lint check if practical without adding dependencies.

Dependencies: Task 1.

Likely files:

- `browser-extension/manifest.json`
- `browser-extension/content-script.js`
- `browser-extension/service-worker.js`
- `browser-extension/shared/site-config.js`
- `browser-extension/shared/api.js`

### Task 4: Extension Popup and Options

Add the smallest usable control surface.

Acceptance criteria:

- User can configure API base URL, defaulting to `http://127.0.0.1:3111`.
- User can run manual sync for the current tab.
- Popup shows last sync result and captured turn count.

Verification:

- Manual Chrome check.

Dependencies: Task 3.

Likely files:

- `browser-extension/popup.html`
- `browser-extension/popup.js`
- `browser-extension/options.html`
- `browser-extension/options.js`

### Task 5: Organize Flow Verification

Verify browser sessions are visible and usable in the current UI/API.

Acceptance criteria:

- `browser` appears in source/session lists after ingest.
- Organize flow includes browser observations.
- LLM failures remain actionable and do not fall back to rules.

Verification:

- `npm test`
- `npm run build`
- `git diff --check`
- Manual: start `ai-index open`, POST a browser capture, inspect Sources and organize output.

Dependencies: Tasks 1 and 2.

Likely files:

- Tests only unless a UI source label/icon gap appears.

## Risks

| Risk | Mitigation |
| --- | --- |
| AI websites change DOM often | Keep provider selectors in one small config file and support manual sync first. |
| Local endpoint receives arbitrary browser data | Validate body size, turn count, role, and text before DB writes. |
| Old project protocol pulls in review queue complexity | Use a dedicated `/api/browser-sessions` endpoint and map directly to sessions/observations. |
| Extension cannot reach localhost due to config | Include host permissions for `http://127.0.0.1:*/*` and `http://localhost:*/*`. |

## Checkpoints

After Tasks 1-2:

- Browser capture can be inserted by HTTP without the extension.
- Tests cover validation and storage.

After Tasks 3-4:

- Chrome load-unpacked can sync a real ChatGPT or Claude page.

After Task 5:

- Browser sessions participate in normal AI-Index LLM-only extraction.
