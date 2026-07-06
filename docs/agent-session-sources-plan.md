# Agent Session Sources Research and Implementation Plan

Date: 2026-07-06
Branch context: `codex/next`
Remote handoff branch for current browser work: `origin/codex/broswer`

## Goal

Extend AI Index beyond Codex, Claude Code, and browser sessions so local sessions from mainstream agent platforms can enter the same extraction chain:

local session store -> normalized `sessions`/`observations` -> existing LLM organize -> todo/task-chain cards.

This is a local-first scanner plan only. It should not read browser history, call vendor cloud APIs, collect API keys, or sync private state outside the user's machine.

## Current Project Baseline

- Current stable sources are `codex`, `claude-code`, and `browser`.
- `src/sources/scan.ts` scans only Codex and Claude Code filesystem roots.
- `src/sources/browser.ts` already normalizes browser capture into session observations.
- The organize path consumes normalized observations and is already source-agnostic enough once observations are in SQLite.

Temporary implementation direction: add one new source family, `agent`, with provider-specific parser IDs. Do not add a new top-level UI tab for every tool in the first version.

## Research Matrix

| Platform | Local/session storage signal | Likely parser shape | Confidence | First implementation decision |
| --- | --- | --- | --- | --- |
| Codex CLI | Existing scanner reads `~/.codex/sessions` and `~/.codex/archived_sessions` JSONL-like records. | Already implemented. | High | Keep as-is. |
| Claude Code | Existing scanner reads `~/.claude/projects/**` JSONL records. | Already implemented. | High | Keep as-is. |
| Gemini CLI | Auto-saves project-specific sessions. Public docs describe `~/.gemini/tmp/<project_hash>/chats/` and saved prompts/model responses/tool executions/token stats. | JSON/JSONL session files under project hash directories. | High | Add `gemini-cli` adapter. Prefer direct file parse; map tool calls to `tool`, prompts to `user`, model output to `assistant`. |
| Kiro CLI | Docs say sessions auto-save every turn, are per-directory, use UUIDs, and storage is a local database under `~/.kiro/`. Docs also support export/custom save scripts. | SQLite/local DB; possible exported JSON path for controlled tests. | Medium | Add after Gemini/Pi. Start with DB read-only copy; use CLI export fixture if DB schema changes. |
| Kiro IDE | Docs confirm session/history exists; community package notes IDE stores conversations as JSON files in global storage. | VS Code-style global storage JSON. | Medium | Treat as IDE adapter after Kiro CLI. Needs local sample before coding. |
| OpenCode | Official CLI supports `opencode session list` and `opencode export [sessionID]` as JSON; docs also expose session stats and web session views. | Export JSON is the stable interface; internal store can stay opaque. | High | First version supports an export directory or optional `opencode export` ingestion only when user explicitly points at exported JSON. Do not run OpenCode automatically. |
| Pi Coding Agent | Docs say sessions are automatic JSONL files at `~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl`; entries form trees via `id`/`parentId`. | JSONL with typed entries and branch tree. | High | Add `pi` adapter early. Store one AI Index session per JSONL file; preserve branch order by active path first, then chronological fallback. |
| Aider | Official docs say chat transcript defaults to `.aider.chat.history.md`; input history is `.aider.input.history`; LLM log can be configured separately. | Markdown transcript in project root. | High | Add `aider` adapter. Parse headings/role markers conservatively; skip `.aider.input.history` by default because it is prompt history, not full transcript. |
| Cline | Docs confirm local automatic task history. Public issue/docs mention task folders and `ui_messages.json` under extension global storage. | VS Code extension global storage task folders + JSON. | Medium | Add after CLI adapters. Scan known VS Code/Cursor app support roots read-only; parse `ui_messages.json` when present. |
| Roo Code | Public issues indicate task history is stored in VS Code `state.vscdb`/global state and checkpoints folders. | VS Code extension state DB plus task/checkpoint files. | Medium | Share VS Code-extension scanner with Cline where possible. Needs local sample for exact keys. |
| Kilo Code | Cline/Roo-derived extension family; likely same VS Code extension storage pattern. | VS Code extension global storage / state DB. | Low-Medium | Do not implement until Cline/Roo scanner is stable; add as compatible adapter if sample matches. |
| Cursor | Community/forum evidence consistently points to VS Code-style `User/workspaceStorage/<id>/state.vscdb`; chat/composer keys live in SQLite rows. | SQLite `state.vscdb` key-value rows, usually JSON blobs. | Medium | Implement read-only SQLite copy scanner. Start with macOS/Linux/Windows workspaceStorage roots and key-pattern fixtures. |
| Windsurf / Cascade | Community evidence points to `~/.codeium/windsurf/cascade`; other reports mention non-public/protobuf-like history and limits. | Local files, possibly binary/protobuf or JSON blobs. | Low-Medium | Research with local sample first. Do not ship parser until schema is confirmed. |
| Continue.dev | VS Code/JetBrains extension; local config under `~/.continue`, but chat transcript storage is extension/app specific. | Extension storage / workspace DB. | Low | Add to research queue, not first implementation. |
| Zed Assistant | Zed has assistant/history UX, but local transcript schema needs local sample or source audit. | Zed app support DB/files. | Low | Research queue only. |
| GitHub Copilot Chat | History is IDE-owned and cloud/account-integrated; local export is not a stable public contract. | VS Code storage may contain caches, not reliable transcript source. | Low | Do not implement first; only support if user provides explicit export or stable local schema. |
| Devin Desktop Plugins | Docs expose chat history and export from the plugin UI. | Export file, not direct store. | Medium | Support exported conversations only; no cloud/API scraping. |
| OpenClaw | Docs say gateway owns all session state; sessions, transcripts, compaction checkpoints, and trajectory sidecars are maintained locally by the gateway. Some docs reference workspace memory under `~/.openclaw/workspace`; unofficial material references `~/.openclaw/agents/<agentId>/sessions/sessions.json`. | Gateway session store plus transcript sidecars. | Medium | Add only after local OpenClaw sample. Expected root: `~/.openclaw`. Parser should read `sessions.json` plus transcript files, not gateway APIs. |
| Hermes Agent | Docs say every conversation is saved as a session and supports resume/search/history; backup guidance points at `~/.hermes`. | Local `~/.hermes` session/memory store, exact schema unconfirmed. | Medium | Add after sample/source audit. Expected root: `~/.hermes`; parse sessions only, not curated memory unless linked to transcript evidence. |

## Proposed Implementation

### Architecture

Add a new scanner module:

- `src/sources/agent.ts`
- `src/sources/agent-adapters/*.ts` only if `agent.ts` becomes too large.
- One public scanner entry: `scanAgentSessions(db, roots?)`.
- One normalized record shape inside the scanner:
  - `provider`: `gemini-cli`, `kiro`, `opencode`, `pi`, `aider`, etc.
  - `sessionKey`: provider-native session id or file path.
  - `path`: source file/db/export path.
  - `projectPath`: workspace/project when known.
  - `title`: provider + native title/summary when available.
  - `messages`: `{ role, text, createdAt? }[]`.

Persist into existing tables:

- `sessions.source = "agent"` for the first version.
- `sessions.id = hash("agent", provider, sessionKey)`.
- `sessions.path = physical source path or export path`.
- `sessions.title = "<Provider>: <native title>"` when known.
- `sessions.project_path = workspace root when known`.
- `observations.source = "agent"`.

This avoids adding a top-level `SourceKind` for every provider. If users need provider-level filters later, add provider metadata or dynamic source grouping after the first scan works.

### Parser Rules

- Read-only only. Never mutate vendor session stores.
- For SQLite stores, copy DB to a temp file before reading to avoid locks.
- For export-only platforms, support a user-configured export directory first.
- Do not ingest secrets, settings, credentials, telemetry, or memory files unless they are direct transcript evidence.
- Skip tool outputs by default unless they contain user-visible assistant evidence needed for task extraction.
- Keep existing LLM-only organize behavior.

## Task Chain

### Task 1: Add Generic Agent Source Skeleton

Acceptance:

- `SourceKind` accepts `agent`.
- `/sources`, `/sessions`, and Sources UI show `Agent`.
- `scanConfiguredSources` can include `agent` without breaking Codex/Claude.
- Tests cover empty/missing agent roots.

Verification:

- `npm test`
- `npm run build`

### Task 2: Add High-Confidence CLI File Adapters

Scope:

- Gemini CLI: `~/.gemini/tmp/*/chats/*`.
- Pi: `~/.pi/agent/sessions/**/*.jsonl`.
- Aider: project-local `.aider.chat.history.md`.

Acceptance:

- Fixtures parse user/assistant messages into normalized observations.
- Branch/tree entries in Pi do not duplicate the same message.
- Aider input history is not ingested as transcript.

Verification:

- Targeted source tests.
- Full `npm test`.

### Task 3: Add Export-Based Adapters

Scope:

- OpenCode JSON exports.
- Devin Desktop exported conversations if sample is available.

Acceptance:

- Scanner reads explicit export directory only.
- No external command is run by default.
- Invalid export files are skipped with warnings, not fatal.

Verification:

- Fixture tests for valid/invalid export JSON.

### Task 4: Add VS Code-Style Extension Scanner

Scope:

- Cursor workspaceStorage `state.vscdb`.
- Cline global storage task folders.
- Roo Code/Kilo Code after samples confirm schema.
- Kiro IDE if JSON global storage sample is available.

Acceptance:

- SQLite DBs are copied before reading.
- Known chat/composer/task keys parse to observations.
- Unknown keys are ignored.
- Tests use fixture SQLite DBs and task folders.

Verification:

- Targeted parser tests.
- Manual scan against local Cursor/Cline data with no writes.

### Task 5: Add Gateway/Autonomous Agent Stores

Scope:

- OpenClaw `~/.openclaw` gateway stores.
- Hermes `~/.hermes` sessions.

Acceptance:

- Parser uses local files only.
- Session transcripts are separated from memory/skill documents.
- Compaction summaries are ingested as `system` only when directly tied to a session transcript.

Verification:

- Local sample fixtures required before implementation.

### Checkpoint After Tasks 1-3

- Agent source appears in UI.
- Gemini CLI, Pi, Aider, and OpenCode export fixtures scan into `sessions`/`observations`.
- Browser, Codex, and Claude tests still pass.
- Organize can create cards from `agent` observations.

### Checkpoint After Tasks 4-5

- Cursor/Cline/Roo-style local stores scan without locking live IDEs.
- OpenClaw/Hermes implementations are based on real samples, not guessed schemas.
- Manual privacy review confirms no settings/API-key stores are ingested.

## Risks and Unknowns

- Cursor/Windsurf/Roo storage keys may change across releases.
- Some tools store compressed/binary blobs; do not reverse-engineer beyond stable local user data without samples.
- OpenClaw and Hermes are gateway/autonomous systems, not simple project CLIs; transcript and memory stores must stay separated.
- Provider-level filtering is useful but should wait until after `agent` source ingestion works.

## Reference Links

- Gemini CLI session management: https://developers.googleblog.com/pick-up-exactly-where-you-left-off-with-session-management-in-gemini-cli/
- Gemini CLI session location summary: https://geminicli.com/docs/cli/session-management/
- Kiro CLI session management: https://kiro.dev/docs/cli/chat/session-management/
- Kiro custom session storage: https://kiro.dev/docs/cli/reference/slash-commands/
- OpenCode CLI session/export docs: https://opencode.ai/docs/cli/
- Pi session format: https://pi.dev/docs/latest/session-format
- Pi usage sessions: https://pi.dev/docs/latest/usage
- Aider options: https://aider.chat/docs/config/options.html
- Aider chat transcript FAQ: https://aider.chat/docs/faq.html
- Cline task history docs: https://docs.cline.bot/core-workflows/task-management
- Cursor state DB forum thread: https://forum.cursor.com/t/chat-history-folder/7653
- Cursor state.vscdb path thread: https://forum.cursor.com/t/open-chat-as-editor-causes-permanent-black-screen-when-reopening-project/148515/10
- Roo Code task history issue: https://github.com/RooCodeInc/Roo-Code/issues/8448
- Windsurf Cascade storage discussion: https://www.reddit.com/r/Codeium/comments/1hbt1qp/where_are_the_cascade_chat_logs_stored/
- OpenClaw session management: https://docs.openclaw.ai/concepts/session
- OpenClaw CLI sessions: https://docs.openclaw.ai/cli/sessions
- OpenClaw memory overview: https://docs.openclaw.ai/concepts/memory
- Hermes sessions: https://hermes-agent.nousresearch.com/docs/user-guide/sessions
- Hermes memory: https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
- Devin Desktop chat export: https://docs.devin.ai/desktop/chat/overview
