# AI-Todo

[English](#english) | [中文](#中文)

## English

AI-Todo is a local-first action inbox for AI sessions. It scans Codex, Claude Code, and browser sessions, uses your configured OpenAI-compatible LLM to extract unfinished work, and keeps source evidence available for review.

### Requirements

- Node.js 24 or newer
- An OpenAI-compatible Chat Completions API key

Without LLM configuration, AI-Todo can still open the UI and scan sources, but it cannot organize sessions into todo cards.

### Recommended: Web Workspace

```bash
npm install
npm run build
AI_TODO_HOME=.local/ai-todo node dist/cli.js open
```

Then open [http://127.0.0.1:3111/](http://127.0.0.1:3111/).

`open` automatically discovers default Codex and Claude Code paths at startup and writes missing source settings. It does not overwrite paths you already configured. The default port is fixed at `3111`; if it is occupied, choose one explicitly:

```bash
AI_TODO_HOME=.local/ai-todo node dist/cli.js open --port 3112
```

Use the web workspace for daily work:

1. In `Settings`, choose Chinese or English, check Codex/Claude Code path discovery, enter your API key, adjust look-back days and max sessions if needed, then save.
2. In `Sources`, review scanned sessions and source evidence.
3. In `To-Do`, click organize, review the generated cards, then mark them done or ignored.

### CLI Usage

If you prefer the terminal, you can use only the CLI:

```bash
npm install
npm run build
AI_TODO_HOME=.local/ai-todo node dist/cli.js init --api-key <your-key>
AI_TODO_HOME=.local/ai-todo node dist/cli.js doctor
AI_TODO_HOME=.local/ai-todo node dist/cli.js scan codex
AI_TODO_HOME=.local/ai-todo node dist/cli.js scan claude-code
AI_TODO_HOME=.local/ai-todo node dist/cli.js organize
AI_TODO_HOME=.local/ai-todo node dist/cli.js list
```

| Command | Purpose |
| --- | --- |
| `init --api-key <key>` | Create local config and save the LLM key |
| `doctor` | Check config, data directory, and database |
| `open [--port <n>]` | Start the web workspace |
| `scan <codex\|claude-code> [path]` | Scan a source |
| `organize` | Ask the LLM to extract todo cards |
| `list` | Print current todos |
| `done <id>` / `ignore <id>` | Update card status |
| `mcp` | Start the MCP stdio server |

### Configuration

The default config directory is `~/.ai-todo`. Set `AI_TODO_HOME` to use another location:

```bash
AI_TODO_HOME=.local/ai-todo node dist/cli.js open
```

The web `Settings` page and CLI read and write the same `.env` config. Common fields:

```bash
AI_TODO_CODEX_HOME=~/.codex
AI_TODO_CLAUDE_HOME=~/.claude/projects
AI_TODO_LLM_ENDPOINT=https://api.openai.com/v1/chat/completions
AI_TODO_LLM_MODEL=gpt-5-mini
AI_TODO_LLM_API_KEY=<your-key>
AI_TODO_ORGANIZE_SINCE_DAYS=14
AI_TODO_ORGANIZE_MAX_SESSIONS=40
```

The UI language preference is saved in browser local storage, not in `.env`.

### Sources and Privacy

- Codex: scans `sessions` and `archived_sessions` under `~/.codex` by default.
- Claude Code: scans `~/.claude/projects` by default.
- Browser: while the web server is running, browser sessions can be posted to `POST /browser/sessions`.

AI-Todo stores its database, config, and source records locally by default. During `organize`, relevant session snippets are sent to your configured LLM endpoint. Scanning imports session text and readable attachment references; it does not copy attachment files. Do not commit `.env`, `data/`, `.local/`, or real session records.

### Contributing

Issues and pull requests are welcome. Please keep reports and fixtures sanitized: no API keys, tokens, sensitive local paths, or real session transcripts. Before opening a PR, run:

```bash
npm test
npm run build
git diff --check
```

### License

Apache-2.0. See [LICENSE](LICENSE).

## 中文

AI-Todo 是一个本地优先的 AI 会话行动收件箱。它扫描 Codex、Claude Code 和浏览器会话，使用你配置的 OpenAI-compatible LLM 抽取未完成事项，并保留原始来源，方便你在处理卡片前复查上下文。

### 需要准备

- Node.js 24 或更高版本
- 一个 OpenAI-compatible Chat Completions API key

没有 LLM 配置时，AI-Todo 仍然可以打开界面和扫描来源，但不能整理出待办卡片。

### 推荐用法：前端工作台

```bash
npm install
npm run build
AI_TODO_HOME=.local/ai-todo node dist/cli.js open
```

打开后访问 [http://127.0.0.1:3111/](http://127.0.0.1:3111/)。

`open` 会在启动时自动发现 Codex 和 Claude Code 的默认路径，并写入缺失的来源配置；它不会覆盖你已经配置过的路径。默认端口固定为 `3111`，如果端口被占用，请显式指定：

```bash
AI_TODO_HOME=.local/ai-todo node dist/cli.js open --port 3112
```

前端适合日常使用：

1. 在 `设置` 中选择中文或 English，检查 Codex/Claude Code 路径发现结果，填写 API key，按需调整回看天数和最大会话数，然后保存。
2. 在 `来源` 中查看已扫描的会话和原始证据。
3. 在 `待办` 中点击整理，审查生成的卡片，确认来源后标记完成或忽略。

### 命令行用法

如果你更喜欢终端，可以只用 CLI：

```bash
npm install
npm run build
AI_TODO_HOME=.local/ai-todo node dist/cli.js init --api-key <your-key>
AI_TODO_HOME=.local/ai-todo node dist/cli.js doctor
AI_TODO_HOME=.local/ai-todo node dist/cli.js scan codex
AI_TODO_HOME=.local/ai-todo node dist/cli.js scan claude-code
AI_TODO_HOME=.local/ai-todo node dist/cli.js organize
AI_TODO_HOME=.local/ai-todo node dist/cli.js list
```

| Command | 用途 |
| --- | --- |
| `init --api-key <key>` | 创建本地配置并保存 LLM key |
| `doctor` | 检查配置、数据目录和数据库 |
| `open [--port <n>]` | 启动前端工作台 |
| `scan <codex\|claude-code> [path]` | 扫描指定来源 |
| `organize` | 调用 LLM 抽取待办卡片 |
| `list` | 列出当前待办 |
| `done <id>` / `ignore <id>` | 更新卡片状态 |
| `mcp` | 启动 MCP stdio server |

### 配置

默认配置目录是 `~/.ai-todo`。设置 `AI_TODO_HOME` 可以改到项目内或其他位置，例如：

```bash
AI_TODO_HOME=.local/ai-todo node dist/cli.js open
```

前端 `设置` 和 CLI 都读写同一个 `.env` 配置。常见字段：

```bash
AI_TODO_CODEX_HOME=~/.codex
AI_TODO_CLAUDE_HOME=~/.claude/projects
AI_TODO_LLM_ENDPOINT=https://api.openai.com/v1/chat/completions
AI_TODO_LLM_MODEL=gpt-5-mini
AI_TODO_LLM_API_KEY=<your-key>
AI_TODO_ORGANIZE_SINCE_DAYS=14
AI_TODO_ORGANIZE_MAX_SESSIONS=40
```

语言偏好只保存在浏览器本地，不写入 `.env`。

### 来源和隐私

- Codex：默认扫描 `~/.codex` 下的 `sessions` 和 `archived_sessions`。
- Claude Code：默认扫描 `~/.claude/projects`。
- Browser：前端服务运行时，可以向 `POST /browser/sessions` 写入浏览器会话。

AI-Todo 的数据库、配置和来源记录默认保存在本机。执行 `organize` 时，相关会话片段会发送到你配置的 LLM endpoint。扫描只导入会话文本和可读附件引用，不复制附件文件。不要提交 `.env`、`data/`、`.local/` 或真实会话记录。

### 开源贡献

欢迎提交 issue 和 pull request。请确保报告和测试样例已经脱敏：不要包含 API key、token、重要私人路径或真实会话记录。提交 PR 前请运行：

```bash
npm test
npm run build
git diff --check
```

### 许可证

Apache-2.0。见 [LICENSE](LICENSE)。
