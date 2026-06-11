import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

const popupHtml = read('browser-extension/popup.html');
const popupJs = read('browser-extension/popup.js');
const sidepanelHtml = read('browser-extension/sidepanel.html');
const sidepanelJs = read('browser-extension/sidepanel.js');
const serviceWorker = read('browser-extension/service-worker.js');
const contentScript = read('browser-extension/content-script.js');

for (const [name, html] of [['popup', popupHtml], ['sidepanel', sidepanelHtml]]) {
  assert(html.includes('draftAssist'), `${name}: missing sync status assist copy.`);
  assert(html.includes('syncNow'), `${name}: missing manual retry sync action.`);
  assert(html.includes('aria-label="打开工作台"'), `${name}: missing compact workbench icon.`);
  for (const forbidden of ['draftTitle', 'draftContent', 'draftProject', 'draftTags', 'resetDraft', 'draftAsLesson', '加入待确认']) {
    assert(!html.includes(forbidden), `${name}: extension should not expose manual memory-writing control ${forbidden}.`);
  }
}

assert(popupJs.includes('已自动抓取'), 'popup: missing automatic sync status.');
assert(sidepanelJs.includes('正在自动同步'), 'sidepanel: missing automatic sync status.');
assert(popupHtml.includes('closePopup'), 'popup: missing compact close control.');
assert(sidepanelHtml.includes('closePanel'), 'sidepanel: missing compact close control.');
assert(!popupHtml.includes('打开工作台</button>') && !popupHtml.includes('查看会话</button>'), 'popup: should not expose a large workbench button.');
assert(!sidepanelHtml.includes('工作台</button>') && !sidepanelHtml.includes('footer-actions'), 'sidepanel: should not expose a footer workbench button.');
assert(contentScript.includes('scheduleConversationSync'), 'content script: missing automatic conversation sync scheduler.');
assert(contentScript.includes('SYNC_PAGE_CONVERSATION'), 'content script: automatic sync must call SYNC_PAGE_CONVERSATION.');
assert(popupJs.includes("send('SYNC_OPEN_AI_TABS'"), 'popup: manual retry must sync all open AI conversation tabs.');
assert(sidepanelJs.includes("send('SYNC_OPEN_AI_TABS'"), 'sidepanel: manual retry must sync all open AI conversation tabs.');
assert(!popupJs.includes("send('SAVE_CANDIDATE'"), 'popup: manual candidate saving should not be the primary extension flow.');
assert(!sidepanelJs.includes("send('SAVE_CANDIDATE'"), 'sidepanel: manual candidate saving should not be the primary extension flow.');
assert(!sidepanelHtml.includes('可复用经验'), 'sidepanel: reusable lesson/skill branch should stay out of the extension UX.');

assert(serviceWorker.includes('async function syncPageConversation'), 'service worker: missing browser conversation sync handler.');
assert(serviceWorker.includes('syncOpenAiConversationTabs'), 'service worker: missing open AI tabs sync handler.');
assert(serviceWorker.includes("mode: 'sync'"), 'service worker: sync payload must mark browser sync mode.');
assert(serviceWorker.includes("source: 'browser-sync'"), 'service worker: sync payload must use browser-sync source.');

console.log('browser extension auto sync checks ok');
