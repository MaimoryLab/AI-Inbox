# Agent Memory Lab 插件本地加载说明

如果你是从 `agent-memory-lab-extension.zip` 解压出来的，请先按这几步试用。

## 1. 加载插件

1. 打开 Chrome / Edge。
2. 进入 `chrome://extensions`。
3. 打开“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择这个解压出来的 `browser-extension/` 文件夹。

## 2. 检查本地工作台

插件默认连接：

```text
API: http://localhost:3111
Viewer: http://localhost:3113
```

如果插件弹窗显示“未连接本地工作台”，请在项目根目录运行：

```bash
npm run build && npm run start
```

## 3. 快速预览

在项目根目录运行：

```bash
npm run preview:browser-extension
```

打开页面后，插件会在输入框附近显示“记忆建议”。

## 4. 试用重点

- 弹窗和同步侧栏都会显示保存前审阅草稿。
- 保存前可以编辑标题和正文。
- 保存后内容先进入 Viewer 待审阅队列，不会直接写长期记忆。
- ChatGPT、Claude、Gemini、Perplexity 真实网页还需要逐站验收。

## 5. 查看当前交付状态

在项目根目录运行：

```bash
npm run status:delivery
```

它会告诉你当前 zip、demo、核心体验和真实 AI 站点证据的状态。

## 6. 反馈问题

如果要反馈问题，请使用项目里的模板：

```text
docs/external-feedback-template-cn.md
```

优先附上同步侧栏“复制诊断”的 JSON，并确认截图或录屏不包含敏感信息。
