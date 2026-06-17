import { describe, it, expect } from "vitest";
import { mockKV } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";
import { buildTurnActionDrafts } from "../src/functions/action-candidates.js";

// PLAN-002 STEP-03: browser-capture turns -> action drafts, via the shared
// buildTurnActionDrafts used by both api::review-create and the viewer-server
// review fallback. Dedup keeps a browser session from minting duplicate todos.
const baseOpts = {
  now: new Date().toISOString(),
  source: "browser-sync" as const,
  page: { host: "chat.example.com" },
  basePayload: { viewerFallback: true },
};

describe("buildTurnActionDrafts (browser capture -> action drafts)", () => {
  it("builds a pending action draft from an actionable browser turn", async () => {
    const kv = mockKV();
    const drafts = await buildTurnActionDrafts(kv as never, {
      ...baseOpts,
      turns: [{ role: "user", text: "下一步请修复登录页的报错。" }],
    });
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts[0].kind).toBe("action");
    expect(drafts[0].source).toBe("browser-sync");
    expect(drafts[0].status).toBe("pending");
  });

  it("returns [] when there are no turns", async () => {
    const kv = mockKV();
    expect(await buildTurnActionDrafts(kv as never, { ...baseOpts, turns: [] })).toEqual([]);
  });

  it("dedups identical turns within one extraction", async () => {
    const kv = mockKV();
    const turn = { role: "user", text: "下一步请修复登录页的报错。" };
    const drafts = await buildTurnActionDrafts(kv as never, { ...baseOpts, turns: [turn, turn] });
    expect(drafts.length).toBe(1);
  });

  it("does not re-emit a draft whose candidate is already in the review queue", async () => {
    const kv = mockKV();
    const turns = [{ role: "user", text: "下一步请修复登录页的报错。" }];
    const first = await buildTurnActionDrafts(kv as never, { ...baseOpts, turns });
    expect(first.length).toBeGreaterThanOrEqual(1);
    for (const d of first) await kv.set(KV.reviewQueue, d.id, d);
    const second = await buildTurnActionDrafts(kv as never, { ...baseOpts, turns });
    expect(second).toEqual([]);
  });
});
