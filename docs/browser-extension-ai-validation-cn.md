# 浏览器插件 AI 站点验收记录

这份表用于记录真实 AI 网页的插件验收结果。`npm run check:browser-extension` 里的 fixture 只能证明 selector 规则没有结构性退化；真正对外交付前，还需要在真实网页里确认输入框旁记忆提示、插入、复制和侧栏诊断都可用。

## 验收方法

1. 启动本地 Viewer / API。
2. 在 Chrome / Edge 开发者模式加载 `browser-extension/`。
3. 打开目标 AI 产品页面并登录。
4. 在输入框输入一个和本地记忆相关的问题，至少 8 个字。
5. 打开插件同步侧栏，检查“AI 页面状态”。
6. 检查输入框附近是否出现“本地记忆”提示。
7. 尝试插入一条记忆到输入框。
8. 点击“复制诊断”，把 JSON 保存到本表对应记录或 issue。
9. 记录截图、日期、浏览器版本和结果。

## 通过标准

- Provider 被正确识别。
- 输入框状态为“已找到”。
- 输入框附近出现“本地记忆”入口。
- 本地搜索有结果时，可以插入或复制记忆。
- 同步侧栏可复制诊断 JSON。
- 插件没有导致原站点输入框、发送按钮、页面滚动异常。

## 当前验收表

| 产品 | 目标域名 | Provider | 输入框 | 记忆提示 | 插入 | 复制诊断 | 结果 | 日期 | 证据/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | `chatgpt.com` | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | - | - |
| Claude | `claude.ai` | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | - | - |
| Gemini | `gemini.google.com` | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | - | - |
| Perplexity | `www.perplexity.ai` | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | - | - |
| Grok | `grok.com` | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | - | - |
| DeepSeek | `chat.deepseek.com` | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | 待验收 | - | - |

## 诊断 JSON 示例

```json
{
  "product": "Agent Memory Lab Browser Extension",
  "generatedAt": "2026-06-08T00:00:00.000Z",
  "page": {
    "title": "ChatGPT",
    "url": "https://chatgpt.com/",
    "host": "chatgpt.com",
    "type": "ai-chat",
    "typeLabel": "AI 对话"
  },
  "ai": {
    "supportedAiPage": true,
    "provider": "ChatGPT",
    "editorFound": true,
    "editorSelector": "#prompt-textarea",
    "promptLength": 18,
    "turnCount": 4
  }
}
```

## 修复记录

| 日期 | 产品 | 问题 | 修复 | 验证 |
| --- | --- | --- | --- | --- |
| - | - | - | - | - |
