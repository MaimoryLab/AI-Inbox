import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

describe("package scripts", () => {
  it("installs LangExtract Python dependencies during npm install", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.postinstall).toContain("requirements-langextract.txt");
  });
});
