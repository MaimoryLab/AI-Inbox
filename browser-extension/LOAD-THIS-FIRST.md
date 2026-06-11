# Agent Memory Lab 插件本地试用入口

如果你是从 `agent-memory-lab-extension.zip` 解压出来的，请按这份清单试用。目标很简单：确认插件能加载、能识别真实 AI 会话、能把会话同步到本地工作台的 Sessions。

## 1. 加载插件

1. 打开 Chrome / Edge。
2. 进入 `chrome://extensions`。
3. 打开“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择这个解压出来的 `browser-extension/` 文件夹。

## 2. 启动本地工作台

插件默认连接：

```text
API: http://localhost:3111
Viewer: http://localhost:3114
```

如果插件显示“未连接本地工作台”，请在项目目录启动：

```bash
npm run build && npm run start:local-memory
```

## 3. 五步验收

1. 打开一个真实 AI 会话页面，例如 ChatGPT、Claude、Gemini、Perplexity、Grok 或 DeepSeek。
2. 点击浏览器工具栏里的 Agent Memory Lab 图标。
3. 确认弹窗显示“已抓取 N 条”或“等待会话”。
4. 点击“同步已打开的 AI 会话”。
5. 回到本地工作台 `#sessions`，确认会话出现在列表里。

## 4. 侧栏查看

打开同步侧栏后，重点看三项：

- 当前页面是否识别为 AI 对话。
- 已抓取多少条会话。
- 最近同步里是否出现当前会话。

页面识别不准时，再展开“页面识别”，点击“复制问题信息”。诊断信息只包含选择器和计数，不应包含真实会话正文。

## 5. 真实 AI 页面证据

如果你在真实站点试用，请参考本目录的 `AI-SITE-TEST-CARDS.md`。每个站点至少确认：

- Provider 识别正确。
- `turnCount > 0`。
- 工作台 `#sessions` 能看到同步后的会话。
- 原站输入、发送、滚动和附件按钮没有异常。
- 复制诊断不泄露会话正文。

## 6. 反馈问题

反馈时优先附上：

- 浏览器名称和版本。
- AI 产品名称。
- 同步侧栏复制的问题信息。
- 工作台 `#sessions` 是否出现会话。
- 脱敏截图或录屏。
