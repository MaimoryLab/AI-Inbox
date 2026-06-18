import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];

let sandboxHome: string;

async function freshConfig() {
  vi.resetModules();
  return await import("../src/config.js");
}

describe("todo extractor user config", () => {
  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-todo-config-"));
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    delete process.env.LANGEXTRACT_API_KEY;
    delete process.env.LANGEXTRACT_MODEL;
  });

  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("writes only allowed LangExtract keys and never exposes the API key", async () => {
    const { getTodoExtractorUserConfig, getUserEnvPath, writeUserEnv } = await freshConfig();
    writeUserEnv({
      LANGEXTRACT_MODEL: "deepseek/deepseek-v4-pro",
      LANGEXTRACT_API_KEY: "secret",
      NOT_ALLOWED: "ignored",
    });

    const raw = readFileSync(getUserEnvPath(), "utf-8");
    expect(raw).toContain("LANGEXTRACT_MODEL=deepseek/deepseek-v4-pro");
    expect(raw).toContain("LANGEXTRACT_API_KEY=secret");
    expect(raw).not.toContain("NOT_ALLOWED");

    const cfg = getTodoExtractorUserConfig();
    expect(cfg.LANGEXTRACT_MODEL).toBe("deepseek/deepseek-v4-pro");
    expect(cfg.LANGEXTRACT_API_KEY_CONFIGURED).toBe(true);
    expect(cfg.LANGEXTRACT_API_KEY_MASKED).toBe("se****et");
    expect(cfg).not.toHaveProperty("LANGEXTRACT_API_KEY");
  });

  it("treats the old bundled model as unset and returns the current default", async () => {
    const { getTodoExtractorUserConfig, writeUserEnv } = await freshConfig();
    writeUserEnv({ LANGEXTRACT_MODEL: "pa/gpt-5.5" });

    expect(getTodoExtractorUserConfig().LANGEXTRACT_MODEL).toBe("deepseek/deepseek-v4-pro");
  });
});
