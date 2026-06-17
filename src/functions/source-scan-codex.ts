import { homedir } from "node:os";
import { join } from "node:path";
import { lstat } from "node:fs/promises";
import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import type { ScanCheckpoint, Source } from "../types.js";
import { KV, fingerprintId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import {
  MAX_FILES_DEFAULT,
  findJsonlFiles,
  ingestJsonlFile,
  isSensitive,
  isSymlink,
} from "./replay.js";
import { safeAudit } from "./audit.js";
import { logger } from "../logger.js";

const DEFAULT_CODEX_SOURCE_ID = "codex";

export interface CodexScanResult {
  success: true;
  sourceId: string;
  scanned: number;
  imported: number;
  skipped: number;
  errors: number;
  sessionIds: string[];
}

type FileState = { mtimeMs: number; size: number };

function expandHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

/** Both first-class Codex roots — the viewer already treats archived_sessions as source data. */
function codexRoots(home: string): string[] {
  return [join(home, "sessions"), join(home, "archived_sessions")];
}

async function getOrCreateSource(kv: StateKV, sourceId: string): Promise<Source> {
  const existing = await kv.get<Source>(KV.sources, sourceId);
  if (existing) return existing;
  const source: Source = {
    id: sourceId,
    type: "codex",
    name: "Codex sessions",
    pathOrUrl: join(homedir(), ".codex"),
    enabled: true,
  };
  await kv.set(KV.sources, sourceId, source);
  return source;
}

function parseCursor(cursor: string | undefined): Record<string, FileState> {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(cursor) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, FileState>) : {};
  } catch {
    return {};
  }
}

/**
 * Incrementally scan a Codex source. Unchanged files (same mtime + size as the
 * checkpoint) are skipped WITHOUT being read; new or grown files are ingested
 * through the shared `ingestJsonlFile` path. A file is recorded in the
 * checkpoint only on successful ingest, so a failed file stays absent and is
 * retried on the next scan. Serialized per source via `withKeyedLock` so two
 * concurrent scans (or a scan racing a manual import) can't clobber the
 * checkpoint.
 *
 * Correctness (no duplicate todos) is owned by the ingest/dedup layer; the
 * checkpoint exists only to avoid re-reading unchanged history.
 */
export async function scanCodexSource(
  kv: StateKV,
  opts: { sourceId?: string; path?: string } = {},
): Promise<CodexScanResult> {
  const sourceId = opts.sourceId ?? DEFAULT_CODEX_SOURCE_ID;
  return withKeyedLock(`source-scan:${sourceId}`, async () => {
    const source = await getOrCreateSource(kv, sourceId);
    const result: CodexScanResult = {
      success: true,
      sourceId,
      scanned: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
      sessionIds: [],
    };
    if (!source.enabled) return result;

    const roots = opts.path ? [expandHome(opts.path)] : codexRoots(source.pathOrUrl);

    const files: string[] = [];
    for (const root of roots) {
      try {
        const st = await lstat(root);
        if (!st.isDirectory()) continue;
      } catch {
        continue; // a root that doesn't exist is fine — just skip it
      }
      const found = await findJsonlFiles(root, MAX_FILES_DEFAULT);
      files.push(...found.files);
    }

    const checkpoint = await kv.get<ScanCheckpoint>(KV.scanCheckpoints, sourceId);
    const processed = parseCursor(checkpoint?.cursor);
    let lastError: string | undefined;

    for (const file of files) {
      result.scanned++;
      if (isSensitive(file)) continue;
      if (await isSymlink(file)) continue;

      let stat;
      try {
        stat = await lstat(file);
      } catch {
        continue;
      }

      const prev = processed[file];
      if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
        result.skipped++;
        continue; // unchanged — do NOT read it
      }

      try {
        // Path-derived fallback session id: a Codex file lacking session_meta.id
        // keeps a stable id across scans (a full-text hash would mint a new
        // session every time the transcript grows).
        const ingested = await ingestJsonlFile(kv, file, fingerprintId("codex-file", file));
        if (ingested) {
          result.imported++;
          result.sessionIds.push(ingested.sessionId);
        }
        // Record only on success so a failed file is retried next scan.
        processed[file] = { mtimeMs: stat.mtimeMs, size: stat.size };
      } catch (err) {
        result.errors++;
        lastError = `${file}: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn("source-scan: ingest failed", { sourceId, file, error: lastError });
      }
    }

    const now = new Date().toISOString();
    await kv.set(KV.scanCheckpoints, sourceId, {
      sourceId,
      cursor: JSON.stringify(processed),
      lastSuccessAt: now,
      lastError,
    });
    await kv.set(KV.sources, sourceId, { ...source, lastScannedAt: now });
    await safeAudit(kv, "import", "mem::source-scan::codex", result.sessionIds, {
      source: sourceId,
      scanned: result.scanned,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
    });

    return result;
  });
}

export function registerSourceScanFunctions(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::source-scan::codex",
    async (data: { sourceId?: string; path?: string }) => {
      const sourceId =
        typeof data?.sourceId === "string" && data.sourceId.length > 0 ? data.sourceId : undefined;
      const path = typeof data?.path === "string" && data.path.length > 0 ? data.path : undefined;
      return scanCodexSource(kv, { sourceId, path });
    },
  );
}
