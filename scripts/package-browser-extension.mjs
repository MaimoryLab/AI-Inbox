import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const outDir = 'artifacts/browser-extension';
const zipPath = 'artifacts/agent-memory-lab-extension.zip';

rmSync(outDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync('artifacts', { recursive: true });

const copy = spawnSync('ditto', ['browser-extension', outDir], { stdio: 'inherit' });
if (copy.status !== 0) throw new Error('Failed to copy browser-extension.');

for (const name of ['.DS_Store', '__MACOSX']) {
  rmSync(`${outDir}/${name}`, { recursive: true, force: true });
}

const zip = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', outDir, zipPath], { stdio: 'inherit' });
if (zip.status !== 0) throw new Error('Failed to package browser extension zip.');
if (!existsSync(zipPath)) throw new Error('Extension zip was not created.');

console.log(`browser extension package: ${zipPath}`);
