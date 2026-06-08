import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const zipPath = 'artifacts/agent-memory-lab-extension.zip';
if (!existsSync(zipPath)) throw new Error(`Missing ${zipPath}. Run npm run package:browser-extension first.`);

const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(`Failed to inspect ${zipPath}: ${result.stderr || result.stdout}`);

const entries = result.stdout.split(/\r?\n/).filter(Boolean);
const entrySet = new Set(entries);
const required = [
  'browser-extension/manifest.json',
  'browser-extension/content-script.js',
  'browser-extension/service-worker.js',
  'browser-extension/sidepanel.html',
  'browser-extension/sidepanel.js',
  'browser-extension/sidepanel.css',
  'browser-extension/popup.html',
  'browser-extension/popup.js',
  'browser-extension/options.html',
  'browser-extension/options.js',
  'browser-extension/shared/schema.js',
  'browser-extension/shared/site-config.js',
  'browser-extension/icons/icon16.png',
  'browser-extension/icons/icon32.png',
  'browser-extension/icons/icon48.png',
  'browser-extension/icons/icon128.png',
  'browser-extension/README.md',
  'browser-extension/LOAD-THIS-FIRST.md'
];

const missing = required.filter((entry) => !entrySet.has(entry));
if (missing.length) throw new Error(`Extension package is missing: ${missing.join(', ')}`);

const forbidden = entries.filter((entry) => entry.includes('__MACOSX') || entry.endsWith('.DS_Store'));
if (forbidden.length) throw new Error(`Extension package includes forbidden macOS metadata: ${forbidden.join(', ')}`);

if (!entries.every((entry) => entry === 'browser-extension/' || entry.startsWith('browser-extension/'))) {
  throw new Error('Extension package must contain only the browser-extension folder.');
}

console.log(`browser extension package checks ok (${entries.length} entries)`);
