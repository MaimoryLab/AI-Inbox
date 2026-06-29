import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Database } from "../db/index.js";
import { ingestBrowserSession } from "../sources/browser.js";
import { listTodos, organizeTodos } from "../todos/service.js";

export function createAppServer(options: { db?: Database } = {}) {
  return createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/browser/sessions") {
      if (!options.db) {
        writeJson(res, 503, { error: "database_unavailable" });
        return;
      }
      const body = await readJson(req);
      writeJson(res, 200, ingestBrowserSession(options.db, body));
      return;
    }

    if (req.method === "POST" && req.url === "/todos/organize") {
      if (!options.db) {
        writeJson(res, 503, { error: "database_unavailable" });
        return;
      }
      writeJson(res, 200, organizeTodos(options.db));
      return;
    }

    if (req.method === "GET" && req.url === "/todos") {
      if (!options.db) {
        writeJson(res, 503, { error: "database_unavailable" });
        return;
      }
      writeJson(res, 200, listTodos(options.db));
      return;
    }

    writeJson(res, 404, { error: "not_found" });
  });
}

function writeJson(res: ServerResponse<IncomingMessage>, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
