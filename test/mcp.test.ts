import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase } from "../src/db/index.js";
import { getAppPaths } from "../src/paths.js";
import { callMcpTool, listMcpTools } from "../src/mcp/index.js";
import { handleJsonRpcLine } from "../src/mcp/stdio.js";

test("MCP exposes the minimal todo tools", () => {
  assert.deepEqual(listMcpTools().map((tool) => tool.name), [
    "todo_scan",
    "todo_organize",
    "todo_list",
    "todo_update",
    "todo_open"
  ]);
});

test("MCP tools scan, organize, list, update, and open", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-mcp-"));
  try {
    const sessions = join(dir, "codex");
    mkdirSync(sessions);
    writeFileSync(join(sessions, "session.jsonl"), [
      JSON.stringify({ role: "user", text: "Please add MCP tool support" })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    const scan = await callMcpTool(db, "todo_scan", { source: "codex", path: sessions });
    assert.equal(scan.source, "codex");
    assert.equal(scan.scanned, 1);

    const organize = await callMcpTool(db, "todo_organize", {});
    assert.equal(organize.created, 1);

    const listed = await callMcpTool(db, "todo_list", {});
    assert.equal(listed.length, 1);

    const updated = await callMcpTool(db, "todo_update", { id: listed[0].id, status: "done" });
    assert.equal(updated.status, "done");

    const open = await callMcpTool(db, "todo_open", {});
    db.close();
    assert.deepEqual(open, { opened: false, message: "ai-todo viewer is not implemented yet" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MCP tools return small explicit errors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-mcp-errors-"));
  try {
    const db = openDatabase(getAppPaths(join(dir, "home")));
    await assert.rejects(() => callMcpTool(db, "missing", {}), /unknown tool/);
    await assert.rejects(() => callMcpTool(db, "todo_scan", { source: "browser" }), /unsupported source/);
    await assert.rejects(() => callMcpTool(db, "todo_update", { id: "missing", status: "todo" }), /invalid status/);
    await assert.rejects(() => callMcpTool(db, "todo_update", { id: "missing", status: "done" }), /todo not found/);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MCP JSON-RPC handles list, call, and errors", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-todo-mcp-rpc-"));
  try {
    const db = openDatabase(getAppPaths(join(dir, "home")));
    const list = await handleJsonRpcLine(db, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as any;
    assert.equal(list.result.tools.length, 5);

    const call = await handleJsonRpcLine(db, JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "todo_open", arguments: {} }
    })) as any;
    assert.equal(JSON.parse(call.result.content[0].text).opened, false);

    const unknown = await handleJsonRpcLine(db, JSON.stringify({ jsonrpc: "2.0", id: 3, method: "missing" })) as any;
    assert.equal(unknown.error.code, -32601);

    const bad = await handleJsonRpcLine(db, "{") as any;
    db.close();
    assert.equal(bad.error.code, -32700);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
