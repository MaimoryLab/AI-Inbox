# AI-Inbox

[English](README.md) | [中文](README.zh-CN.md)

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Node >=22.16.0](https://img.shields.io/badge/node-%3E%3D22.16.0-339933.svg)

**Local-first review workspace for follow-up cards extracted from AI and agent sessions.**

AI-Inbox scans Codex and Claude Code session records, asks your configured OpenAI-compatible LLM to extract Inbox cards, and keeps every card linked to its source evidence.

- Turn scattered AI-session loose ends into one reviewable card queue.
- Review source snippets before you complete, ignore, or restore a card.
- Keep config and data local by default under `~/.ai-inbox`.

Download the installer from [Releases](https://github.com/MaimoryLab/AI-Inbox/releases), then start it:

- macOS Apple Silicon: open `ai-inbox-macos-arm64.dmg`, then open `AI-Inbox.app`.
- Windows x64: run `ai-inbox-windows-x64.msi`, then open **AI-Inbox** from the Start menu.

AI-Inbox opens a local browser workspace. Configure sources and your LLM key in Settings, then click **Organize**.

![AI-Inbox Cards view](docs/assets/readme/ai-inbox-cards.png)

## Why AI-Inbox

AI assistants are good at producing progress, but follow-up work often gets buried inside long chats and agent logs. AI-Inbox gives those loose ends a review layer: it extracts concise Inbox cards, keeps the original evidence beside them, and lets you decide what is actually worth doing.

It is not a project management system. It is a local-first triage workspace for the work your AI tools already discussed.

## What It Captures

| Source | Default location | What AI-Inbox imports |
| --- | --- | --- |
| Codex | `~/.codex` | Sessions and archived sessions |
| Claude Code | `~/.claude/projects` | Project conversation records |
| Browser | Planned | Browser plugin support and browser session extraction are not implemented yet. We plan to add them as soon as possible. |

Scanning imports session text and readable attachment references. It does not copy attachment files.

## Quick Start

- macOS Apple Silicon: open `ai-inbox-macos-arm64.dmg`, then open `AI-Inbox.app`.
- Windows x64: run `ai-inbox-windows-x64.msi`, then open **AI-Inbox** from the Start menu.

The npm package is not published yet; use the installer or source checkout today.

Then:

1. Open the printed `127.0.0.1` URL.
2. In **Settings**, confirm source paths and save your OpenAI-compatible API key.
3. In **Sources**, review the imported sessions.
4. In **Cards**, click **Organize** and review the generated Inbox cards.

Without LLM configuration, AI-Inbox can still open the UI and scan sources. It will not create Inbox cards until an LLM endpoint and key are configured.

## Screenshots

Screenshots below use synthetic session text, synthetic paths, and an empty API key field.

### Cards

![Cards view with synthetic Inbox cards](docs/assets/readme/ai-inbox-cards.png)

### Sources

![Sources view showing linked source evidence](docs/assets/readme/ai-inbox-sources.png)

### Settings

![Settings view with synthetic source paths and no secrets](docs/assets/readme/ai-inbox-settings.png)

## Install

### Requirements

- Installer: no Node.js install required
- Source checkout or future npm package: Node.js `>=22.16.0`
- An OpenAI-compatible Chat Completions API key for card extraction

### Installer

Download the installer for your platform from [Releases](https://github.com/MaimoryLab/AI-Inbox/releases):

- macOS Apple Silicon: `ai-inbox-macos-arm64.dmg`
- Windows x64: `ai-inbox-windows-x64.msi`

Config and data still live in `~/.ai-inbox`; they are not stored inside the app or installer directory. Current release installers are unsigned, so macOS Gatekeeper or Windows Defender may ask for confirmation before first run.

### npm

The npm package is not published yet. Once it is available in the public registry, this will be the shortest install path:

```bash
npm install -g @maimorylab/ai-inbox
ai-inbox start
npx @maimorylab/ai-inbox start
```

### Source Checkout

```bash
git clone https://github.com/MaimoryLab/AI-Inbox.git
cd AI-Inbox
npm install
npm run build
npm start
```

On macOS or Linux, the helper script runs the same local startup path:

```bash
./scripts/start-local.sh
```

`ai-inbox start` and `npm start` default to `127.0.0.1:3111`. If that port is occupied, choose one explicitly:

```bash
ai-inbox start --port 3112
npm start -- --port 3112
```

## Daily Workflow

1. Start the workspace with `ai-inbox start`.
2. Check **Settings** when source paths, look-back days, max sessions, or LLM config need adjustment.
3. Use **Sources** to confirm what was scanned and inspect raw context.
4. Use **Cards** to organize recent sessions, inspect evidence, complete cards, ignore noise, or restore a card later.
5. Keep your local `.env`, database, and real session records out of commits.

## CLI

```bash
ai-inbox init --api-key <your-key>
ai-inbox doctor
ai-inbox scan codex
ai-inbox scan claude-code
ai-inbox organize
ai-inbox list
```

| Command | Purpose |
| --- | --- |
| `init [options]` | Create local config and optionally save the LLM key |
| `doctor` | Check config, data directory, database, and LLM setup |
| `scan <codex\|claude-code> [path]` | Scan a source path |
| `extract` / `organize` | Ask the configured LLM to extract Inbox cards |
| `regenerate --yes` | Clear cards and regenerate from all observations |
| `list` / `ls` | Print current cards |
| `done <card-id>` / `complete <card-id>` | Mark a card complete |
| `ignore <card-id>` / `dismiss <card-id>` | Ignore a card |
| `restore <card-id>` / `reopen <card-id>` | Restore a card to open |
| `start [--port <n>]` | Start the local web workspace |
| `mcp` | Start the MCP stdio server |

For isolated testing:

```bash
AI_INBOX_HOME=.local/ai-inbox node dist/cli.js init
AI_INBOX_HOME=.local/ai-inbox node dist/cli.js doctor
```

## Configuration

The default config directory is `~/.ai-inbox`.

```text
~/.ai-inbox/
  .env
  data/
    ai-inbox.sqlite
```

Set `AI_INBOX_HOME` to use another location:

```bash
AI_INBOX_HOME=.local/ai-inbox ai-inbox start
```

Windows PowerShell:

```powershell
$env:AI_INBOX_HOME = ".local\ai-inbox"
ai-inbox start
```

The web Settings page and CLI read and write the same `.env` config. Common fields:

```bash
AI_INBOX_CODEX_HOME=~/.codex
AI_INBOX_CLAUDE_HOME=~/.claude/projects
AI_INBOX_LLM_ENABLED=true
AI_INBOX_LLM_PROVIDER=openai
AI_INBOX_LLM_MODEL=deepseek/deepseek-v4-flash
AI_INBOX_LLM_ENDPOINT=https://api.novita.ai/openai/v1
AI_INBOX_LLM_API_KEY=<your-key>
AI_INBOX_ORGANIZE_SINCE_DAYS=7
AI_INBOX_ORGANIZE_MAX_SESSIONS=16
```

Copy `.env.example` only into your local config directory when you want a file-based starting point. Do not place real keys in the repository root.

The UI language preference is saved in the current browser, not in `.env`.

## Privacy

- AI-Inbox is local-first: config, database, and scanned records stay under `~/.ai-inbox` unless you override `AI_INBOX_HOME`.
- Session text remains local during scanning and review.
- Browser plugin support is not implemented yet, so AI-Inbox does not collect browser sessions by itself today.
- During `organize`, relevant snippets are sent to your configured LLM endpoint for extraction.
- API keys are stored in local config only and must never be committed.
- README screenshots and fixtures should use synthetic or heavily anonymized content only.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `3111 is already in use` | Run `ai-inbox start --port 3112` or choose another explicit port. |
| No cards are created | Run `ai-inbox doctor`, confirm the API key and endpoint, then run `ai-inbox organize` again. |
| Sources look empty | Check `AI_INBOX_CODEX_HOME`, `AI_INBOX_CLAUDE_HOME`, or run `ai-inbox scan <source> [path]`. |
| Cannot find `~/.ai-inbox` in Finder | Dot folders are hidden on macOS. Use Finder **Go to Folder** and enter `~/.ai-inbox`. |
| npm cannot find the package | Use the source checkout or installer until the package is published to the public registry. |
| Release binary is blocked | Approve the unsigned binary in your OS security prompt, or run from source with Node.js. |

## Contributing

Issues and pull requests are welcome. Keep reports, fixtures, screenshots, and docs public-safe: no API keys, tokens, private paths, personal names, or real session transcripts.

Before opening a PR:

```bash
npm test
npm run build
git diff --check
```

## License

Apache-2.0. See [LICENSE](LICENSE).
