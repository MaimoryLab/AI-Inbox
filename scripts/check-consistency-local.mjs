#!/usr/bin/env node
// 本地一致性快速自检(秒级,无需 build)。
//
// 为什么:碰 MCP 工具 / REST 端点 / 版本号要按 AGENTS.md 同步改多处,
// 否则 test/consistency.test.ts 在 CI 4 格全量跑完(~7min)才报红。本脚本
// 把其中**纯文件级**的计数/版本断言提前到本地秒级反馈,推前先跑一道。
//
// 注:工具数用 README 里被 consistency.test 锁定的 "N MCP tools" 做交叉核对,
// 不导入 getAllTools(避免依赖 build)。完整断言仍以 npm test 为准。
//
// 用法: node scripts/check-consistency-local.mjs
// 退出码: 0 全过 / 1 有不一致

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf-8");

const problems = [];
const ok = [];
function check(label, pass, hint) {
  (pass ? ok : problems).push(pass ? label : `${label}\n      → ${hint}`);
}

// --- 版本号 (package.json 为源) ---
const pkg = JSON.parse(read("package.json"));
const ver = pkg.version;

const versionFt = read("src/version.ts");
check(
  "src/version.ts VERSION === package.json",
  versionFt.includes(`"${ver}"`),
  `version.ts 未含 "${ver}"。改版本要同步 7 处(见 docs 一致性铁律)`,
);

const claudePlugin = JSON.parse(read("plugin/.claude-plugin/plugin.json"));
check(
  "plugin/.claude-plugin/plugin.json version === package.json",
  claudePlugin.version === ver,
  `plugin.json 是 ${claudePlugin.version},应为 ${ver}`,
);

const exportImport = read("src/functions/export-import.ts");
check(
  "export-import.ts supportedVersions 含当前版本",
  exportImport.includes(`"${ver}"`),
  `export-import.ts 未含 "${ver}"`,
);

// --- REST 端点计数 (src/triggers/api.ts 为源) ---
const apiSrc = read("src/triggers/api.ts");
const restCount = [...apiSrc.matchAll(/api_path:\s*["`]/g)].length;

const readme = read("README.md");
const agents = read("AGENTS.md");
const indexSrc = read("src/index.ts");
check(
  `README "${restCount} endpoints on port"`,
  readme.includes(`${restCount} endpoints on port`),
  `README 的 REST 端点数与实际 ${restCount} 不符`,
);
check(
  `AGENTS.md "${restCount} REST endpoints"`,
  agents.includes(`${restCount} REST endpoints`),
  `AGENTS.md 的 REST 端点数与实际 ${restCount} 不符`,
);
check(
  `src/index.ts "REST API: ${restCount} endpoints"`,
  indexSrc.includes(`REST API: ${restCount} endpoints`),
  `src/index.ts 的硬编码端点数与实际 ${restCount} 不符`,
);

// --- MCP 工具计数 (README 被 consistency.test 锁定,做交叉核对) ---
const toolMatch = readme.match(/(\d+)\s+MCP tools/);
if (toolMatch) {
  const n = toolMatch[1];
  check(
    `README "${n} tools, 6 resources" 与 "${n} MCP tools" 自洽`,
    readme.includes(`${n} tools, 6 resources`),
    `README 两处工具数不一致(MCP tools=${n})`,
  );
} else {
  check("README 含 MCP 工具计数", false, 'README 未找到 "N MCP tools"');
}

// --- 输出 ---
console.log(`\n一致性自检 (源: package.json v${ver}, REST ${restCount} 端点)\n`);
for (const o of ok) console.log(`  ✓ ${o}`);
if (problems.length) {
  console.log("");
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(
    `\n${problems.length} 处不一致。完整断言以 \`npm test\`(test/consistency.test.ts) 为准。`,
  );
  process.exit(1);
}
console.log("\n全部一致 ✓  (完整断言仍以 npm test 为准)");
