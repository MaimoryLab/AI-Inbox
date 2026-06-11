import { buildBrowserMemoryDraft, captureToMemoryPayload, createPageCapture } from '../browser-extension/shared/schema.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const concreteConversation = createPageCapture({
  title: '了解用户背景',
  url: 'https://chatgpt.com/c/example',
  host: 'chatgpt.com',
  aiProvider: 'ChatGPT',
  description: 'ChatGPT 是一款供日常使用的 AI 聊天机器人。',
  turns: [
    {
      role: 'assistant',
      text: '我知道你是刘欣（Liu Xin），是一位有着 UI/UX、交互设计和产品设计背景的学生及产品设计师。在我们的交流中，你经常关注 AI 产品和用户体验。'
    },
    {
      role: 'user',
      text: '对，这个背景需要被记住，后续做 Agent Memory Lab 的产品迭代时要结合我的设计和用户体验背景。'
    }
  ]
});

const concreteDraft = buildBrowserMemoryDraft(concreteConversation);
assert(concreteDraft.content.includes('刘欣（Liu Xin）'), 'Concrete chat memory draft should keep the person identity.');
assert(/UI\/?UX|交互设计|产品设计/.test(concreteDraft.content), 'Concrete chat memory draft should keep design background facts.');
assert(!concreteDraft.content.includes('ChatGPT 是一款供日常使用'), 'Concrete chat memory draft must ignore generic product page descriptions.');
assert(!concreteDraft.content.includes('https://chatgpt.com'), 'Concrete chat memory draft must not be a link bookmark.');
assert(!concreteDraft.emptyReason, 'Concrete chat memory draft should not be empty.');

const concretePayload = captureToMemoryPayload(concreteConversation);
assert(concretePayload.content === concreteDraft.content, 'Memory payload should preserve the concrete draft content.');

const emptyConversation = createPageCapture({
  title: '了解用户背景',
  url: 'https://chatgpt.com/c/empty',
  host: 'chatgpt.com',
  aiProvider: 'ChatGPT',
  description: 'ChatGPT 是一款供日常使用的 AI 聊天机器人。',
  turns: []
});

const emptyDraft = buildBrowserMemoryDraft(emptyConversation);
assert(emptyDraft.content === '', 'Empty AI pages must not produce vague memory content.');
assert(emptyDraft.emptyReason, 'Empty AI pages should explain why there is no memory candidate.');
assert(!emptyDraft.title.includes('了解用户背景') || emptyDraft.title.includes('需要具体对话'), 'Empty AI pages must not use page title as memory fact.');

let threw = false;
try {
  captureToMemoryPayload(emptyConversation);
} catch (err) {
  threw = /具体对话|具体记忆|保存/.test(String(err && err.message ? err.message : err));
}
assert(threw, 'Empty AI pages must be blocked before entering the memory review payload.');

const promptOnlyConversation = createPageCapture({
  title: '了解用户背景',
  url: 'https://chatgpt.com/c/prompt-only',
  host: 'chatgpt.com',
  aiProvider: 'ChatGPT',
  description: 'ChatGPT 是一款供日常使用的 AI 聊天机器人。',
  promptDraft: '记住我正在做 Agent Memory Lab 的浏览器插件记忆同步。',
  turns: []
});

assert(promptOnlyConversation.candidates.memories.length === 0, 'AI prompt drafts alone must not become memory candidates.');
const promptOnlyDraft = buildBrowserMemoryDraft(promptOnlyConversation);
assert(promptOnlyDraft.content === '', 'AI prompt drafts alone must not become long-term memory content.');
assert(promptOnlyDraft.emptyReason, 'Prompt-only AI pages should ask for concrete conversation or selection.');

let promptOnlyThrew = false;
try {
  captureToMemoryPayload(promptOnlyConversation);
} catch (err) {
  promptOnlyThrew = /具体对话|具体记忆|保存/.test(String(err && err.message ? err.message : err));
}
assert(promptOnlyThrew, 'Prompt-only AI pages must be blocked before entering review.');

const dashboardUiSelection = createPageCapture({
  title: '灵感记忆台',
  url: 'http://127.0.0.1:3114/#dashboard',
  host: '127.0.0.1',
  selection: '浏览器记忆入口 从网页和 AI 对话提取具体事实，先送审，再写入记忆库。 可本地使用 不要把链接当记忆。浏览器入口会把页面里的事实、偏好和待办变成候选，回到这里审阅后才进入长期记忆。 下载插件包 外测手册 验收一页纸 AI 验收包 反馈模板 分诊指南 1. 先看预览 2. 装到浏览器 3. 验收 AI 页面 4. 回来审阅 查看待审阅 适配检查',
  headings: ['总览', '浏览器记忆入口', '最近会话']
});

assert(dashboardUiSelection.candidates.memories.length === 0, 'Dashboard UI copy must not become memory candidates.');
const dashboardUiDraft = buildBrowserMemoryDraft(dashboardUiSelection);
assert(dashboardUiDraft.content === '', 'Dashboard UI copy must not become a memory draft.');

let dashboardUiThrew = false;
try {
  captureToMemoryPayload(dashboardUiSelection);
} catch (err) {
  dashboardUiThrew = /具体对话|具体记忆|保存/.test(String(err && err.message ? err.message : err));
}
assert(dashboardUiThrew, 'Dashboard UI copy must be blocked before entering review.');

console.log('browser extension memory draft checks ok');
