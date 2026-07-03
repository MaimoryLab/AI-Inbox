import assert from "node:assert/strict";
import test from "node:test";
import { CLI_COMMANDS, HTTP_ROUTES, MCP_TOOLS } from "../src/contracts.js";

test("public contracts expose only ai-inbox and todo tool names", () => {
  const text = [
    ...CLI_COMMANDS,
    ...HTTP_ROUTES,
    ...MCP_TOOLS
  ].join("\n");

  assert.match(text, /ai-inbox/);
  assert.match(text, /todo_organize/);
  assert.doesNotMatch(text, /agentmemory-lab|iii-engine|memory_/);
});
