import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { makeLarkAdapter, _internal, type RunResult } from "../src/functions/lark-adapter.js";
import type { InboxItem } from "../src/types.js";
import type { LarkConfig } from "../src/config.js";

function q(over: Partial<InboxItem> = {}): InboxItem {
  return { id: "inbox_q1", kind: "question", body: "要不要给 `/admin/*` 加鉴权?", status: "awaiting", fromAgent: "auth", createdAt: "2026-06-15T10:00:00Z", ...over };
}
function b(over: Partial<InboxItem> = {}): InboxItem {
  return { id: "inbox_b1", kind: "briefing", body: "今天完成了 3 件", status: "awaiting", fromAgent: "line-d", createdAt: "2026-06-15T10:00:00Z", ...over };
}
const cfg: LarkConfig = { userId: "ou_target", urgentQuestion: true };

const okSend: RunResult = { code: 0, stdout: JSON.stringify({ data: { message_id: "om_123" } }), stderr: "" };
const okUrgent: RunResult = { code: 0, stdout: JSON.stringify({ data: {} }), stderr: "" };

describe("lark adapter (STEP-D2)", () => {
  it("question → interactive card argv, then urgent_app via stdin", async () => {
    const calls: { args: string[]; input?: string }[] = [];
    const runner = vi.fn(async (args: string[], input?: string): Promise<RunResult> => {
      calls.push({ args, input });
      return args.includes("urgent_app") ? okUrgent : okSend;
    });
    const deliver = makeLarkAdapter(runner);
    const out = await deliver(q(), cfg);

    expect(out.ok).toBe(true);
    expect(out.messageId).toBe("om_123");
    expect(out.urgent).toBe(true);

    // send call: interactive, --content is a JSON string arg (NOT stdin), no `-`
    const send = calls[0];
    expect(send.args).toContain("+messages-send");
    expect(send.args).toContain("--msg-type");
    expect(send.args).toContain("interactive");
    const ci = send.args.indexOf("--content");
    expect(ci).toBeGreaterThan(-1);
    expect(send.args[ci + 1]).not.toBe("-"); // content is inline JSON, not stdin
    expect(() => JSON.parse(send.args[ci + 1])).not.toThrow();
    expect(send.args).toContain("--idempotency-key");
    expect(send.input).toBeUndefined(); // send does not use stdin

    // urgent call: uses --data - + stdin body with user_id_list
    const urgent = calls[1];
    expect(urgent.args).toContain("urgent_app");
    expect(urgent.args).toContain("--data");
    expect(urgent.args).toContain("-");
    expect(JSON.parse(urgent.input!)).toEqual({ user_id_list: ["ou_target"] });
  });

  it("briefing → --markdown (CLI wraps as post), no urgent call", async () => {
    const calls: { args: string[] }[] = [];
    const runner = vi.fn(async (args: string[]): Promise<RunResult> => {
      calls.push({ args });
      return okSend;
    });
    const deliver = makeLarkAdapter(runner);
    const out = await deliver(b(), cfg);

    expect(out.ok).toBe(true);
    expect(out.urgent).toBe(false);
    expect(calls).toHaveLength(1); // no urgent for briefing
    expect(calls[0].args).toContain("--markdown");
    expect(calls[0].args).not.toContain("interactive");
  });

  it("urgent failure degrades to sent-without-urgency (still ok)", async () => {
    const runner = vi.fn(async (args: string[]): Promise<RunResult> => {
      if (args.includes("urgent_app")) return { code: 1, stdout: "", stderr: JSON.stringify({ error: { message: "missing scope im:message.urgent" } }) };
      return okSend;
    });
    const out = await makeLarkAdapter(runner)(q(), cfg);
    expect(out.ok).toBe(true); // delivery still succeeded
    expect(out.urgent).toBe(false); // just not urgent
    expect(out.messageId).toBe("om_123");
  });

  it("urgentQuestion=false → no urgent call", async () => {
    const calls: string[][] = [];
    const runner = vi.fn(async (args: string[]): Promise<RunResult> => { calls.push(args); return okSend; });
    const out = await makeLarkAdapter(runner)(q(), { userId: "ou_target", urgentQuestion: false });
    expect(out.ok).toBe(true);
    expect(out.urgent).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("send non-zero exit → ok:false with error summary", async () => {
    const runner = vi.fn(async (): Promise<RunResult> => ({ code: 1, stdout: "", stderr: JSON.stringify({ error: { type: "validation", message: "bad open_id" } }) }));
    const out = await makeLarkAdapter(runner)(q(), cfg);
    expect(out.ok).toBe(false);
    expect(out.error).toContain("bad open_id");
  });

  it("send ok but no message_id → ok:false", async () => {
    const runner = vi.fn(async (): Promise<RunResult> => ({ code: 0, stdout: JSON.stringify({ data: {} }), stderr: "" }));
    const out = await makeLarkAdapter(runner)(q(), cfg);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no message_id/);
  });

  it("runner throws → ok:false, never propagates", async () => {
    const runner = vi.fn(async (): Promise<RunResult> => { throw new Error("ENOENT lark-cli"); });
    const out = await makeLarkAdapter(runner)(q(), cfg);
    expect(out.ok).toBe(false);
    expect(out.error).toContain("ENOENT");
  });

  it("errorSummary prefers structured envelope, falls back to stderr text", () => {
    expect(_internal.errorSummary({ code: 1, stdout: "", stderr: JSON.stringify({ error: { message: "X" } }) })).toBe("X");
    expect(_internal.errorSummary({ code: 2, stdout: "", stderr: "plain boom" })).toBe("plain boom");
    expect(_internal.errorSummary({ code: 3, stdout: "", stderr: "" })).toContain("code 3");
  });

  it("question card is valid JSON with title + workbench button url", () => {
    const card = JSON.parse(_internal.questionCard(q()));
    expect(card.header.title.content).toContain("Agent 在等你回");
    const flat = JSON.stringify(card);
    expect(flat).toContain("去工作台回应");
    expect(flat).toContain("#actions");
  });
});
