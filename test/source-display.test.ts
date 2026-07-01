import assert from "node:assert/strict";
import test from "node:test";
import { sourceDisplayText } from "../src/web/src/components/observation-text.js";

test("sourceDisplayText hides local attachment paths", () => {
  assert.equal(
    sourceDisplayText("Image: Image #1 (/var/folders/demo/codex-clipboard.png)"),
    "Image: Image #1"
  );
  assert.equal(
    sourceDisplayText("Files mentioned: brief.md (/Users/ppio/Documents/brief.md)"),
    "File: brief.md"
  );
  assert.equal(
    sourceDisplayText("File: notes.md (~/Downloads/notes.md)"),
    "File: notes.md"
  );
  assert.equal(
    sourceDisplayText("Image: screenshot (C:\\Users\\ppio\\AppData\\Local\\Temp\\screenshot.png)"),
    "Image: screenshot"
  );
});

test("sourceDisplayText preserves non-attachment text", () => {
  const text = [
    "Use /var/tmp/cache in the example.",
    "",
    "```",
    "Image: Image #1 (/var/folders/demo/codex-clipboard.png)",
    "```",
    "Link: https://example.com/image.png"
  ].join("\n");

  assert.equal(sourceDisplayText(text), text);
});
