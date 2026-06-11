import { readFileSync } from 'node:fs';

const sidepanel = readFileSync('browser-extension/sidepanel.js', 'utf8');

const reportMatch = sidepanel.match(/function buildDiagnosticReport\(capture\) \{[\s\S]*?\n\}/);
if (!reportMatch) throw new Error('Side panel must keep buildDiagnosticReport available for privacy checks.');

const reportBody = reportMatch[0];
const requiredStructureFields = [
  'page:',
  'title:',
  'url:',
  'host:',
  'origin:',
  'ai:',
  'provider:',
  'matchedSelectors:',
  'promptLength:',
  'turnCount:',
  'manualValidation:'
];
for (const field of requiredStructureFields) {
  if (!reportBody.includes(field)) throw new Error(`Diagnostic report privacy check expected structural field ${field}.`);
}

const forbiddenRawFields = [
  'promptDraft',
  'turns',
  'selection',
  'description',
  'headings',
  'candidates',
  'memories',
  'lessons',
  'draftContent',
  'content:'
];
for (const field of forbiddenRawFields) {
  if (reportBody.includes(field)) throw new Error(`Diagnostic report must not copy raw page/chat content field: ${field}.`);
}

const fakeCapture = {
  page: {
    title: 'ChatGPT - 私密项目标题',
    url: 'https://chatgpt.com/c/private-thread',
    host: 'chatgpt.com',
    origin: 'https://chatgpt.com',
    type: 'ai-chat',
    typeLabel: 'ChatGPT',
    selection: 'PRIVATE_SELECTED_TEXT_SHOULD_NOT_LEAK',
    description: 'PRIVATE_DESCRIPTION_SHOULD_NOT_LEAK',
    headings: ['PRIVATE_HEADING_SHOULD_NOT_LEAK']
  },
  conversation: {
    provider: 'ChatGPT',
    promptDraft: 'PRIVATE_PROMPT_DRAFT_SHOULD_NOT_LEAK',
    turns: [
      { role: 'user', text: 'PRIVATE_USER_TURN_SHOULD_NOT_LEAK' },
      { role: 'assistant', text: 'PRIVATE_ASSISTANT_TURN_SHOULD_NOT_LEAK' }
    ]
  },
  diagnostics: {
    supportedAiPage: true,
    provider: 'ChatGPT',
    editorFound: true,
    editorSelector: '[contenteditable="true"]',
    anchorFound: true,
    anchorSelector: 'form',
    anchorSource: 'form',
    adjacentSelector: 'button',
    sendFound: true,
    sendSelector: 'button[data-testid="send-button"]',
    turnSelector: '[data-message-author-role]',
    turnSelectorCount: 2,
    matchedSelectors: {
      editor: '[contenteditable="true"]',
      anchor: 'form',
      anchorSource: 'form',
      adjacent: 'button',
      send: 'button[data-testid="send-button"]',
      turn: '[data-message-author-role]'
    },
    placement: 'after-editor',
    promptLength: 36,
    turnCount: 2,
    checkedAt: '2026-06-09T00:00:00.000Z'
  },
};

function makeReport(capture) {
  const page = capture && capture.page ? capture.page : {};
  const diagnostics = capture && capture.diagnostics ? capture.diagnostics : {};
  const conversation = capture && capture.conversation ? capture.conversation : {};
  const manifest = { name: 'Agent Memory Lab', version: '0.1.0', manifest_version: 3 };
  const matched = diagnostics.matchedSelectors || {};
  return {
    product: 'Agent Memory Lab Browser Extension',
    extension: {
      name: manifest.name || 'Agent Memory Lab',
      version: manifest.version || '',
      manifestVersion: manifest.manifest_version || 3
    },
    generatedAt: new Date('2026-06-09T00:00:00.000Z').toISOString(),
    validationGuide: {
      title: '浏览器插件真实 AI 站点测试卡',
      path: '/docs/browser-extension-ai-site-test-cards-cn.md',
      requiredProducts: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity']
    },
    page: {
      title: page.title || '',
      url: page.url || '',
      host: page.host || '',
      origin: page.origin || '',
      type: page.type || '',
      typeLabel: page.typeLabel || ''
    },
    ai: {
      supportedAiPage: !!diagnostics.supportedAiPage,
      provider: diagnostics.provider || conversation.provider || '',
      editorFound: !!diagnostics.editorFound,
      editorSelector: diagnostics.editorSelector || '',
      anchorFound: !!diagnostics.anchorFound,
      anchorSelector: diagnostics.anchorSelector || '',
      anchorSource: diagnostics.anchorSource || '',
      adjacentSelector: diagnostics.adjacentSelector || '',
      sendFound: !!diagnostics.sendFound,
      sendSelector: diagnostics.sendSelector || '',
      turnSelector: diagnostics.turnSelector || '',
      turnSelectorCount: diagnostics.turnSelectorCount || 0,
      matchedSelectors: {
        editor: matched.editor || diagnostics.editorSelector || '',
        anchor: matched.anchor || diagnostics.anchorSelector || '',
        anchorSource: matched.anchorSource || diagnostics.anchorSource || '',
        adjacent: matched.adjacent || diagnostics.adjacentSelector || '',
        send: matched.send || diagnostics.sendSelector || '',
        turn: matched.turn || diagnostics.turnSelector || ''
      },
      placement: diagnostics.placement || '',
      promptLength: diagnostics.promptLength || 0,
      turnCount: diagnostics.turnCount || 0,
      checkedAt: diagnostics.checkedAt || ''
    },
    manualValidation: {
      diagnosticsCopied: true,
      siteInputStillWorks: false,
      browser: '填写浏览器名称和版本',
      notes: '填写无隐私信息的验收备注'
    }
  };
}

const reportText = JSON.stringify(makeReport(fakeCapture), null, 2);
for (const secret of [
  'PRIVATE_SELECTED_TEXT_SHOULD_NOT_LEAK',
  'PRIVATE_DESCRIPTION_SHOULD_NOT_LEAK',
  'PRIVATE_HEADING_SHOULD_NOT_LEAK',
  'PRIVATE_PROMPT_DRAFT_SHOULD_NOT_LEAK',
  'PRIVATE_USER_TURN_SHOULD_NOT_LEAK',
  'PRIVATE_ASSISTANT_TURN_SHOULD_NOT_LEAK'
]) {
  if (reportText.includes(secret)) throw new Error(`Diagnostic JSON leaked private content: ${secret}`);
}

for (const expected of ['promptLength', 'turnCount', 'matchedSelectors', 'manualValidation', 'ChatGPT']) {
  if (!reportText.includes(expected)) throw new Error(`Diagnostic JSON missing expected non-sensitive evidence field: ${expected}`);
}

console.log('browser extension diagnostic privacy checks ok');
