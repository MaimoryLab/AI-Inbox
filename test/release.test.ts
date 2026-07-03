import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAppServer } from "../src/server/index.js";

test("package exposes only the ai-index CLI on supported Node LTS", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    bin: Record<string, string>;
    engines: { node: string };
    scripts: Record<string, string>;
    files: string[];
    devDependencies: Record<string, string>;
  };

  assert.deepEqual(pkg.bin, { "ai-index": "dist/cli.js" });
  assert.equal(pkg.engines.node, ">=22.16.0");
  assert.equal(pkg.scripts.start, "node dist/cli.js start");
  assert.equal(pkg.scripts.release, "npm run release:installer");
  assert.equal(pkg.scripts["release:installer"], "npm run build && node scripts/build-release.mjs");
  assert.ok(pkg.files.includes("dist/public"));
  assert.ok(pkg.files.includes("dist/src"));
  assert.ok(pkg.devDependencies.postject);
});

test("release packaging builds platform installers and no legacy command", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const script = readFileSync("scripts/build-release.mjs", "utf8");

  assert.match(workflow, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(workflow, /node-version: \[22\.x, 24\.x\]/);
  assert.match(workflow, /npm run release:installer/);
  assert.match(workflow, /artifacts\/release\/\*\.dmg/);
  assert.match(workflow, /artifacts\/release\/\*\.msi/);
  assert.match(script, /--build-sea|--experimental-sea-config/);
  assert.match(script, /postject/);
  assert.match(script, /args\.length === 0\) args\.push\("start"\)/);
  assert.match(script, /hdiutil/);
  assert.match(script, /AI-Index\.app/);
  assert.match(script, /wix/);
  assert.match(script, /\.msi/);
  assert.match(script, /execFileSync\(process\.execPath, \[postjectCli\(\), \.\.\.args\]/);
  assert.doesNotMatch(script, /postject\.cmd/);
  const legacyCommand = "ai-" + "todo";
  const legacyTitle = "AI-" + "Todo";
  const legacyEnvPrefix = "AI_" + "TODO";
  assert.doesNotMatch(`${workflow}\n${script}`, new RegExp(`${legacyCommand}|${legacyTitle}|${legacyEnvPrefix}`));
});

test("README documents installer-first release usage", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /ai-index-macos-arm64\.dmg/);
  assert.match(readme, /AI-Index\.app/);
  assert.match(readme, /ai-index-windows-x64\.msi/);
  assert.match(readme, /Start menu/);
  assert.match(readme, /npm package is not published yet/);
  assert.match(readme, /\$env:AI_INDEX_HOME = ".local\\ai-index"/);
});

test("release files exist", () => {
  assert.ok(existsSync("scripts/build-release.mjs"));
  assert.ok(existsSync(".github/workflows/ci.yml"));
});

test("server can serve static UI from an external release directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-index-public-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>AI-Index</title>");
  writeFileSync(join(dir, "assets", "app.js"), "console.log('ai-index');");

  const server = createAppServer({ publicDir: dir });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal(await (await fetch(`${base}/`)).text(), "<!doctype html><title>AI-Index</title>");
    assert.equal(await (await fetch(`${base}/assets/app.js`)).text(), "console.log('ai-index');");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
