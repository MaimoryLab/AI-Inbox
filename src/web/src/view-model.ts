import type { SourceKind } from "./types.js";

export type View = "todos" | "sources" | "settings";
export type SourceFilter = SourceKind | "all";
export type SessionSource = Extract<SourceKind, "codex" | "claude-code" | "cursor">;
export type SourceScanResult = { warning?: string };
