# AI-Index

[English](README.md) | [中文](README.zh-CN.md)

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Node >=22.16.0](https://img.shields.io/badge/node-%3E%3D22.16.0-339933.svg)

**本地优先的 AI / Agent 会话卡片复查工作台。**

AI-Index 是一个本地优先的 AI 会话行动收件箱。它扫描 Codex、Claude Code 和浏览器会话，使用你配置的 OpenAI-compatible LLM 抽取未完成事项，并保留原始来源，方便你在处理卡片前复查上下文。

- 把分散在 AI 会话里的后续事项收进一个可复查的卡片队列。
- 在完成、忽略或恢复卡片前，先查看对应的来源片段。
- 配置和数据默认留在本机 `~/.ai-index`。

### 需要准备

- 安装器：不需要安装 Node.js
- 源码启动或未来 npm 包：Node.js `>=22.16.0`
- 一个 OpenAI-compatible Chat Completions API key

没有 LLM 配置时，AI-Index 仍然可以打开界面和扫描来源，但不能整理出待办卡片。

### 安装

从 [Releases](https://github.com/MaimoryLab/AI-Inbox/releases) 下载安装器，然后启动：

- macOS Apple Silicon：打开 `ai-index-macos-arm64.dmg`，再打开 `AI-Index.app`。
- Windows x64：运行 `ai-index-windows-x64.msi`，再从开始菜单打开 **AI-Index**。

AI-Index 会打开本地浏览器工作台。在设置页配置来源和 LLM key，然后点击 **Organize / 整理**。

npm 包尚未发布；当前请使用安装器或源码启动。

![AI-Index 卡片视图](docs/assets/readme/ai-index-cards.png)

### 源码启动

从全新 clone 开始：

```bash
git clone https://github.com/MaimoryLab/AI-Inbox.git AI-Index
cd AI-Index
./scripts/start-local.sh
```

打开后访问 [http://127.0.0.1:3111/](http://127.0.0.1:3111/)。

这个脚本会运行 `npm install`、`npm run build` 和 `npm start`。如果依赖已经安装并构建完成，可以直接运行 `npm start`。

`start` 会在启动时自动发现 Codex 和 Claude Code 的默认路径，并写入缺失的来源配置；它不会覆盖你已经配置过的路径。默认端口固定为 `3111`，如果端口被占用，请显式指定：

```bash
npm start -- --port 3112
```

前端适合日常使用：

1. 在 `设置` 中选择中文或 English，检查 Codex/Claude Code 路径发现结果，填写 API key，按需调整回看天数和最大会话数，然后保存。
2. 在 `来源` 中查看已扫描的会话和原始证据。
3. 在 `待办` 中点击整理，审查生成的卡片，确认来源后标记完成或忽略。

### 界面

以下截图全部使用合成会话文本、合成路径和空 API key 字段。

![来源视图，展示关联证据](docs/assets/readme/ai-index-sources.png)

![设置视图，使用合成路径且没有密钥](docs/assets/readme/ai-index-settings.png)

### 浏览器插件

AI-Index 内置一个未打包的 Chrome 插件，用来采集 ChatGPT、Claude、Gemini、Perplexity、Grok 和 DeepSeek 浏览器会话：

1. 启动前端工作台，并保持它运行在 `http://127.0.0.1:3111/`。
2. 打开 Chrome `chrome://extensions`，启用开发者模式，点击 `Load unpacked`，选择本仓库的 `browser-extension` 目录。
3. 打开一个受支持的 AI 对话页面。
4. 点击 AI-Index 插件，再点击 `Sync Current Tab`。
5. 回到 AI-Index，在 `来源` 中确认浏览器会话出现后，再执行整理。

插件默认连接 `http://127.0.0.1:3111`。如果你用其他端口启动 AI-Index，请在插件的 `Options` 中修改 API base URL。

### 命令行用法

如果你更喜欢终端，可以只用 CLI：

```bash
npm install
npm run build
AI_INDEX_HOME=.local/ai-index node dist/cli.js init --api-key <your-key>
AI_INDEX_HOME=.local/ai-index node dist/cli.js doctor
AI_INDEX_HOME=.local/ai-index node dist/cli.js scan codex
AI_INDEX_HOME=.local/ai-index node dist/cli.js scan claude-code
AI_INDEX_HOME=.local/ai-index node dist/cli.js organize
AI_INDEX_HOME=.local/ai-index node dist/cli.js list
```

| Command | 用途 |
| --- | --- |
| `init --api-key <key>` | 创建本地配置并保存 LLM key |
| `doctor` | 检查配置、数据目录和数据库 |
| `start [--port <n>]` / `open [--port <n>]` | 启动前端工作台 |
| `scan <codex\|claude-code> [path]` | 扫描指定来源 |
| `extract` / `organize` | 调用 LLM 抽取待办卡片 |
| `list` / `ls` | 列出当前待办 |
| `done <id>` / `complete <id>` | 标记卡片完成 |
| `ignore <id>` / `dismiss <id>` | 忽略卡片 |
| `mcp` | 启动 MCP stdio server |

### 配置

默认配置目录是 `~/.ai-index`。设置 `AI_INDEX_HOME` 可以改到项目内或其他位置，例如：

```bash
AI_INDEX_HOME=.local/ai-index npm start
```

Windows PowerShell：

```powershell
$env:AI_INDEX_HOME = ".local\ai-index"
ai-index start
```

前端 `设置` 和 CLI 都读写同一个 `.env` 配置。常见字段：

```bash
AI_INDEX_CODEX_HOME=~/.codex
AI_INDEX_CLAUDE_HOME=~/.claude/projects
AI_INDEX_LLM_ENDPOINT=https://api.novita.ai/openai/v1
AI_INDEX_LLM_MODEL=deepseek/deepseek-v4-flash
AI_INDEX_LLM_API_KEY=<your-key>
AI_INDEX_ORGANIZE_SINCE_DAYS=7
AI_INDEX_ORGANIZE_MAX_SESSIONS=16
```

如果需要文件配置模板，只把 `.env.example` 复制到本地配置目录，不要复制到仓库根目录。

语言偏好只保存在浏览器本地，不写入 `.env`。

### 来源和隐私

- Codex：默认扫描 `~/.codex` 下的 `sessions` 和 `archived_sessions`。
- Claude Code：默认扫描 `~/.claude/projects`。
- Browser：前端服务运行时，Chrome 插件会把采集到的浏览器会话发送到 `POST /api/browser-sessions`。

AI-Index 的数据库、配置和来源记录默认保存在本机。执行 `organize` 时，相关会话片段会发送到你配置的 LLM endpoint。扫描只导入会话文本和可读附件引用，不复制附件文件。不要提交 `.env`、`data/`、`.local/` 或真实会话记录。

### 开源贡献

欢迎提交 issue 和 pull request。请确保报告和测试样例已经脱敏：不要包含 API key、token、重要私人路径或真实会话记录。提交 PR 前请运行：

```bash
npm test
npm run build
git diff --check
```

### 许可证

Apache-2.0。见 [LICENSE](LICENSE)。
