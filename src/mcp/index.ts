import type { Database } from "../db/index.js";
import { getAppPaths, type AppPaths } from "../paths.js";
import { scanSource } from "../sources/scan.js";
import { organizeConfiguredTodos } from "../todos/configured.js";
import { listTodos, type OrganizeOptions, updateTodoStatus } from "../todos/service.js";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const LEGACY_TOOL_ALIASES: Record<string, string> = {
  todo_scan: "inbox_scan",
  todo_organize: "inbox_organize",
  todo_list: "inbox_list",
  todo_update: "inbox_update",
  todo_open: "inbox_open"
};

export function listMcpTools(): McpTool[] {
  return [
    {
      name: "inbox_scan",
      description: "Scan Codex, Claude Code, or Cursor local sessions into AI-Inbox.",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["codex", "claude-code", "cursor"] },
          path: { type: "string" }
        },
        required: ["source"]
      }
    },
    {
      name: "inbox_organize",
      description: "Organize observations into evidence-grounded inbox cards.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "inbox_list",
      description: "List current inbox cards.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "inbox_update",
      description: "Update an inbox card status.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["open", "done", "ignored"] }
        },
        required: ["id", "status"]
      }
    },
    {
      name: "inbox_open",
      description: "Open the AI-Inbox viewer when available.",
      inputSchema: { type: "object", properties: {} }
    }
  ];
}

export async function callMcpTool(
  db: Database,
  name: string,
  args: unknown,
  paths: AppPaths = getAppPaths(),
  options: { organizeOptions?: OrganizeOptions } = {}
): Promise<any> {
  const input = objectArgs(args);
  const legacyName = LEGACY_TOOL_ALIASES[name];
  const toolName = legacyName ?? name;

  if (toolName === "inbox_scan") {
    const scan = scanSource(db, input.source, input.path, paths);
    if (!scan.ok) throw new Error(scan.error === "unsupported_source" ? "unsupported source" : "path not found");
    return scan.result;
  }

  if (toolName === "inbox_organize") {
    return await organizeConfiguredTodos(db, paths, options.organizeOptions);
  }

  if (toolName === "inbox_list") {
    return listTodos(db);
  }

  if (toolName === "inbox_update") {
    if (typeof input.id !== "string" || !input.id) throw new Error("missing todo id");
    const status = legacyName && input.status === "todo" ? "todo" : input.status === "open" ? "todo" : input.status === "done" || input.status === "ignored" ? input.status : undefined;
    if (status !== "todo" && status !== "done" && status !== "ignored") throw new Error("invalid status");
    if (!updateTodoStatus(db, input.id, status)) throw new Error("todo not found");
    return listTodos(db).find((todo) => todo.id === input.id);
  }

  if (toolName === "inbox_open") {
    return { opened: false, message: "run ai-inbox start to start the local UI" };
  }

  throw new Error(`unknown tool: ${name}`);
}

function objectArgs(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : {};
}
