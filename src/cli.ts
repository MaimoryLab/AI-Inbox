#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import type { Database } from "./db/index.js";
import { openDatabase } from "./db/index.js";
import { getAppPaths } from "./paths.js";
import { scanSource } from "./sources/scan.js";
import { listTodos, organizeTodos, updateTodoStatus } from "./todos/service.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const command = argv[0] ?? "doctor";

  if (command === "doctor") {
    const paths = getAppPaths();
    mkdirSync(paths.configDir, { recursive: true });
    mkdirSync(paths.dataDir, { recursive: true });
    openDatabase(paths).close();
    console.log(`config: ${paths.configDir}`);
    console.log(`data: ${paths.dataDir}`);
    console.log("ok");
    return 0;
  }

  if (command === "scan") {
    return withDatabase((db) => scan(db, argv[1], argv[2]));
  }

  if (command === "organize") {
    return withDatabase((db) => {
      const result = organizeTodos(db);
      console.log(`scanned: ${result.scanned}`);
      console.log(`created: ${result.created}`);
      console.log(`updated: ${result.updated}`);
      console.log(`completed: ${result.completed}`);
      console.log(`ignored: ${result.ignored}`);
      console.log(`engine: ${result.engine}`);
      return 0;
    });
  }

  if (command === "list") {
    return withDatabase((db) => {
      const todos = listTodos(db);
      if (todos.length === 0) {
        console.log("No todos");
        return 0;
      }
      for (const todo of todos) {
        console.log(`${todo.id} ${todo.status} ${todo.title}`);
      }
      return 0;
    });
  }

  if (command === "done" || command === "ignore") {
    return withDatabase((db) => updateStatus(db, argv[1], command === "done" ? "done" : "ignored"));
  }

  if (command === "open") {
    console.log("ai-todo viewer is not implemented yet");
    return 0;
  }

  console.error(`unknown command: ${command}`);
  return 1;
}

function withDatabase(fn: (db: Database) => number): number {
  const db = openDatabase(getAppPaths());
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function scan(db: Database, source: string | undefined, path: string | undefined): number {
  if (!source) {
    console.error("usage: ai-todo scan <codex|claude-code> [path]");
    return 1;
  }

  const scan = scanSource(db, source, path);
  if (!scan.ok && scan.error === "unsupported_source") {
    console.error(`unsupported source: ${source}`);
    return 1;
  }
  if (!scan.ok) {
    console.error(`path not found for ${source}`);
    return 1;
  }

  const result = scan.result;
  console.log(`source: ${result.source}`);
  console.log(`scanned: ${result.scanned}`);
  console.log(`observations: ${result.observations}`);
  console.log(`skipped: ${result.skipped}`);
  return 0;
}

function updateStatus(db: Database, id: string | undefined, status: "done" | "ignored"): number {
  if (!id) {
    console.error("missing todo id");
    return 1;
  }
  if (!updateTodoStatus(db, id, status)) {
    console.error(`todo not found: ${id}`);
    return 1;
  }
  console.log(`${status}: ${id}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
