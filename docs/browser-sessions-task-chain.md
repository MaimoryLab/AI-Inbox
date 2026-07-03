# Browser Sessions Goal Task Chain

Goal document for running the five browser-session tasks in one continuous pass.

Related plan: [browser-sessions-plan.md](./browser-sessions-plan.md)

## Goal

Deliver a first usable browser-session path:

1. Browser pages are captured by a Chrome MV3 extension.
2. Captures are posted to local AI-Index.
3. AI-Index stores them as `browser` sessions and observations.
4. Existing LLM-only organize flow can extract todos from those observations.
5. Each task leaves a recorded checkpoint result in this document.

## Ground Rules

- Work only in `/Users/ppio/.config/superpowers/worktrees/AI-Todo/codex-next`.
- Stay on branch `codex/next`.
- Use CodeGraph before reading or changing indexed code.
- Do not use `/Users/ppio/Documents/AI-Todo`.
- Old project reference is read-only: `/Users/ppio/Documents/AI-TodoProject/AI-Todo`.
- Reuse current code before adding new layers.
- Keep browser todo extraction LLM-only; do not add rules fallback.
- Keep `ai-index open` default on `127.0.0.1:3111`.

## Current Baseline

- `SourceKind` already includes `browser`.
- `src/sources/browser.ts` already validates `{ id?, path?, messages }` and writes sessions plus observations.
- `src/server/index.ts` already contains `POST /browser/sessions`.
- `src/sources/service.ts` already lists `browser`.

This means the first run should reuse `/browser/sessions`. Add `/api/browser-sessions` only as a compatibility alias if the extension or UI contract needs that exact path.

## Task 1: Backend Browser Ingest Endpoint

**Purpose:** Make the server ingest browser captures through a stable HTTP contract.

**Do this:**

1. Use CodeGraph on `src/server/index.ts`, `src/sources/browser.ts`, and relevant HTTP tests.
2. Confirm the existing `POST /browser/sessions` behavior.
3. Decide whether to keep only `/browser/sessions` or add `/api/browser-sessions` as a thin alias.
4. Ensure local-token authorization behavior matches other mutating endpoints.
5. Ensure success response includes `sessionId` and `observations`.
6. Ensure invalid JSON or invalid payload returns 400 with a short error code.
7. Add or update the smallest HTTP API test that posts a valid browser session and one invalid body.

**Acceptance criteria:**

- Valid browser payload writes one `browser` session and its observations.
- Invalid body returns 400 without writing rows.
- The endpoint does not introduce review queue semantics.

**Verification:**

- Run the smallest relevant HTTP/source test.
- Record exact command and result below.

**Checkpoint review result:** Passed.

**Checkpoint notes:** Reused the existing `/browser/sessions` handler and added `/api/browser-sessions` as a thin alias. Added HTTP coverage for valid capture payloads, invalid bodies, and unchanged local-token write protection.

## Task 2: Browser Capture Schema Adapter

**Purpose:** Accept the extension capture shape without creating a plugin framework.

**Do this:**

1. Use CodeGraph on `validateBrowserSessionInput`, `ingestBrowserSession`, `BrowserSessionInput`, and tests.
2. Add a tiny adapter in `src/sources/browser.ts` if needed for:
   - `schemaVersion`
   - `capturedAt`
   - `page.url`
   - `conversation.provider`
   - `conversation.turns`
3. Map provider plus page URL into a stable session id.
4. Map page URL into `path`.
5. Normalize turns into `messages`.
6. Trim text and reject empty turns.
7. Normalize unknown or missing roles to `unknown`.
8. Cap turns with one constant if no existing product limit applies.
9. Keep storage format unchanged: `sessions` plus `observations`.
10. Add focused validation and ingest tests.

**Acceptance criteria:**

- Existing `{ id?, path?, messages }` input still works.
- New capture shape works.
- Empty text, missing turns, invalid timestamps, and oversized payloads fail clearly.
- No new database tables are added.

**Verification:**

- Run the smallest source/browser tests.
- Record exact command and result below.

**Checkpoint review result:** Passed.

**Checkpoint notes:** `src/sources/browser.ts` now accepts both existing `{ id?, path?, messages }` input and the browser capture shape. It maps provider plus URL to a stable browser session id, trims text, normalizes unknown roles to `unknown`, preserves capture timestamps, caps turns at 160, and keeps storage in existing `sessions` plus `observations`.

## Checkpoint A: Backend Foundation

Run after Tasks 1 and 2.

**Review checklist:**

- Browser capture can be inserted by HTTP without the extension.
- Browser sessions appear through existing session listing APIs.
- Validation prevents blank or malformed captures.
- Tests cover endpoint and adapter behavior.

**Required commands:**

- `npm test`
- `git diff --check`

**Checkpoint review result:** Passed.

**Checkpoint notes:** Verified by `npm test` on 2026-07-02. Result: 140 passing tests, including browser ingest endpoint and capture adapter coverage. `git diff --check` will be run at final verification after remaining planned edits.

## Task 3: Minimal Chrome MV3 Extension

**Purpose:** Create a load-unpacked extension that captures ChatGPT and Claude sessions.

**Do this:**

1. Create `browser-extension/manifest.json`.
2. Add host permissions for:
   - `https://chatgpt.com/*`
   - `https://chat.openai.com/*`
   - `https://claude.ai/*`
   - `http://127.0.0.1:*/*`
   - `http://localhost:*/*`
3. Add `browser-extension/shared/site-config.js` with only ChatGPT and Claude provider configs.
4. Add `browser-extension/content-script.js`.
5. In the content script:
   - detect provider by host
   - find visible conversation turns
   - infer `user`, `assistant`, or `unknown`
   - return `{ schemaVersion, capturedAt, page, conversation }`
6. Add `browser-extension/service-worker.js`.
7. In the service worker:
   - collect from the active tab
   - dedupe by provider, URL, turn count, and tail text
   - POST to the backend endpoint
   - store last sync result in `chrome.storage.local`
8. Do not add build tooling unless plain static files cannot work.

**Acceptance criteria:**

- Extension can be loaded unpacked.
- Manual sync sends a capture from ChatGPT or Claude.
- Duplicate unchanged captures are skipped locally.
- Extension code contains no old Agent Memory Lab naming.

**Verification:**

- Run a static syntax check where practical.
- Manually load unpacked extension and sync one supported page.
- Record exact result below.

**Checkpoint review result:** Passed static implementation checks.

**Checkpoint notes:** Added dependency-free Chrome MV3 files under `browser-extension/`: manifest, provider config, content script, and service worker. The extension supports ChatGPT and Claude hosts, collects visible turns, dedupes unchanged automatic captures, and posts to `/api/browser-sessions`. Static syntax and manifest JSON checks passed with `node --check` plus JSON parse.

## Task 4: Popup and Options

**Purpose:** Add the smallest UI needed to operate and debug the extension.

**Do this:**

1. Add `browser-extension/popup.html`.
2. Add `browser-extension/popup.js`.
3. Add `browser-extension/options.html`.
4. Add `browser-extension/options.js`.
5. Store API base URL in `chrome.storage.local`, defaulting to `http://127.0.0.1:3111`.
6. Add a manual sync button in popup.
7. Show:
   - connection or last error
   - last sync time
   - captured turn count
8. Keep UI static and dependency-free.

**Acceptance criteria:**

- User can change API base URL.
- User can manually sync the current supported tab.
- Popup shows useful last result after success and failure.
- No side panel or deep diagnostics are added.

**Verification:**

- Manually test options save and popup sync.
- Record exact result below.

**Checkpoint review result:** Passed static implementation checks.

**Checkpoint notes:** Added popup and options pages. Options stores API base URL with default `http://127.0.0.1:3111`; popup can request manual current-tab sync and displays last status, turn count, and sync time. Static syntax checks passed.

## Checkpoint B: Extension Usability

Run after Tasks 3 and 4.

**Review checklist:**

- Chrome load-unpacked works.
- Supported AI page captures at least one user and assistant turn.
- Backend receives and stores the capture.
- Popup reports success or a clear failure.
- No old review queue or memory candidate behavior was copied.

**Required commands:**

- `npm test`
- `npm run build`
- `git diff --check`

**Manual checks:**

- Start AI-Index locally.
- Load extension unpacked.
- Open ChatGPT or Claude.
- Run manual sync.
- Confirm browser session appears in AI-Index.

**Checkpoint review result:** Partial pass; automated Chrome load check passed, real-page sync still requires manual verification.

**Checkpoint notes:** Static checks passed: `node --check browser-extension/content-script.js`, `service-worker.js`, `popup.js`, `options.js`, and manifest JSON parse. System Chrome was launched with `--load-extension=browser-extension`; the Chrome DevTools target list showed the AI-Index extension service worker loaded. Real ChatGPT/Claude capture plus popup sync still requires manual verification in the user's browser session.

## Task 5: Organize Flow Verification

**Purpose:** Prove browser sessions participate in the existing LLM-only todo flow.

**Do this:**

1. Use CodeGraph on organize flow, session listing, source display, and browser source handling.
2. Insert a representative browser session through HTTP or the extension.
3. Confirm session listing includes source `browser`.
4. Confirm observations are available for that session.
5. Run organize on browser-backed data.
6. Verify successful extraction creates todos with browser origins.
7. Verify LLM failure still reports actionable warnings and does not use rules fallback.
8. Fix only actual gaps found in the flow.

**Acceptance criteria:**

- Browser sessions appear in API/UI source and session views.
- Organize includes browser observations.
- Extracted todos preserve browser origin/evidence.
- LLM error behavior remains LLM-only and actionable.

**Verification:**

- `npm test`
- `npm run build`
- `git diff --check`
- Manual browser-session organize smoke test.

**Checkpoint review result:** Passed.

**Checkpoint notes:** Added `HTTP organize includes browser capture sessions` coverage. The test posts a browser capture, confirms `/sessions?source=browser` and observations, runs organize with a test LLM extractor, then asserts the created todo and evidence preserve `browser` origin. LLM-only behavior remains covered by existing no-fallback tests.

## Checkpoint C: Goal Completion

Run after Task 5.

**Review checklist:**

- All five task checkpoints are updated.
- All required tests and build checks pass, or failures are documented with cause.
- Browser extension can sync at least one supported page.
- Browser session is stored, visible, and eligible for LLM-only organize.
- No secrets, local data, `dist/`, or `node_modules/` are committed.

**Required commands:**

- `npm test`
- `npm run build`
- `git diff --check`
- `git status --short`

**Checkpoint review result:** Partial pass; automatic verification passed, real-page Chrome sync pending.

**Checkpoint notes:** Final automatic checks on 2026-07-02: `npm test` passed with 141 tests, `npm run build` passed, `git diff --check` passed, extension static checks passed, and system Chrome loaded the extension service worker via `--load-extension`. `git status --short` shows modified backend/tests plus new `browser-extension/` and `docs/` files. Manual real ChatGPT/Claude sync remains pending because it requires an authenticated interactive browser page.

## Execution Order

1. Task 1
2. Task 2
3. Checkpoint A
4. Task 3
5. Task 4
6. Checkpoint B
7. Task 5
8. Checkpoint C

This order keeps the backend contract testable before the extension exists, then verifies the browser path before relying on it in organize.
