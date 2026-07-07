#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const appVersion = packageJson.version;
const artifactsDir = join(root, "artifacts", "release");
const workDir = join(root, "artifacts", "sea-build");
const managedLlmConfigName = "managed-llm.json";
const managedLlmEndpoint = "https://api.novita.ai/openai/v1";
const managedLlmModel = "deepseek/deepseek-v4-flash";
const platformName = { darwin: "macos", win32: "windows" }[process.platform];
const releaseName = platformName ? `ai-inbox-${platformName}-${process.arch}` : null;
const packageDir = releaseName ? join(artifactsDir, releaseName) : null;
const binaryName = process.platform === "win32" ? "ai-inbox.exe" : "ai-inbox";
const binaryPath = packageDir ? join(packageDir, binaryName) : "";
const seaNodePath = join(workDir, "node-runtime", binaryName);

if (!platformName || !packageDir) {
  throw new Error(`Release zip packaging is supported on macOS and Windows only, not ${process.platform}.`);
}

if (!existsSync(join(root, "dist", "public", "index.html"))) {
  throw new Error("dist/public is missing; run npm run build first.");
}

rmSync(workDir, { recursive: true, force: true });
rmSync(artifactsDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
mkdirSync(packageDir, { recursive: true });

const entry = join(workDir, "sea-entry.ts");
const bundle = join(workDir, "sea-bundle.cjs");
const cliImport = relative(workDir, join(root, "src", "cli.ts")).split(sep).join("/");
writeFileSync(entry, `
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const releasePublicDir = join(dirname(process.execPath), "public");
if (!process.env.AI_INBOX_PUBLIC_DIR && existsSync(releasePublicDir)) {
  process.env.AI_INBOX_PUBLIC_DIR = releasePublicDir;
}

const args = process.argv.slice(2);
if (args.length === 0) args.push("start");

void import("${cliImport.startsWith(".") ? cliImport : `./${cliImport}`}").then(async ({ main }) => {
  process.exitCode = await main(args);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
`);

await build({
  entryPoints: [entry],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22.16",
  define: { "import.meta.url": "undefined" },
  banner: { js: "#!/usr/bin/env node" }
});

await buildSeaExecutable(bundle, binaryPath);
cpSync(join(root, "dist", "public"), join(packageDir, "public"), { recursive: true });
cpSync(join(root, "browser-extension"), join(packageDir, "browser-extension"), { recursive: true });
copyFileSync(join(root, "README.md"), join(packageDir, "README.md"));
copyFileSync(join(root, "LICENSE"), join(packageDir, "LICENSE"));
writeManagedLlmConfig();
await chmod(binaryPath, 0o755);

const zipPath = join(artifactsDir, `${releaseName}.zip`);
buildReleaseZip(zipPath);
assertCleanZip(zipPath);
console.log(`release zip: ${zipPath}`);

async function buildSeaExecutable(main, output) {
  const seaConfig = join(workDir, "sea-config.json");
  const blob = join(workDir, process.platform === "win32" ? "sea-prep.blob.exe" : "sea-prep.blob");
  writeFileSync(seaConfig, JSON.stringify({
    main,
    mainFormat: "commonjs",
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false
  }, null, 2));
  execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });
  copyFileSync(seaCapableNode(), output);
  if (process.platform === "darwin") runOptional("codesign", ["--remove-signature", output]);
  const postjectArgs = [
    output,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
  ];
  if (process.platform === "darwin") postjectArgs.push("--macho-segment-name", "NODE_SEA");
  runPostject(postjectArgs);
  if (process.platform === "darwin") runOptional("codesign", ["--sign", "-", output]);
}

function runPostject(args) {
  execFileSync(process.execPath, [postjectCli(), ...args], { stdio: "inherit" });
}

function postjectCli() {
  return join(root, "node_modules", "postject", "dist", "cli.js");
}

function seaCapableNode() {
  if (hasSeaSentinel(process.execPath)) return process.execPath;
  if (process.env.CI) throw new Error("Current Node binary cannot be injected as a SEA executable.");
  return downloadOfficialNode();
}

function hasSeaSentinel(file) {
  try {
    return readFileSync(file).includes("NODE_SEA_FUSE");
  } catch {
    return false;
  }
}

function downloadOfficialNode() {
  const platform = { darwin: "darwin", win32: "win" }[process.platform];
  if (!platform) throw new Error(`Unsupported release platform: ${process.platform}`);
  const ext = process.platform === "win32" ? "zip" : "tar.gz";
  const archive = `node-${process.version}-${platform}-${process.arch}.${ext}`;
  const url = `https://nodejs.org/dist/${process.version}/${archive}`;
  const runtimeDir = dirname(seaNodePath);
  mkdirSync(runtimeDir, { recursive: true });
  const archivePath = join(workDir, archive);
  console.log(`downloading Node runtime for SEA: ${url}`);
  if (process.platform === "win32") {
    execFileSync("powershell", ["-NoProfile", "-Command", `Invoke-WebRequest -Uri ${JSON.stringify(url)} -OutFile ${JSON.stringify(archivePath)}`], { stdio: "inherit" });
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Path ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(runtimeDir)} -Force`], { stdio: "inherit" });
  } else {
    execFileSync("curl", ["-L", "-o", archivePath, url], { stdio: "inherit" });
    execFileSync("tar", ["-xzf", archivePath, "-C", runtimeDir, "--strip-components=1"], { stdio: "inherit" });
  }
  const node = process.platform === "win32" ? join(runtimeDir, "node.exe") : join(runtimeDir, "bin", "node");
  if (!hasSeaSentinel(node)) throw new Error("Downloaded Node runtime cannot be injected as a SEA executable.");
  return node;
}

function buildReleaseZip(zipPath) {
  if (process.platform === "win32") {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path ${JSON.stringify(packageDir)} -DestinationPath ${JSON.stringify(zipPath)} -Force`
    ], { stdio: "inherit" });
    return;
  }
  execFileSync("ditto", ["-c", "-k", "--norsrc", "--keepParent", packageDir, zipPath], {
    stdio: "inherit",
    env: { ...process.env, COPYFILE_DISABLE: "1" }
  });
}

function writeManagedLlmConfig() {
  const apiKeys = parseManagedKeys(process.env.AI_INBOX_MANAGED_LLM_API_KEYS ?? process.env.AI_INBOX_MANAGED_LLM_API_KEY);
  if (apiKeys.length === 0) return;
  writeFileSync(join(packageDir, managedLlmConfigName), `${JSON.stringify({
    endpoint: managedLlmEndpoint,
    model: managedLlmModel,
    apiKeys,
    createdAt: new Date().toISOString()
  }, null, 2)}\n`);
}

function parseManagedKeys(value) {
  if (!value) return [];
  return String(value).split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
}

function assertCleanZip(zipPath) {
  const forbiddenReleaseEntryPatterns = [
    /(^|\/)\._/,
    /(^|\/)\.DS_Store$/,
    /(^|\/)\.env$/,
    /(^|\/)data\//,
    /(^|\/)node_modules\//,
    /(^|\/)\.ai-inbox\//,
    /(^|\/)\.ai-todo\//
  ];
  const badEntries = listZipEntries(zipPath).filter((entry) =>
    forbiddenReleaseEntryPatterns.some((pattern) => pattern.test(entry))
  );
  if (badEntries.length > 0) {
    throw new Error(`release zip contains forbidden entries: ${badEntries.slice(0, 5).join(", ")}`);
  }
}

function listZipEntries(zipPath) {
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
      `[System.IO.Compression.ZipFile]::OpenRead(${JSON.stringify(zipPath)}).Entries | ForEach-Object { $_.FullName }`
    ].join(" ");
    return execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  }
  return execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

function runOptional(command, args) {
  try {
    execFileSync(command, args, { stdio: "inherit" });
  } catch {
    // Signing tools are not guaranteed on local development machines.
  }
}
