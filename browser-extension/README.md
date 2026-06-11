# Agent Memory Lab 浏览器插件

这是 Agent Memory Lab 的浏览器会话同步入口。它只做一件事：在 ChatGPT、Claude、Gemini、Perplexity、Grok、DeepSeek 等网页 AI 产品里抓取可见会话，并同步到本地工作台的 Sessions。

插件不会在浏览器里提取记忆、生成候选、总结页面、保存选中文本或判断 Skill。记忆和 Skill 的整理沉淀都放回本地工作台完成。

```text
网页 AI 会话
      |
      v
浏览器插件：识别 AI 页面并同步原始对话
      |
      v
本地工作台：统一展示 Sessions
      |
      v
工作台整理：后续再判断记忆、任务或 Skill
```

## 当前支持

- 自动识别主流 AI 会话网页。
- 自动扫描已打开的 AI 会话标签页。
- 抓取网页里可见的用户 / AI 对话内容。
- 同步到本地 Agent Memory Lab 工作台。
- 弹窗和侧栏用中文显示连接状态、识别状态、抓取条数和最近同步。
- 页面诊断只复制选择器、计数、浏览器版本等排错信息，不复制真实会话正文。
- 右键菜单只保留“同步到工作台”和“打开工作台”。

## 使用体验

| 入口 | 用途 |
| --- | --- |
| 弹窗 | 看当前页是否识别、抓到几条会话、手动同步所有已打开 AI 会话 |
| 同步侧栏 | 看更完整的同步状态、最近抓到的对话、页面识别诊断 |
| 工作台 | 查看所有同步进来的 Sessions，并在工作台里继续整理记忆或 Skill |

日常使用时，插件应该像一个轻量状态面板，而不是一个小型记忆编辑器。

## 本地使用

1. 进入项目目录并启动工作台：`npm run build && npm run start:local-memory`
2. 打开 Chrome / Edge 的扩展管理页。
3. 打开“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本目录：`browser-extension`
6. 打开真实 AI 会话页面。
7. 点击插件图标，确认“已抓取 N 条”。
8. 回到工作台 `#sessions` 查看同步进来的会话。

默认连接：

```text
API: http://localhost:3111
Viewer: http://localhost:3114
```

如果默认端口不可用，先确认是否已有 Agent Memory Lab 在运行；不要用上游官方包启动我们的本地版本。

## 数据结构

插件同步的数据是最小会话包：

```js
{
  schemaVersion: 1,
  capturedAt: "2026-06-11T00:00:00.000Z",
  source: "browser-extension",
  page: {
    type: "ai-chat",
    typeLabel: "AI 对话",
    title: "页面标题",
    url: "https://chatgpt.com/c/...",
    host: "chatgpt.com",
    origin: "https://chatgpt.com"
  },
  conversation: {
    provider: "ChatGPT",
    turns: [
      { role: "user", text: "用户发言" },
      { role: "assistant", text: "AI 回复" }
    ]
  },
  diagnostics: {
    supportedAiPage: true,
    provider: "ChatGPT",
    editorFound: true,
    sendFound: true,
    turnCount: 2
  }
}
```

不会包含：

- 页面正文摘要
- 选中文本
- 输入框草稿
- 页面标题结构
- 记忆候选
- Skill 候选
- 插件侧的长期记忆判断

## 检查命令

```bash
npm run check:browser-extension
npm run build
```

`check:browser-extension` 会确认插件仍然只同步会话：没有候选 UI、没有插件内保存记忆消息、没有记忆建议浮窗、没有页面内容抽取字段。

## 真实站点验收

真实发布前需要在这些站点确认：

- ChatGPT
- Claude
- Gemini
- Perplexity
- Grok
- DeepSeek

每个站点至少确认：

- Provider 识别正确。
- 页面有真实会话时 `turnCount > 0`。
- 弹窗或侧栏显示已抓取条数。
- 工作台 `#sessions` 里出现对应会话。
- 原站输入、发送、滚动和附件按钮没有异常。
- 复制诊断时不包含真实会话正文。

## 边界

插件不是 Web Clipper，也不是记忆编辑器。它只负责把网页 AI 对话送回本地工作台。任何“是否值得长期记住”“是否沉淀为 Skill”“是否生成待办”的判断，都应该在工作台里发生。
