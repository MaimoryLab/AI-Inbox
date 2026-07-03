import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAppServer } from "../src/server/index.js";

test("package exposes only the ai-inbox CLI on supported Node LTS", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    bin: Record<string, string>;
    engines: { node: string };
    scripts: Record<string, string>;
    files: string[];
    devDependencies: Record<string, string>;
  };

  assert.deepEqual(pkg.bin, { "ai-inbox": "dist/cli.js" });
  assert.equal(pkg.engines.node, ">=22.16.0");
  assert.equal(pkg.scripts.start, "node dist/cli.js open");
  assert.equal(pkg.scripts.release, "npm run release:zip");
  assert.equal(pkg.scripts["release:zip"], "npm run build && node scripts/build-release.mjs");
  assert.ok(pkg.files.includes("dist/public"));
  assert.ok(pkg.files.includes("dist/src"));
  assert.ok(pkg.devDependencies.postject);
});

test("release packaging has cross-platform CI and no legacy ai-todo command", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const script = readFileSync("scripts/build-release.mjs", "utf8");

  assert.match(workflow, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(workflow, /node-version: \[22\.x, 24\.x\]/);
  assert.match(workflow, /npm run release:zip/);
  assert.match(script, /--build-sea|--experimental-sea-config/);
  assert.match(script, /postject/);
  assert.match(script, /execFileSync\(process\.execPath, \[postjectCli\(\), \.\.\.args\]/);
  assert.doesNotMatch(script, /postject\.cmd/);
  assert.doesNotMatch(`${workflow}\n${script}`, /ai-todo/);
});

test("README documents npm and zip release usage", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /npm install -g @maimorylab\/ai-inbox/);
  assert.match(readme, /npx @maimorylab\/ai-inbox open/);
  assert.match(readme, /release zip/);
  assert.match(readme, /\.\/ai-inbox open/);
  assert.match(readme, /\.\\ai-inbox\.exe open/);
  assert.match(readme, /\$env:AI_INBOX_HOME = ".local\\ai-inbox"/);
});

test("release files exist", () => {
  assert.ok(existsSync("scripts/build-release.mjs"));
  assert.ok(existsSync(".github/workflows/ci.yml"));
});

test("server can serve static UI from an external release directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-public-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>AI-Inbox</title>");
  writeFileSync(join(dir, "assets", "app.js"), "console.log('ai-inbox');");

  const server = createAppServer({ publicDir: dir });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal(await (await fetch(`${base}/`)).text(), "<!doctype html><title>AI-Inbox</title>");
    assert.equal(await (await fetch(`${base}/assets/app.js`)).text(), "console.log('ai-inbox');");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
