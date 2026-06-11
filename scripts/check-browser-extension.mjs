import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync('browser-extension/manifest.json', 'utf8'));
if ((manifest.content_scripts || []).some((script) => script.type === 'module')) {
  throw new Error('Chrome content scripts must not be declared as module scripts.');
}

const files = [
  'browser-extension/content-script.js',
  'browser-extension/service-worker.js',
  'browser-extension/popup.js',
  'browser-extension/options.js',
  'browser-extension/sidepanel.js',
  'browser-extension/shared/schema.js',
  'browser-extension/shared/api.js',
  'browser-extension/shared/page-types.js',
  'browser-extension/shared/site-config.js'
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${file} failed syntax check.`);
}

function readPngSize(file) {
  const buf = readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== signature) throw new Error(`${file} is not a PNG.`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

for (const size of [16, 32, 48, 128]) {
  const iconPath = manifest.icons && manifest.icons[String(size)];
  if (iconPath !== `icons/icon${size}.png`) throw new Error(`Manifest icon ${size} must point to icons/icon${size}.png.`);
  const actual = readPngSize(`browser-extension/${iconPath}`);
  if (actual.width !== size || actual.height !== size) {
    throw new Error(`${iconPath} must be ${size}x${size}, got ${actual.width}x${actual.height}.`);
  }
}

const contentScript = readFileSync('browser-extension/content-script.js', 'utf8');
const serviceWorker = readFileSync('browser-extension/service-worker.js', 'utf8');
const popupHtml = readFileSync('browser-extension/popup.html', 'utf8');
const popupJs = readFileSync('browser-extension/popup.js', 'utf8');
const sidepanelHtml = readFileSync('browser-extension/sidepanel.html', 'utf8');
const sidepanel = readFileSync('browser-extension/sidepanel.js', 'utf8');
const schema = readFileSync('browser-extension/shared/schema.js', 'utf8');
const manifestText = readFileSync('browser-extension/manifest.json', 'utf8');
const siteConfig = readFileSync('browser-extension/shared/site-config.js', 'utf8');
const sidepanelCss = readFileSync('browser-extension/sidepanel.css', 'utf8');
const sharedApi = readFileSync('browser-extension/shared/api.js', 'utf8');
const config = readFileSync('browser-extension/config.js', 'utf8');
if (!manifest.description || !/自动抓取网页 AI 会话/.test(manifest.description)) {
  throw new Error('Manifest description must be Chinese and describe browser conversation sync.');
}
const contentProviders = [...contentScript.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]);
const sharedProviders = [...siteConfig.matchAll(/\n\s*([a-z0-9_-]+):\s*\{\s*\n\s*id:\s*'([^']+)'/g)].map((match) => match[2]);

const missingInContent = sharedProviders.filter((id) => !contentProviders.includes(id));
const missingInShared = contentProviders.filter((id) => !sharedProviders.includes(id));
if (missingInContent.length || missingInShared.length) {
  throw new Error(`Provider config mismatch. Missing in content: ${missingInContent.join(', ') || 'none'}; missing in shared: ${missingInShared.join(', ') || 'none'}`);
}

const menuContexts = JSON.stringify(manifest.permissions || []) + serviceWorker;
if (!menuContexts.includes("contexts: ['page']") || !serviceWorker.includes('sync-page-conversation')) {
  throw new Error('Context menu must expose page-level workbench sync, not manual memory saving.');
}
if (serviceWorker.includes("id: 'save-page-memory'") || serviceWorker.includes("contexts: ['page', 'selection', 'link']")) {
  throw new Error('Context menu must not expose manual page/selection/link memory saving.');
}
if (!popupJs.includes('已自动抓取') || !popupHtml.includes('draftAssist') || !popupHtml.includes('syncNow')) {
  throw new Error('Popup must expose automatic browser conversation sync status.');
}
if (!popupHtml.includes('closePopup') || !popupHtml.includes('aria-label="打开工作台"') || popupHtml.includes('打开工作台</button>') || popupHtml.includes('查看会话</button>')) {
  throw new Error('Popup must use compact top-right workbench controls instead of a large workbench button.');
}
for (const forbidden of [
  'draftAsLesson',
  'draftTitle',
  'draftContent',
  'draftProject',
  'draftTags',
  '整理成可复用经验',
  '加入待确认',
  '保存到记忆',
  '本地判断',
  '记忆候选',
  '候选记忆',
  '暂时没有记忆建议',
  '记忆入口',
  '记忆建议',
  '待确认',
  '经验候选'
]) {
  if (popupHtml.includes(forbidden) || popupJs.includes(forbidden) || sidepanelHtml.includes(forbidden) || sidepanel.includes(forbidden)) {
    throw new Error(`Extension must not expose memory candidate UI: ${forbidden}.`);
  }
}
for (const forbidden of ['SAVE_PAGE_MEMORY', 'SAVE_PAGE_LESSON', 'SAVE_CANDIDATE', 'SEARCH_MEMORIES', 'buildBrowserMemoryDraft', 'buildBrowserLessonDraft', 'captureToMemoryPayload', 'captureToLessonPayload', 'candidates:', 'DEMO_MEMORIES', 'agent-memory-lab-widget', 'data-insert-memory', 'data-copy-memory']) {
  if (contentScript.includes(forbidden) || serviceWorker.includes(forbidden) || schema.includes(forbidden) || sidepanel.includes(forbidden) || popupJs.includes(forbidden)) {
    throw new Error(`Extension must only sync conversations; found stale path: ${forbidden}.`);
  }
}
if (!contentScript.includes('scheduleConversationSync') || !contentScript.includes('SYNC_PAGE_CONVERSATION')) {
  throw new Error('Content script must automatically sync browser conversations to the workbench.');
}
if (!contentScript.includes('MAX_CAPTURE_TURNS = 160') || contentScript.includes('return turns.slice(-8)') || schema.includes('slice(-8)')) {
  throw new Error('Browser conversation capture must preserve full AI sessions instead of only the latest 8 turns.');
}
if (!serviceWorker.includes('async function syncPageConversation') || !serviceWorker.includes("source: 'browser-sync'") || !serviceWorker.includes("mode: 'sync'")) {
  throw new Error('Service worker must send browser conversations as automatic sync events.');
}
if (!popupJs.includes("send('SYNC_OPEN_AI_TABS'") || !sidepanel.includes("send('SYNC_OPEN_AI_TABS'")) {
  throw new Error('Popup and side panel must support syncing all open AI conversation tabs.');
}
if (!serviceWorker.includes('syncOpenAiConversationTabs') || !serviceWorker.includes('chrome.tabs.query({})') || !serviceWorker.includes('chrome.alarms.create')) {
  throw new Error('Service worker must scan open AI conversation tabs automatically.');
}
if (!serviceWorker.includes('conversation: capture.conversation')) {
  throw new Error('Browser sync events must preserve captured browser conversation turns.');
}
if (!popupHtml.includes('本地工作台') || !popupHtml.includes('versionInfo') || popupHtml.includes('openGuide')) {
  throw new Error('Popup must expose local workbench status and version without a tester guide entry.');
}
if (!popupJs.includes('getManifest') || popupJs.includes('external-tester-guide-cn.md')) {
  throw new Error('Popup must render extension version without linking stale external guide docs.');
}
for (const stalePageField of ['description:', 'selection:', 'headings:', 'promptDraft:', 'privacy:', 'candidates:']) {
  if (schema.includes(stalePageField)) throw new Error(`Shared capture schema must not include page extraction field: ${stalePageField}`);
}
if (!sidepanel.includes('正在自动同步') || !sidepanelHtml.includes('draftAssist') || !sidepanelHtml.includes('syncNow')) {
  throw new Error('Side panel must expose automatic browser conversation sync status.');
}
if (!sidepanelHtml.includes('closePanel') || !sidepanelHtml.includes('aria-label="打开工作台"') || sidepanelHtml.includes('工作台</button>') || sidepanelHtml.includes('footer-actions')) {
  throw new Error('Side panel must use compact top-right workbench controls instead of a footer workbench button.');
}
if (sidepanel.includes('data-draft-kind') || sidepanel.includes('SAVE_CANDIDATE')) {
  throw new Error('Side panel must not route users through manual candidate editing.');
}
if (sidepanelHtml.includes('openTestCards')) {
  throw new Error('Side panel should not expose tester cards in the ordinary extension flow.');
}
if (!sidepanelHtml.includes('copyEvidenceCommand') || !sidepanelHtml.includes('复制检查步骤') || !sidepanel.includes('buildEvidenceCommand') || !sidepanel.includes('wizard:ai-validation-evidence')) {
  throw new Error('Side panel must expose a copyable AI validation evidence wizard command.');
}
for (const field of ['aiValidationSummary', 'validation-summary']) {
  if (!sidepanelHtml.includes(field) && !sidepanel.includes(field) && !sidepanelCss.includes(field)) throw new Error(`Side panel must expose the AI validation card field: ${field}.`);
}
for (const label of ['页面识别', '会话抓取正常', '识别不准时再使用']) {
  if (!sidepanelHtml.includes(label) && !sidepanel.includes(label)) throw new Error(`Side panel AI diagnostics missing label: ${label}.`);
}
if (!sharedApi.includes('path =') || !serviceWorker.includes('message.path')) {
  throw new Error('OPEN_VIEWER must support local viewer document paths.');
}
if (!sharedApi.includes('resolveApiBase') || !config.includes('viewerFallbackBase') || !config.includes('hasAgentMemoryApi')) {
  throw new Error('Extension API client must fall back to the local viewer proxy when the REST API route is unavailable.');
}
if (!sharedApi.includes('resolveViewerBase') || !manifestText.includes('localhost:3114')) {
  throw new Error('Extension must discover the active Viewer port and allow the 3114 fallback viewer.');
}

for (const field of ['anchorFound', 'placement', 'checkedAt', 'anchorSelector', 'anchorSource', 'adjacentSelector', 'sendFound', 'sendSelector', 'turnSelector', 'turnSelectorCount', 'matchedSelectors']) {
  if (!contentScript.includes(field)) throw new Error(`Content script diagnostics missing ${field}.`);
  if (!schema.includes(field)) throw new Error(`Shared schema diagnostics must preserve ${field}.`);
  if (!sidepanel.includes(field)) throw new Error(`Side panel diagnostics must expose ${field}.`);
}
for (const label of ['页面', '输入框', '发送按钮', '已抓取会话']) {
  if (!sidepanel.includes(label)) throw new Error(`Side panel diagnostics must show ${label}.`);
}
for (const internalLabel of ['输入规则', '锚点规则', '相邻控件', '发送规则', '会话规则']) {
  if (sidepanel.includes(internalLabel)) throw new Error(`Side panel must not expose internal selector label: ${internalLabel}.`);
}
for (const field of ['getManifest', 'manifestVersion', 'version']) {
  if (!sidepanel.includes(field)) throw new Error(`Diagnostic report must include extension ${field}.`);
}
for (const field of ['manualValidation', 'diagnosticsCopied', 'siteInputStillWorks']) {
  if (!sidepanel.includes(field)) throw new Error(`Diagnostic report must include manual validation template field ${field}.`);
}
for (const field of ['validationGuide', 'requiredProducts', 'ChatGPT', 'Claude', 'Gemini', 'Perplexity', '/docs/browser-extension-ai-site-test-cards-cn.md']) {
  if (!sidepanel.includes(field)) throw new Error(`Diagnostic report must include validation guide field ${field}.`);
}

console.log('browser extension checks ok');
