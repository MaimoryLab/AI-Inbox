# AI-Inbox

[English](README.md) | [中文](README.zh-CN.md)

AI-Inbox is a local-first action inbox for AI sessions. It scans Codex, Claude Code, and browser sessions, uses your configured OpenAI-compatible LLM to extract unfinished work, and keeps source evidence available for review.

### Requirements

- Node.js 22.16 or newer
- An OpenAI-compatible Chat Completions API key

Without LLM configuration, AI-Inbox can still open the UI and scan sources, but it cannot organize sessions into inbox cards.

### Install

For npm global or one-time startup:

```bash
npm install -g @maimorylab/ai-inbox
ai-inbox open
npx @maimorylab/ai-inbox open
```

For non-development users, download the release zip for your platform, unzip it, and run the binary from that folder:

```bash
# macOS / Linux
./ai-inbox open

# Windows PowerShell
.\ai-inbox.exe open
```

The app stores config and data in `~/.ai-inbox` by default, not in the release folder. Current release binaries are unsigned, so macOS Gatekeeper or Windows Defender may ask for confirmation before the first run.

### Recommended: Web Workspace

From a fresh clone on macOS or Linux:

```bash
git clone https://github.com/MaimoryLab/AI-Inbox.git
cd AI-Inbox
./scripts/start-local.sh
```

On Windows PowerShell:

```powershell
git clone https://github.com/MaimoryLab/AI-Inbox.git
cd AI-Inbox
npm install
npm run build
npm start
```

Then open [http://127.0.0.1:3111/](http://127.0.0.1:3111/).

The shell script runs `npm install`, `npm run build`, and `npm start`. If dependencies are already installed and built, use `npm start`.

`start` automatically discovers default Codex and Claude Code paths at startup and writes missing source settings. It does not overwrite paths you already configured. The default port is fixed at `3111`; if it is occupied, choose one explicitly:

```bash
npm start -- --port 3112
```

Use the web workspace for daily work:

1. In `Settings`, choose Chinese or English, check Codex/Claude Code path discovery, enter your API key, adjust look-back days and max sessions if needed, then save.
2. In `Sources`, review scanned sessions and source evidence.
3. In `Cards`, click organize, review the generated Inbox cards, then mark them done or ignored.

### CLI Usage

If you prefer the terminal, you can use only the CLI:

```bash
npm install
npm run build
AI_INBOX_HOME=.local/ai-inbox node dist/cli.js init --api-key <your-key>
AI_INBOX_HOME=.local/ai-inbox node dist/cli.js doctor
AI_INBOX_HOME=.local/ai-inbox node dist/cli.js scan codex
AI_INBOX_HOME=.local/ai-inbox node dist/cli.js scan claude-code
AI_INBOX_HOME=.local/ai-inbox node dist/cli.js organize
AI_INBOX_HOME=.local/ai-inbox node dist/cli.js list
```

| Command | Purpose |
| --- | --- |
| `init --api-key <key>` | Create local config and save the LLM key |
| `doctor` | Check config, data directory, and database |
| `start [--port <n>]` / `open [--port <n>]` | Start the web workspace |
| `scan <codex\|claude-code> [path]` | Scan a source |
| `extract` / `organize` | Ask the LLM to extract inbox cards |
| `list` / `ls` | Print current cards |
| `done <id>` / `complete <id>` | Mark a card complete |
| `ignore <id>` / `dismiss <id>` | Ignore a card |
| `mcp` | Start the MCP stdio server |

### Configuration

The default config directory is `~/.ai-inbox`. Set `AI_INBOX_HOME` to use another location:

```bash
AI_INBOX_HOME=.local/ai-inbox npm start
```

On Windows PowerShell, set it before starting the app:

```powershell
$env:AI_INBOX_HOME = ".local\ai-inbox"
npm start
```

The web `Settings` page and CLI read and write the same `.env` config. Common fields:

```bash
AI_INBOX_CODEX_HOME=~/.codex
AI_INBOX_CLAUDE_HOME=~/.claude/projects
AI_INBOX_LLM_ENDPOINT=https://api.novita.ai/openai/v1
AI_INBOX_LLM_MODEL=deepseek/deepseek-v4-flash
AI_INBOX_LLM_API_KEY=<your-key>
AI_INBOX_ORGANIZE_SINCE_DAYS=7
AI_INBOX_ORGANIZE_MAX_SESSIONS=16
```

Copy `.env.example` only into your local config directory, not the repo root, when you want a starting point for file-based config.

The UI language preference is saved in browser local storage, not in `.env`.

### Sources and Privacy

- Codex: scans `sessions` and `archived_sessions` under `~/.codex` by default.
- Claude Code: scans `~/.claude/projects` by default.
- Browser: while the web server is running, browser sessions can be posted to `POST /browser/sessions`.

AI-Inbox stores its database, config, and source records locally by default. During `organize`, relevant session snippets are sent to your configured LLM endpoint. Scanning imports session text and readable attachment references; it does not copy attachment files. Do not commit `.env`, `data/`, `.local/`, or real session records.

### Contributing

Issues and pull requests are welcome. Please keep reports and fixtures sanitized: no API keys, tokens, sensitive local paths, or real session transcripts. Before opening a PR, run:

```bash
npm test
npm run build
git diff --check
```

### License

Apache-2.0. See [LICENSE](LICENSE).
