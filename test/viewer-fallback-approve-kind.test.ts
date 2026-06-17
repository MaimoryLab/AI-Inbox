import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The viewer-server review-approve fallback must branch on the approved kind
// so that action items become Actions (KV.actions), not Memories — parity with
// api::review-approve. It previously funneled every approval (including
// kind: "action") into KV.memories, so approved actions never reached the
// workbench.
describe("viewer fallback approve respects kind: action", () => {
  const server = readFileSync("src/viewer/server.ts", "utf-8");

  it("branches on the approved kind", () => {
    expect(server).toMatch(/const approvedKind\s*=/);
    expect(server).toMatch(/approvedKind === "action"/);
  });

  it("writes approved actions to KV.actions with action-create defaults", () => {
    expect(server).toMatch(/kv\.set\(KV\.actions, action\.id, action\)/);
    expect(server).toMatch(/createdBy: "review"/);
    expect(server).toMatch(/status: actionStatus/);
    // priority stays clamped to the 1..10 action range
    expect(server).toMatch(/Math\.max\(1, Math\.min\(10/);
  });
});
