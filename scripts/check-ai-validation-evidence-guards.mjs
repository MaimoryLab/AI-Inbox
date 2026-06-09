import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const tmpRoot = 'artifacts/tmp-ai-validation-guards';

function baseEvidence(overrides = {}) {
  return {
    product: 'Agent Memory Lab Browser Extension',
    extension: { name: 'Agent Memory Lab', version: '0.1.0', manifestVersion: 3 },
    generatedAt: '2026-06-09T00:00:00.000Z',
    page: {
      title: 'ChatGPT',
      url: 'https://chatgpt.com/c/test-thread',
      host: 'chatgpt.com',
      origin: 'https://chatgpt.com',
      type: 'ai-chat',
      typeLabel: 'ChatGPT'
    },
    ai: {
      supportedAiPage: true,
      provider: 'ChatGPT',
      editorFound: true,
      anchorFound: true,
      placement: 'after-editor',
      memoryWidgetVisible: true,
      promptLength: 24,
      turnCount: 2,
      checkedAt: '2026-06-09T00:00:00.000Z',
      matchedSelectors: {
        editor: '[contenteditable="true"]',
        anchor: 'form',
        send: 'button[data-testid="send-button"]',
        turn: '[data-message-author-role]'
      }
    },
    manualValidation: {
      memoryInsertPassed: true,
      diagnosticsCopied: true,
      siteInputStillWorks: true,
      browser: 'Chrome test',
      notes: 'No private chat content included'
    },
    ...overrides
  };
}

function writeEvidence(dir, name, data) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), `${JSON.stringify(data, null, 2)}\n`);
}

function runCheck(dir) {
  return spawnSync(process.execPath, ['scripts/check-ai-validation-evidence.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENTMEMORY_AI_EVIDENCE_DIR: dir,
      AGENTMEMORY_AI_EVIDENCE_SUMMARY: path.join(tmpRoot, `${path.basename(dir)}-summary.json`)
    }
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

rmSync(tmpRoot, { recursive: true, force: true });

const cleanDir = path.join(tmpRoot, 'clean');
writeEvidence(cleanDir, '2026-06-09-chatgpt.json', baseEvidence());
const clean = runCheck(cleanDir);
assert(clean.status === 0, `Clean evidence should pass guard check.\n${clean.stderr}\n${clean.stdout}`);

const privateDir = path.join(tmpRoot, 'private-fields');
writeEvidence(privateDir, '2026-06-09-chatgpt.json', baseEvidence({
  conversation: {
    turns: [{ role: 'user', text: 'PRIVATE_CHAT_TEXT_SHOULD_NOT_BE_IN_EVIDENCE' }],
    promptDraft: 'PRIVATE_PROMPT_SHOULD_NOT_BE_IN_EVIDENCE'
  }
}));
const privateResult = runCheck(privateDir);
assert(privateResult.status !== 0, 'Evidence containing raw conversation/prompt fields must fail.');
assert((privateResult.stderr + privateResult.stdout).includes('private/raw page or conversation fields'), 'Private-field failure should explain the privacy issue.');

const wrongHostDir = path.join(tmpRoot, 'wrong-host');
writeEvidence(wrongHostDir, '2026-06-09-chatgpt.json', baseEvidence({
  page: {
    title: 'Claude',
    url: 'https://claude.ai/chat/test-thread',
    host: 'claude.ai',
    origin: 'https://claude.ai',
    type: 'ai-chat',
    typeLabel: 'Claude'
  }
}));
const wrongHost = runCheck(wrongHostDir);
assert(wrongHost.status !== 0, 'Evidence whose host does not match its provider must fail.');
assert((wrongHost.stderr + wrongHost.stdout).includes('page host does not match provider'), 'Wrong-host failure should explain the provider/domain issue.');

const noTurnsDir = path.join(tmpRoot, 'no-turns');
writeEvidence(noTurnsDir, '2026-06-09-chatgpt.json', baseEvidence({ ai: { ...baseEvidence().ai, turnCount: 0 } }));
const noTurns = runCheck(noTurnsDir);
assert(noTurns.status === 0, 'No-turn evidence should be summarized without crashing the evidence scanner.');
const noTurnsSummary = JSON.parse(readFileSync(path.join(tmpRoot, 'no-turns-summary.json'), 'utf8'));
assert(noTurnsSummary.passedCount === 0, 'Evidence without captured conversation turns must not count as passed.');
assert(Array.isArray(noTurnsSummary.notPassedRequired) && noTurnsSummary.notPassedRequired.includes('ChatGPT'), 'No-turn evidence should keep ChatGPT in the not-passed list.');

console.log('AI validation evidence guard checks ok');
