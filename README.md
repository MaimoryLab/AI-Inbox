# AI-Todo

AI-Todo is a local-first action inbox for AI agent sessions. It scans Codex,
Claude Code, and browser-captured sessions, asks an LLM to organize unfinished
work into todo cards, and keeps evidence close enough for users to trust each
item.

## Quick Start

```bash
npm install
npm run build
AI_TODO_HOME=.local/ai-todo node dist/cli.js init --api-key <your-key>
AI_TODO_HOME=.local/ai-todo node dist/cli.js doctor
AI_TODO_HOME=.local/ai-todo node dist/cli.js open
```

`ai-todo open` listens on [http://127.0.0.1:3111/](http://127.0.0.1:3111/) by
default. Use `ai-todo open --port <port>` to override it, or `--port 0` when a
test needs an ephemeral port. If `3111` is already occupied, AI-Todo reports the
conflict instead of silently switching ports.

## Commands

| Command | Description |
| --- | --- |
| `ai-todo init` | Create the local `.env` config and database directory. |
| `ai-todo doctor` | Show config paths and LLM setup without printing secrets. |
| `ai-todo scan <codex\|claude-code> [path]` | Import sessions from a configured or explicit source path. |
| `ai-todo organize` | Run LLM-only todo extraction over recent observations. |
| `ai-todo list` | Print current todo cards. |
| `ai-todo done <id>` / `ai-todo ignore <id>` | Mark a todo complete or ignored. |
| `ai-todo open [--port <n>]` | Start the local HTTP UI. |
| `ai-todo mcp` | Run the stdio MCP server. |

## LLM Setup

AI-Todo currently requires an OpenAI-compatible LLM endpoint for todo card
generation. It does not fall back to rule-based card creation.

Relevant config keys live in `$AI_TODO_HOME/.env`:

```bash
AI_TODO_LLM_ENABLED=true
AI_TODO_LLM_PROVIDER=openai
AI_TODO_LLM_MODEL=deepseek/deepseek-v4-flash
AI_TODO_LLM_ENDPOINT=https://api.novita.ai/openai/v1
AI_TODO_LLM_API_KEY=...
```

Todo extraction calls the configured OpenAI-compatible `/chat/completions`
endpoint directly from TypeScript. `ai-todo doctor` reports whether the key,
model, and endpoint are configured.

## Sources

- Codex sessions default to `~/.codex`.
- Claude Code sessions default to `~/.claude/projects`.
- Browser sessions can be posted to the local HTTP API by the browser capture
  flow.

The UI keeps raw evidence in its original language. Product chrome and controls
are English-only.

## Privacy

AI-Todo stores data locally under `$AI_TODO_HOME` (or `~/.ai-todo` by default).
Do not commit real `.env` files, API keys, local data, `dist/`, `node_modules/`,
or private planning docs such as `docs/hybrid-rebuild/` and `docs/rebuild/`.

## Development

```bash
npm test
npm run build
git diff --check
```

The package bin is `ai-todo` and points at `dist/cli.js`; run `npm run build`
before testing installed CLI behavior.
