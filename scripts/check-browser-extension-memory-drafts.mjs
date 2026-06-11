import { createPageCapture } from '../browser-extension/shared/schema.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const capture = createPageCapture({
  title: '了解用户背景',
  url: 'https://chatgpt.com/c/example',
  host: 'chatgpt.com',
  aiProvider: 'ChatGPT',
  description: 'This should not be copied into capture.',
  selection: 'This should not be copied into capture.',
  promptDraft: 'This should not be copied into capture.',
  headings: ['This should not be copied into capture.'],
  turns: [
    { role: 'user', text: '请把这段网页 AI 会话同步到本地工作台。' },
    { role: 'assistant', text: '可以，插件会只保留会话原文，后续整理在工作台完成。' }
  ]
});

assert(capture.page.title === '了解用户背景', 'Capture should keep page title for source display.');
assert(capture.page.host === 'chatgpt.com', 'Capture should keep source host.');
assert(capture.page.type === 'ai-chat', 'Capture should identify supported AI chat pages.');
assert(capture.conversation.provider === 'ChatGPT', 'Capture should keep AI provider.');
assert(capture.conversation.turns.length === 2, 'Capture should preserve conversation turns.');
assert(!('description' in capture.page), 'Capture must not include page description.');
assert(!('selection' in capture.page), 'Capture must not include selected page text.');
assert(!('headings' in capture.page), 'Capture must not include page headings.');
assert(!('promptDraft' in capture.conversation), 'Capture must not include input drafts.');
assert(!('candidates' in capture), 'Capture must not generate memory candidates.');
assert(!('privacy' in capture), 'Capture must not run plugin-side memory/privacy classification.');

const text = JSON.stringify(capture);
for (const forbidden of ['This should not be copied into capture', '候选事实', '经验：']) {
  assert(!text.includes(forbidden), `Capture leaked non-conversation extraction data: ${forbidden}`);
}

console.log('browser extension conversation capture checks ok');
