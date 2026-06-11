#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const files = [
  'README.md',
  'package.json',
  'package-lock.json',
  'docs/demo-checklist-cn.md',
  'docs/external-tester-guide-cn.md',
  'docs/project-delivery-guide-cn.md',
  'docs/feishu/agentmemory-project-intro-cn.md',
  'browser-extension/config.js',
  'browser-extension/manifest.json',
  'plugin/skills/open-workbench/SKILL.md',
  'plugin/opencode/README.md',
  'plugin/opencode/plugin.json',
  'plugin/plugin.json',
  'scripts/check-delivery.mjs',
  'scripts/check-browser-extension-demo-interaction.mjs',
  'scripts/check-remote-delivery.mjs',
  'scripts/fixtures/ai-validation-diagnostic.json',
  'scripts/render-feishu-whiteboards.mjs',
  'iii-config.yaml',
  'iii-config.docker.yaml',
  'iii-config.local-memory.yaml',
  'src/cli.ts',
  'src/index.ts',
  'src/cli/doctor-diagnostics.ts',
  'src/viewer/server.ts',
  'src/viewer/index.html',
];

const forbidden = [
  {
    pattern: /npx\s+@agentmemory\/agentmemory/g,
    reason: 'uses the upstream npm package instead of the MaimoryLab checkout',
  },
  {
    pattern: /npm\s+install\s+-g\s+@agentmemory\/agentmemory/g,
    reason: 'installs the upstream npm package',
  },
  {
    pattern: /https:\/\/github\.com\/rohitg00\/agentmemory/g,
    reason: 'links users to the upstream repo as the product source',
  },
  {
    pattern: /https:\/\/github\.com\/novitalabs\/agentmemory-lab/g,
    reason: 'links users to the old delivery organization',
  },
  {
    pattern: /\bagentmemory\s+(demo|viewer|stop|status|doctor|init)\b/g,
    reason: 'suggests the old bare CLI entrypoint',
  },
  {
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1):3113/g,
    reason: 'uses the old viewer port instead of the MaimoryLab viewer port 3114',
  },
  {
    pattern: /default 3113/g,
    reason: 'documents the old viewer port as a default',
  },
];

const allowLine = (file, line) => {
  if (file === 'src/cli.ts' && /Wire agentmemory into/.test(line)) {
    return true;
  }
  if (file === 'scripts/check-maimorylab-branding.mjs') return true;
  return false;
};

const failures = [];

for (const file of files) {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line) && !allowLine(file, line)) {
        failures.push({
          file,
          line: index + 1,
          reason: rule.reason,
          text: line.trim(),
        });
      }
    }
  });
}

if (failures.length > 0) {
  console.error('MaimoryLab branding check failed:');
  for (const failure of failures) {
    console.error(
      `- ${relative(process.cwd(), failure.file)}:${failure.line} ${failure.reason}\n  ${failure.text}`,
    );
  }
  process.exit(1);
}

console.log('MaimoryLab branding check passed.');
