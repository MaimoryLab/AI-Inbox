#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const appVersion = packageJson.version;
const artifactsDir = join(root, "artifacts", "release");
const workDir = join(root, "artifacts", "sea-build");
const platformName = { darwin: "macos", win32: "windows" }[process.platform];
const releaseName = platformName ? `ai-index-${platformName}-${process.arch}` : null;
const packageDir = releaseName ? join(artifactsDir, releaseName) : null;
const binaryName = process.platform === "win32" ? "ai-index.exe" : "ai-index";
const binaryPath = packageDir ? join(packageDir, binaryName) : "";
const seaNodePath = join(workDir, "node-runtime", binaryName);

if (!platformName || !packageDir) {
  throw new Error(`Installer packaging is supported on macOS and Windows only, not ${process.platform}.`);
}

if (!existsSync(join(root, "dist", "public", "index.html"))) {
  throw new Error("dist/public is missing; run npm run build first.");
}

rmSync(workDir, { recursive: true, force: true });
rmSync(packageDir, { recursive: true, force: true });
rmSync(join(artifactsDir, `${releaseName}.zip`), { force: true });
mkdirSync(workDir, { recursive: true });
mkdirSync(packageDir, { recursive: true });

const entry = join(workDir, "sea-entry.ts");
const bundle = join(workDir, "sea-bundle.cjs");
const cliImport = relative(workDir, join(root, "src", "cli.ts")).split(sep).join("/");
writeFileSync(entry, `
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const releasePublicDir = join(dirname(process.execPath), "public");
if (!process.env.AI_INDEX_PUBLIC_DIR && existsSync(releasePublicDir)) {
  process.env.AI_INDEX_PUBLIC_DIR = releasePublicDir;
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
copyFileSync(join(root, "README.md"), join(packageDir, "README.md"));
copyFileSync(join(root, "LICENSE"), join(packageDir, "LICENSE"));
await chmod(binaryPath, 0o755);

if (process.platform === "darwin") {
  const dmgPath = join(artifactsDir, `${releaseName}.dmg`);
  rmSync(dmgPath, { force: true });
  await buildMacDmg(dmgPath);
  console.log(`release dmg: ${dmgPath}`);
} else {
  const msiPath = join(artifactsDir, `${releaseName}.msi`);
  rmSync(msiPath, { force: true });
  buildWindowsMsi(msiPath);
  console.log(`release msi: ${msiPath}`);
}

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

async function buildMacDmg(dmgPath) {
  const appDir = join(artifactsDir, "AI-Index.app");
  const appRoot = join(appDir, "Contents");
  const macosDir = join(appRoot, "MacOS");
  const resourcesDir = join(appRoot, "Resources");
  const dmgRoot = join(workDir, "dmg-root");
  rmSync(appDir, { recursive: true, force: true });
  rmSync(dmgRoot, { recursive: true, force: true });
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });

  copyFileSync(binaryPath, join(resourcesDir, "ai-index"));
  await chmod(join(resourcesDir, "ai-index"), 0o755);
  cpSync(join(packageDir, "public"), join(resourcesDir, "public"), { recursive: true });
  copyFileSync(join(packageDir, "README.md"), join(resourcesDir, "README.md"));
  copyFileSync(join(packageDir, "LICENSE"), join(resourcesDir, "LICENSE"));
  writeFileSync(join(appRoot, "Info.plist"), macInfoPlist());

  const launcher = join(macosDir, "AI-Index");
  writeFileSync(launcher, `#!/bin/sh
APP_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec "$APP_ROOT/Resources/ai-index" start "$@"
`);
  await chmod(launcher, 0o755);

  runOptional("codesign", ["--force", "--deep", "--sign", "-", appDir]);
  mkdirSync(dmgRoot, { recursive: true });
  cpSync(appDir, join(dmgRoot, "AI-Index.app"), { recursive: true });
  copyFileSync(join(packageDir, "README.md"), join(dmgRoot, "README.md"));
  const sizeMb = Math.ceil(directorySizeBytes(dmgRoot) / 1024 / 1024) + 80;
  execFileSync("hdiutil", [
    "create",
    "-volname", `AI-Index ${appVersion}`,
    "-srcfolder", dmgRoot,
    "-ov",
    "-format", "UDZO",
    "-fs", "HFS+",
    "-size", `${sizeMb}m`,
    dmgPath
  ], { stdio: "inherit" });
}

function macInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>AI-Index</string>
  <key>CFBundleExecutable</key>
  <string>AI-Index</string>
  <key>CFBundleIdentifier</key>
  <string>lab.maimory.ai-index</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>AI-Index</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${xmlText(appVersion)}</string>
  <key>CFBundleVersion</key>
  <string>${xmlText(appVersion)}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

function buildWindowsMsi(msiPath) {
  const wxs = join(workDir, "ai-index.wxs");
  writeFileSync(wxs, windowsInstallerXml());
  execFileSync(wixBin(), ["build", wxs, "-arch", wixArch(), "-o", msiPath], { stdio: "inherit" });
}

function wixBin() {
  const wixDir = join(workDir, "wix");
  const wix = join(wixDir, process.platform === "win32" ? "wix.exe" : "wix");
  if (!existsSync(wix)) {
    mkdirSync(wixDir, { recursive: true });
    execFileSync("dotnet", ["tool", "install", "--tool-path", wixDir, "wix", "--version", process.env.AI_INDEX_WIX_VERSION ?? "5.0.2"], { stdio: "inherit" });
  }
  return wix;
}

function wixArch() {
  return process.arch === "arm64" ? "arm64" : "x64";
}

function windowsInstallerXml() {
  const files = collectFiles(packageDir);
  const tree = directoryTree(files);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Package Name="AI-Index" Manufacturer="MaimoryLab" Version="${xmlAttr(msiVersion(appVersion))}" UpgradeCode="${stableGuid("ai-index-upgrade-code")}" Scope="perUser">
    <MajorUpgrade DowngradeErrorMessage="A newer version of AI-Index is already installed." />
    <MediaTemplate EmbedCab="yes" />
    <StandardDirectory Id="LocalAppDataFolder">
      <Directory Id="ManufacturerFolder" Name="MaimoryLab">
        <Directory Id="INSTALLFOLDER" Name="AI-Index">
${renderDirectoryTree(tree, "          ")}
        </Directory>
      </Directory>
    </StandardDirectory>
    <StandardDirectory Id="ProgramMenuFolder">
      <Directory Id="ApplicationProgramsFolder" Name="AI-Index" />
    </StandardDirectory>
    <ComponentGroup Id="AppComponents">
${renderComponents(files)}
      <Component Id="StartMenuShortcutComponent" Directory="ApplicationProgramsFolder" Guid="${stableGuid("ai-index-start-menu-shortcut")}">
        <Shortcut Id="StartMenuShortcut" Name="AI-Index" Description="Start AI-Index" Target="[#AiIndexExe]" Arguments="start" WorkingDirectory="INSTALLFOLDER" />
        <RemoveFolder Id="RemoveApplicationProgramsFolder" On="uninstall" />
        <RegistryValue Root="HKCU" Key="Software\\MaimoryLab\\AI-Index" Name="installed" Type="integer" Value="1" KeyPath="yes" />
      </Component>
    </ComponentGroup>
    <Feature Id="MainFeature" Title="AI-Index" Level="1">
      <ComponentGroupRef Id="AppComponents" />
    </Feature>
  </Package>
</Wix>
`;
}

function collectFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(path, base);
    if (!entry.isFile()) return [];
    return [relative(base, path).split(sep).join("/")];
  }).sort();
}

function directorySizeBytes(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return total + directorySizeBytes(path);
    if (!entry.isFile()) return total;
    return total + statSync(path).size;
  }, 0);
}

function directoryTree(files) {
  const rootNode = { children: new Map() };
  for (const file of files) {
    const dirs = dirname(file) === "." ? [] : dirname(file).split("/");
    let node = rootNode;
    let current = "";
    for (const dir of dirs) {
      current = current ? `${current}/${dir}` : dir;
      if (!node.children.has(dir)) node.children.set(dir, { path: current, children: new Map() });
      node = node.children.get(dir);
    }
  }
  return rootNode;
}

function renderDirectoryTree(node, indent) {
  return [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => [
    `${indent}<Directory Id="${directoryId(child.path)}" Name="${xmlAttr(name)}">`,
    renderDirectoryTree(child, `${indent}  `),
    `${indent}</Directory>`
  ].filter(Boolean).join("\n")).join("\n");
}

function renderComponents(files) {
  const byDir = new Map();
  for (const file of files) {
    const dir = dirname(file) === "." ? "" : dirname(file);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(file);
  }

  return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, dirFiles]) => {
    const componentId = wixId("Cmp", dir || "root");
    const directory = dir ? directoryId(dir) : "INSTALLFOLDER";
    const guid = stableGuid(`ai-index-component:${dir || "root"}`);
    const body = dirFiles.sort().map((file, index) => {
      const fileId = file === binaryName ? "AiIndexExe" : wixId("File", file);
      const keyPath = index === 0 ? " KeyPath=\"yes\"" : "";
      return `        <File Id="${fileId}" Source="${xmlAttr(join(packageDir, ...file.split("/")))}"${keyPath} />`;
    }).join("\n");
    return `      <Component Id="${componentId}" Directory="${directory}" Guid="${guid}">
${body}
      </Component>`;
  }).join("\n");
}

function directoryId(dir) {
  return wixId("Dir", dir);
}

function wixId(prefix, value) {
  return `${prefix}_${createHash("sha1").update(value).digest("hex").slice(0, 16)}`;
}

function stableGuid(value) {
  const hex = createHash("sha1").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20, 32).join("")}`;
}

function msiVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`Package version must start with major.minor.patch for MSI: ${version}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function xmlAttr(value) {
  return xmlText(value).replace(/"/g, "&quot;");
}

function xmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function runOptional(command, args) {
  try {
    execFileSync(command, args, { stdio: "inherit" });
  } catch {
    // Signing tools are not guaranteed on local development machines.
  }
}
