import { execFile } from "node:child_process";
import type { InboxItem } from "../types.js";
import type { LarkConfig } from "../config.js";
import { logger } from "../logger.js";

// Line D / STEP-D2 — lark-cli adapter. Turns an InboxItem into a Feishu
// message via `execFile("lark-cli", ...)` (no shell, argv array — safe per
// lark-shared rules). Never throws; any failure → { ok:false, error }.
//
// Verified lark-cli behaviors this is built on (dry-run + real send):
//   - `--content -` (stdin) is REJECTED ("--content is not valid JSON: -").
//     So message body goes as an argv arg: --content JSON.stringify(content).
//   - `--markdown X` is wrapped by the CLI as msg_type=post (NOT text).
//   - `--msg-type interactive --content '<card-json>'` works for cards.
//   - urgent_app DOES accept `--data -` (stdin); we use stdin there.
//   - a local proxy (HTTPS_PROXY=127.0.0.1:7890) triggers a lark-cli warning;
//     we set LARK_CLI_NO_PROXY=1 + strip proxy env so creds/messages don't
//     traverse the local proxy.

export interface DeliveryOutcome {
  ok: boolean;
  messageId?: string;
  urgent?: boolean;
  error?: string;
}

export type LarkDeliverFn = (
  item: InboxItem,
  config: LarkConfig,
) => Promise<DeliveryOutcome>;

const VIEWER_ACTIONS_URL = "http://127.0.0.1:3114/#actions";
const CLI = "lark-cli";
const SEND_TIMEOUT_MS = 8000;
const URGENT_TIMEOUT_MS = 6000;

// Injectable runner so tests can mock execFile without spawning lark-cli.
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type CliRunner = (
  args: string[],
  input?: string,
) => Promise<RunResult>;

const realRunner: CliRunner = (args, input) =>
  new Promise((resolveRun) => {
    const env = { ...process.env, LARK_CLI_NO_PROXY: "1" };
    // Strip proxy env so the CLI's own HTTP client goes direct to Feishu.
    delete env["HTTPS_PROXY"];
    delete env["HTTP_PROXY"];
    delete env["ALL_PROXY"];
    delete env["https_proxy"];
    delete env["http_proxy"];
    delete env["all_proxy"];
    const child = execFile(
      CLI,
      args,
      { env, timeout: SEND_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code: number }).code)
            : err
              ? 1
              : 0;
        resolveRun({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      },
    );
    if (input !== undefined) {
      child.stdin?.end(input);
    }
  });

// ---- message construction ----

function questionCard(item: InboxItem): string {
  const from = item.fromAgent ? `\n\n*来自 ${item.fromAgent}*` : "";
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: "red",
      title: { tag: "plain_text", content: "🔴 Agent 在等你回" },
    },
    elements: [
      { tag: "div", text: { tag: "lark_md", content: item.body + from } },
      { tag: "hr" },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "去工作台回应 →" },
            type: "primary",
            url: VIEWER_ACTIONS_URL,
          },
        ],
      },
      {
        tag: "note",
        elements: [
          { tag: "plain_text", content: "直接回复将回答这条;多条待答请去工作台" },
        ],
      },
    ],
  };
  return JSON.stringify(card);
}

function briefingMarkdown(item: InboxItem): string {
  const from = item.fromAgent ? `\n\n*来自 ${item.fromAgent}*` : "";
  return `**📋 Agent 整理**\n\n${item.body}${from}\n\n[看详情 →](${VIEWER_ACTIONS_URL})`;
}

function parseMessageId(stdout: string): string | undefined {
  try {
    const j = JSON.parse(stdout);
    return j?.data?.message_id ?? j?.message_id ?? undefined;
  } catch {
    return undefined;
  }
}

function errorSummary(r: RunResult): string {
  // Prefer the CLI's structured error envelope; fall back to a trimmed stderr.
  const raw = r.stderr || r.stdout;
  try {
    const j = JSON.parse(raw);
    if (j?.error?.message) return String(j.error.message);
    if (j?.error?.type) return String(j.error.type);
  } catch {
    /* not JSON */
  }
  const trimmed = raw.trim().slice(0, 200);
  return trimmed || `lark-cli exited with code ${r.code}`;
}

export function makeLarkAdapter(runner: CliRunner = realRunner): LarkDeliverFn {
  return async (item, config) => {
    try {
      const sendArgs =
        item.kind === "question"
          ? [
              "im",
              "+messages-send",
              "--as",
              "bot",
              "--user-id",
              config.userId,
              "--msg-type",
              "interactive",
              "--content",
              questionCard(item),
              "--idempotency-key",
              item.id,
              "--json",
            ]
          : [
              "im",
              "+messages-send",
              "--as",
              "bot",
              "--user-id",
              config.userId,
              "--markdown",
              briefingMarkdown(item),
              "--idempotency-key",
              item.id,
              "--json",
            ];

      const sent = await runner(sendArgs);
      if (sent.code !== 0) {
        return { ok: false, error: errorSummary(sent) };
      }
      const messageId = parseMessageId(sent.stdout);
      if (!messageId) {
        return { ok: false, error: "send ok but no message_id in response" };
      }

      // question + urgent enabled → fire urgent_app (best-effort; failure
      // degrades to "sent without urgency", not a delivery failure).
      let urgent = false;
      if (item.kind === "question" && config.urgentQuestion) {
        urgent = await tryUrgent(runner, messageId, config.userId);
      }

      return { ok: true, messageId, urgent };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
}

async function tryUrgent(
  runner: CliRunner,
  messageId: string,
  userId: string,
): Promise<boolean> {
  try {
    const params = JSON.stringify({ message_id: messageId, user_id_type: "open_id" });
    const body = JSON.stringify({ user_id_list: [userId] });
    const r = await runner(
      [
        "im",
        "messages",
        "urgent_app",
        "--as",
        "bot",
        "--params",
        params,
        "--data",
        "-",
        "--json",
      ],
      body, // stdin (urgent_app DOES accept --data -)
    );
    if (r.code !== 0) {
      logger.warn("lark urgent_app failed (degrading to non-urgent)", {
        messageId,
        error: errorSummary(r),
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("lark urgent_app threw (degrading to non-urgent)", {
      messageId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// Default adapter wired into mem::inbox-deliver (D1's injection point).
export const deliverViaLark: LarkDeliverFn = makeLarkAdapter();

// Exported for tests.
export const _internal = {
  questionCard,
  briefingMarkdown,
  parseMessageId,
  errorSummary,
  URGENT_TIMEOUT_MS,
};
