import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, fingerprintId, generateId } from "../state/schema.js";
import type { Action, CompressedObservation, ReviewQueueItem, ScanCheckpoint, Session } from "../types.js";
import { getEnvVar } from "../config.js";
import {
  extractActionCandidatesFromObservations,
  type ActionCandidate,
} from "./action-candidates.js";

type TimeBucket = "current" | "recent" | "history";
type TypeBucket = "pending" | "to_start" | "follow_up" | "in_progress" | "done" | "processing";

export interface ExtractedTodo {
  title: string;
  description: string;
  confidence: number;
  timeBucket: TimeBucket;
  typeBucket: TypeBucket;
  sourceSessionId: string;
  evidence: {
    sourceObservationId: string;
    quote: string;
    charStart?: number;
    charEnd?: number;
  };
  dedupeKey: string;
}

type ObservationBlock = {
  sourceObservationId: string;
  timestamp: string;
  type: string;
  title: string;
  text: string;
};

type TodoExtractOptions = {
  maxSessions?: number;
  maxObservationsPerSession?: number;
  project?: string;
  force?: boolean;
};

const TIME_BUCKETS = new Set(["current", "recent", "history"]);
const TYPE_BUCKETS = new Set(["pending", "to_start", "follow_up", "in_progress", "done", "processing"]);
const SIDE_CAR = "todo-extract-langextract.py";

function envNumber(key: string, fallback: number): number {
  const parsed = Number(getEnvVar(key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function normalizeText(value: string | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedKey(value: string): string {
  return normalizeText(value).toLowerCase().replace(/[，。！？；：,.!?;:]/g, "").replace(/\s+/g, " ");
}

function sessionSortTime(session: Session): string {
  return session.endedAt || session.startedAt || "";
}

function timeBucketFor(session: Session, now = Date.now()): TimeBucket {
  if (session.status === "active") return "current";
  const raw = session.endedAt || session.startedAt;
  const at = raw ? new Date(raw).getTime() : 0;
  if (!Number.isFinite(at) || at <= 0) return "recent";
  const ageMs = now - at;
  if (ageMs <= 24 * 60 * 60 * 1000) return "current";
  if (ageMs <= 14 * 24 * 60 * 60 * 1000) return "recent";
  return "history";
}

function actionStatusFor(typeBucket: TypeBucket): Action["status"] {
  if (typeBucket === "done") return "done";
  if (typeBucket === "in_progress" || typeBucket === "processing") return "active";
  return "pending";
}

function textForObservation(obs: CompressedObservation): string {
  return normalizeText([obs.narrative, ...(obs.facts || []), obs.subtitle].filter(Boolean).join("\n"));
}

function blockFor(obs: CompressedObservation): ObservationBlock {
  return {
    sourceObservationId: obs.id,
    timestamp: obs.timestamp || "",
    type: obs.type,
    title: obs.title || "",
    text: textForObservation(obs),
  };
}

function sidecarPath(): string | null {
  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(base, SIDE_CAR),
    join(base, "functions", SIDE_CAR),
    join(base, "..", "src", "functions", SIDE_CAR),
    join(base, "..", "functions", SIDE_CAR),
    resolve(process.cwd(), "src", "functions", SIDE_CAR),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

export async function runLangExtractSidecar(
  input: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<ExtractedTodo[]> {
  const script = sidecarPath();
  if (!script) throw new Error("langextract sidecar not found");
  const python = getEnvVar("LANGEXTRACT_PYTHON") || "python3";
  const timeoutMs = opts.timeoutMs ?? envNumber("AGENTMEMORY_TODO_EXTRACT_TIMEOUT_MS", 30_000);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(python, [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("langextract sidecar timed out"));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `langextract sidecar exited ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { todos?: unknown };
        resolvePromise(Array.isArray(parsed.todos) ? parsed.todos as ExtractedTodo[] : []);
      } catch (err) {
        reject(err);
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function toTypeBucket(reason: ActionCandidate["reason"]): TypeBucket {
  if (reason === "follow_up") return "follow_up";
  if (reason === "command_failed" || reason === "validation_failed") return "processing";
  return "pending";
}

function candidateToTodo(candidate: ActionCandidate, session: Session, bucket: TimeBucket): ExtractedTodo | null {
  const obsId = candidate.sourceObservationIds[0];
  if (!obsId) return null;
  return {
    title: candidate.title,
    description: candidate.description,
    confidence: candidate.confidence,
    timeBucket: bucket,
    typeBucket: toTypeBucket(candidate.reason),
    sourceSessionId: session.id,
    evidence: {
      sourceObservationId: obsId,
      quote: candidate.description,
    },
    dedupeKey: normalizedKey(candidate.duplicateHint || `${candidate.title}:${candidate.description}`),
  };
}

function safeTodo(raw: ExtractedTodo, session: Session): ExtractedTodo {
  const confidence = Number(raw.confidence);
  const typeBucket = TYPE_BUCKETS.has(raw.typeBucket) ? raw.typeBucket : "pending";
  const fallbackTime = timeBucketFor(session);
  return {
    title: normalizeText(raw.title).slice(0, 120) || "Untitled todo",
    description: normalizeText(raw.description || raw.evidence?.quote).slice(0, 1000),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    timeBucket: TIME_BUCKETS.has(raw.timeBucket) ? raw.timeBucket : fallbackTime,
    typeBucket,
    sourceSessionId: raw.sourceSessionId || session.id,
    evidence: {
      sourceObservationId: normalizeText(raw.evidence?.sourceObservationId),
      quote: normalizeText(raw.evidence?.quote),
      ...(Number.isFinite(raw.evidence?.charStart) ? { charStart: Number(raw.evidence.charStart) } : {}),
      ...(Number.isFinite(raw.evidence?.charEnd) ? { charEnd: Number(raw.evidence.charEnd) } : {}),
    },
    dedupeKey: normalizedKey(raw.dedupeKey || `${raw.title}:${raw.description}`),
  };
}

export function validateTodoEvidence(todo: ExtractedTodo, blockMap: Map<string, Pick<ObservationBlock, "text">>): boolean {
  if (!todo.evidence.sourceObservationId || !todo.evidence.quote) return false;
  const block = blockMap.get(todo.evidence.sourceObservationId);
  const blockText = normalizeText(block?.text);
  const quote = normalizeText(todo.evidence.quote);
  return !!blockText && (blockText.includes(quote) || quote.includes(blockText));
}

function existingDedupeKeys(actions: Action[], reviews: ReviewQueueItem[]): Set<string> {
  const keys = new Set<string>();
  for (const action of actions) {
    const extraction = action.metadata?.todoExtraction as Record<string, unknown> | undefined;
    if (typeof extraction?.dedupeKey === "string") keys.add(extraction.dedupeKey);
    keys.add(normalizedKey(action.title));
    keys.add(normalizedKey(`${action.title}:${action.description || ""}`));
  }
  for (const item of reviews) {
    if (item.kind !== "action") continue;
    const extraction = item.payload?.todoExtraction as Record<string, unknown> | undefined;
    if (typeof extraction?.dedupeKey === "string") keys.add(extraction.dedupeKey);
    keys.add(normalizedKey(item.title));
    keys.add(normalizedKey(`${item.title}:${item.content || ""}`));
  }
  return keys;
}

function checkpointKey(session: Session): string {
  return `${session.endedAt || session.startedAt || ""}:${session.observationCount || 0}`;
}

function parseCheckpoint(cursor: string | undefined): Record<string, string> {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(cursor) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function makeAction(todo: ExtractedTodo, session: Session, now: string): Action {
  const tags = ["todo-extracted", `time:${todo.timeBucket}`, `type:${todo.typeBucket}`];
  return {
    id: fingerprintId("act", `todo:${todo.dedupeKey}`),
    title: todo.title,
    description: todo.description,
    status: actionStatusFor(todo.typeBucket),
    priority: todo.typeBucket === "follow_up" || todo.typeBucket === "processing" ? 7 : 5,
    createdAt: now,
    updatedAt: now,
    createdBy: "todo-extract",
    project: session.project || session.cwd,
    tags,
    sourceObservationIds: [todo.evidence.sourceObservationId],
    sourceMemoryIds: [],
    metadata: { todoExtraction: todo },
  };
}

function makeReview(todo: ExtractedTodo, session: Session, now: string): ReviewQueueItem {
  const tags = ["todo-extracted", `time:${todo.timeBucket}`, `type:${todo.typeBucket}`];
  return {
    id: generateId("review"),
    createdAt: now,
    updatedAt: now,
    status: "pending",
    kind: "action",
    title: todo.title,
    content: todo.description,
    source: "viewer",
    payload: {
      project: session.project || session.cwd,
      sourceSessionId: session.id,
      tags,
      actionCandidate: {
        priority: todo.typeBucket === "follow_up" || todo.typeBucket === "processing" ? 7 : 5,
        reason: todo.typeBucket,
        confidence: todo.confidence,
        sourceObservationIds: [todo.evidence.sourceObservationId],
      },
      todoExtraction: todo,
    },
  };
}

async function extractForSession(
  session: Session,
  observations: CompressedObservation[],
  mode: string,
): Promise<{ todos: ExtractedTodo[]; engine: "langextract" | "rules" }> {
  const blocks = observations.map(blockFor).filter((block) => block.text);
  const bucket = timeBucketFor(session);
  if (mode !== "rules" && blocks.length > 0) {
    try {
      const todos = await runLangExtractSidecar({
        sessionId: session.id,
        project: session.project,
        cwd: session.cwd,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        blocks,
      });
      return { todos: todos.map((todo) => safeTodo(todo, session)), engine: "langextract" };
    } catch {
      // Fall back to rules even in langextract mode; the sidecar is optional.
    }
  }
  const candidates = extractActionCandidatesFromObservations(observations);
  return {
    todos: candidates.map((candidate) => candidateToTodo(candidate, session, bucket)).filter((todo): todo is ExtractedTodo => !!todo),
    engine: "rules",
  };
}

export async function generateTodosFromSessions(
  kv: Pick<StateKV, "get" | "set" | "list">,
  data: TodoExtractOptions = {},
): Promise<{
  success: true;
  engine: "langextract" | "rules" | "mixed";
  scannedSessions: number;
  scannedObservations: number;
  directCreated: number;
  reviewCreated: number;
  hiddenHistory: number;
  discarded: number;
}> {
  const maxSessions = clampPositiveInt(data.maxSessions, 20, 100);
  const maxObservationsPerSession = clampPositiveInt(data.maxObservationsPerSession, 300, 1000);
  const mode = (getEnvVar("AGENTMEMORY_TODO_EXTRACTOR") || "auto").toLowerCase();
  const directThreshold = envNumber("AGENTMEMORY_TODO_DIRECT_CONFIDENCE", 0.82);
  const reviewThreshold = envNumber("AGENTMEMORY_TODO_REVIEW_CONFIDENCE", 0.55);
  const [actions, reviews, allSessions] = await Promise.all([
    kv.list<Action>(KV.actions).catch(() => []),
    kv.list<ReviewQueueItem>(KV.reviewQueue).catch(() => []),
    kv.list<Session>(KV.sessions).catch(() => []),
  ]);
  const existing = existingDedupeKeys(actions, reviews);
  const checkpointId = `todo-extract:${data.project || "all"}`;
  const checkpoint = await kv.get<ScanCheckpoint>(KV.scanCheckpoints, checkpointId).catch(() => null);
  const processed = parseCheckpoint(checkpoint?.cursor);
  const sessions = allSessions
    .filter((session) => !data.project || session.project === data.project || session.cwd === data.project)
    .sort((a, b) => sessionSortTime(b).localeCompare(sessionSortTime(a)))
    .slice(0, maxSessions);
  let scannedObservations = 0;
  let directCreated = 0;
  let reviewCreated = 0;
  let hiddenHistory = 0;
  let discarded = 0;
  const engines = new Set<"langextract" | "rules">();
  const now = new Date().toISOString();

  for (const session of sessions) {
    const key = checkpointKey(session);
    if (!data.force && processed[session.id] === key) continue;
    const observations = (await kv.list<CompressedObservation>(KV.observations(session.id)).catch(() => []))
      .sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""))
      .slice(0, maxObservationsPerSession);
    scannedObservations += observations.length;
    const blockMap = new Map(observations.map((obs) => [obs.id, blockFor(obs)]));
    const { todos, engine } = await extractForSession(session, observations, mode);
    engines.add(engine);
    for (const todo of todos) {
      if (!todo.description || !validateTodoEvidence(todo, blockMap)) {
        discarded++;
        continue;
      }
      const dedupeKey = todo.dedupeKey || normalizedKey(`${todo.title}:${todo.description}`);
      if (!dedupeKey || existing.has(dedupeKey) || existing.has(normalizedKey(todo.title))) {
        discarded++;
        continue;
      }
      existing.add(dedupeKey);
      existing.add(normalizedKey(todo.title));
      if (todo.timeBucket === "history") {
        const review = makeReview({ ...todo, dedupeKey }, session, now);
        review.status = "dismissed";
        review.payload = { ...(review.payload || {}), hiddenHistory: true };
        await kv.set(KV.reviewQueue, review.id, review);
        hiddenHistory++;
        continue;
      }
      if (todo.confidence >= directThreshold) {
        await kv.set(KV.actions, fingerprintId("act", `todo:${dedupeKey}`), makeAction({ ...todo, dedupeKey }, session, now));
        directCreated++;
      } else if (todo.confidence >= reviewThreshold) {
        const review = makeReview({ ...todo, dedupeKey }, session, now);
        await kv.set(KV.reviewQueue, review.id, review);
        reviewCreated++;
      } else {
        discarded++;
      }
    }
    processed[session.id] = key;
  }

  await kv.set(KV.scanCheckpoints, checkpointId, {
    sourceId: checkpointId,
    cursor: JSON.stringify(processed),
    lastSuccessAt: now,
  });

  return {
    success: true,
    engine: engines.size > 1 ? "mixed" : Array.from(engines)[0] || "rules",
    scannedSessions: sessions.length,
    scannedObservations,
    directCreated,
    reviewCreated,
    hiddenHistory,
    discarded,
  };
}

export function registerTodoExtractFunctions(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::todo-extract-generate", async (data: TodoExtractOptions = {}) =>
    generateTodosFromSessions(kv, data),
  );
}
