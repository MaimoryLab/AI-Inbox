# Agent Memory Lab 插件本地试用入口

如果你是从 `agent-memory-lab-extension.zip` 解压出来的，请先按这份清单试用。目标不是一次看完所有功能，而是确认插件能被加载、能看到记忆建议、能把候选内容送进本地审阅队列，并且反馈信息足够复现。

如果你要把试用结果反馈给维护者，请按项目里的 `docs/external-test-loop-cn.md` 收集：本地 demo 结果、真实 AI 页面诊断、问题描述和脱敏截图/录屏。

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
- 保存前可以编辑标题、正文、项目、标签，并标记是否可沉淀为经验候选。
- 保存后内容先进入 Viewer 待审阅队列，不会直接写长期记忆。
- 回到 Viewer 的记忆库，确认待审阅卡片能看到项目、标签、来源和经验候选状态。
- ChatGPT、Claude、Gemini、Perplexity 真实网页还需要逐站验收。

## 5. 五步验收

1. 打开 `http://localhost:3113/demo/browser-extension.html`。
2. 在输入框输入一个和本地记忆相关的问题。
3. 确认输入框附近出现“记忆建议”，并尝试插入或复制一条记忆。
4. 打开插件弹窗或同步侧栏，把草稿的项目、标签和经验候选状态改一下，再加入待审阅。
5. 回到 `http://localhost:3113/#memories`，确认待审阅卡片出现，并保留刚才的项目和标签。

## 6. 真实 AI 页面证据

如果你在 ChatGPT、Claude、Gemini 或 Perplexity 上试用，请先打开本目录里的 `AI-SITE-TEST-CARDS.md`，按每个站点的测试卡确认输入框、记忆建议、插入、复制诊断和原站输入都正常。

验收时打开同步侧栏并点击“复制诊断”。复制后可以用命令保存证据：

```bash
npm run record:ai-validation-evidence -- --clipboard --browser "Chrome 版本号" --notes "无隐私信息的备注"
```

只有在你真实确认“插入成功、诊断已复制、原站输入仍正常”以后，才加 `--pass`。

## 7. 查看当前交付状态

在项目根目录运行：

```bash
npm run status:delivery
```

它会告诉你当前 zip、demo、核心体验和真实 AI 站点证据的状态。

## 8. 反馈问题

如果要反馈问题，请使用项目里的模板：

```text
docs/external-feedback-template-cn.md
.github/ISSUE_TEMPLATE/external-tester-feedback-cn.yml
```

优先附上同步侧栏“复制诊断”的 JSON，并确认截图或录屏不包含敏感信息。
