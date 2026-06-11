# Agent Memory Lab 真实 AI 站点测试卡

公开发布前，每个 AI 站点都要用真实会话验收一次。

必测站点：

- ChatGPT：`chatgpt.com` / `chat.openai.com`
- Claude：`claude.ai`
- Gemini：`gemini.google.com`
- Perplexity：`perplexity.ai` / `www.perplexity.ai`
- Grok：`grok.com` / `x.ai`
- DeepSeek：`chat.deepseek.com`

## 每个站点都要确认

- Provider 识别正确。
- 页面里至少有一轮真实对话。
- 侧栏诊断里的 `turnCount > 0`。
- 弹窗或侧栏显示“已抓取 N 条”。
- 点击“同步已打开的 AI 会话”后，工作台 `#sessions` 出现对应会话。
- 原站输入、发送、滚动、模型选择和附件按钮没有异常。
- 复制诊断 JSON 时不包含真实会话正文，只包含选择器、计数和页面元信息。

## 保存证据

复制同步侧栏诊断后，在仓库根目录运行：

```bash
npm run wizard:ai-validation-evidence
```

已经确认通过时，也可以使用无交互模式：

```bash
npm run wizard:ai-validation-evidence -- --yes --browser "Chrome 版本号" --notes "无隐私信息的备注"
```

证据里应能看到 `manualValidation.diagnosticsCopied`、`manualValidation.siteInputStillWorks`、`matchedSelectors.turn` 和 `turnCount > 0`。

## 当前边界

本地 demo 通过不等于公开发布通过。公开发布需要真实 AI 页面通过证据，并确认同步后的会话能在工作台 Sessions 里查看。
