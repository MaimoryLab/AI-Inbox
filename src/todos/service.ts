import type { OrganizeResult, SourceKind, TodoCard } from "../contracts.js";
import type { Database } from "../db/index.js";
import { extractRuleCandidate, stableId } from "../extract/rules.js";

export interface TodoEvidence {
  id: string;
  observationId: string;
  text: string;
}

export interface TodoEnhancer {
  enhance(candidate: { title: string; description: string; mergeKey: string; evidenceText: string }): Promise<{ title?: string; description?: string } | null>;
}

export type LlmOrganizeWarning =
  | "llm_config_missing"
  | "llm_runtime_missing"
  | "llm_timeout"
  | "llm_provider_failed"
  | "llm_output_invalid"
  | "llm_no_valid_candidates"
  | "llm_input_truncated"
  | "llm_batch_failed"
  | "organize_scope_truncated"
  | "organize_failed_fallback";

export interface LlmTodoCandidate {
  title: string;
  description: string;
  confidence: number;
  sourceObservationId: string;
  quote: string;
  dedupeKey: string;
}

export type LlmExtractResult =
  | { ok: true; todos: LlmTodoCandidate[] }
  | { ok: false; warning: LlmOrganizeWarning };

export interface OrganizeOptions {
  enhancer?: TodoEnhancer["enhance"];
  llmExtractor?: (observations: ObservationForOrganize[]) => Promise<LlmExtractResult>;
  scope?: {
    sinceDays: number;
    maxInteractionsPerSession: number;
  };
  limits?: Partial<OrganizeLimits>;
}

export interface ObservationForOrganize {
  id: string;
  sessionId: string;
  source: SourceKind;
  role: string;
  text: string;
  createdAt: string;
}

type WriteResult = { created: number; updated: number; engine: "rules" | "rules+llm" | "llm" };

export interface OrganizeLimits {
  maxUserBlocks: number;
  maxTotalTextChars: number;
  maxBlockTextChars: number;
  llmBatchSize: number;
}

export const DEFAULT_ORGANIZE_LIMITS: OrganizeLimits = {
  maxUserBlocks: 120,
  maxTotalTextChars: 80000,
  maxBlockTextChars: 4000,
  llmBatchSize: 20
};

export async function organizeTodos(db: Database, options: OrganizeOptions = {}): Promise<OrganizeResult> {
  const started = Date.now();
  const runId = stableId("organize", new Date(started).toISOString(), Math.random().toString(36));
  const warnings = new Set<string>();
  const limits = { ...DEFAULT_ORGANIZE_LIMITS, ...options.limits };
  const observations = limitObservations(
    scopeObservations(loadScopedObservations(db, options.scope), options.scope),
    limits,
    warnings
  );
  const sourceCounts = new Map<SourceKind, number>();
  for (const observation of observations) {
    sourceCounts.set(observation.source, (sourceCounts.get(observation.source) ?? 0) + 1);
  }
  let writeResult: WriteResult | null = options.llmExtractor
    ? await writeBatchedLlmTodos(db, observations, options, limits, warnings)
    : null;
  if (!writeResult) {
    writeResult = await writeRuleTodos(db, observations, options, warnings);
  }

  const result: OrganizeResult = {
    runId,
    scanned: observations.length,
    sources: Array.from(sourceCounts, ([source, scanned]) => ({ source, scanned })),
    created: writeResult.created,
    updated: writeResult.updated,
    completed: 0,
    ignored: 0,
    engine: writeResult.engine,
    warnings: Array.from(warnings),
    durationMs: Date.now() - started
  };

  db.prepare(
    "INSERT INTO organize_runs (id, result_json, created_at) VALUES (?, ?, ?)"
  ).run(runId, JSON.stringify(result), new Date().toISOString());
  return result;
}

function loadScopedObservations(db: Database, scope: OrganizeOptions["scope"]): ObservationForOrganize[] {
  const params: string[] = [];
  let where = "";
  if (scope) {
    where = "WHERE datetime(created_at) >= datetime(?)";
    params.push(new Date(Date.now() - scope.sinceDays * 24 * 60 * 60 * 1000).toISOString());
  }
  return db.prepare(
    `SELECT id, session_id as sessionId, source, role, text, created_at as createdAt
     FROM observations
     ${where}
     ORDER BY created_at, id`
  ).all(...params) as unknown as ObservationForOrganize[];
}

export function scopeObservations(
  observations: ObservationForOrganize[],
  scope: OrganizeOptions["scope"]
): ObservationForOrganize[] {
  if (!scope) return observations;
  const cutoffMs = Date.now() - scope.sinceDays * 24 * 60 * 60 * 1000;
  const recent = observations.filter((observation) => Date.parse(observation.createdAt) >= cutoffMs);
  const grouped = new Map<string, ObservationForOrganize[]>();
  for (const observation of recent) {
    const group = grouped.get(observation.sessionId) ?? [];
    group.push(observation);
    grouped.set(observation.sessionId, group);
  }
  const scoped: ObservationForOrganize[] = [];
  for (const group of grouped.values()) {
    scoped.push(...takeRecentInteractions(group, scope.maxInteractionsPerSession));
  }
  return scoped.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function takeRecentInteractions(observations: ObservationForOrganize[], maxInteractions: number): ObservationForOrganize[] {
  const boundaries = observations
    .map((observation, index) => ({ observation, index }))
    .filter(({ observation }) => observation.role === "user")
    .map(({ index }) => index);
  if (boundaries.length <= maxInteractions) return observations;
  const cutoff = boundaries[boundaries.length - maxInteractions];
  return observations.slice(cutoff);
}

function limitObservations(
  observations: ObservationForOrganize[],
  limits: OrganizeLimits,
  warnings: Set<string>
): ObservationForOrganize[] {
  let totalText = 0;
  let userBlocks = 0;
  const limited: ObservationForOrganize[] = [];
  for (const observation of observations) {
    if (observation.role !== "user") {
      limited.push(observation);
      continue;
    }
    if (userBlocks >= limits.maxUserBlocks) {
      warnings.add("organize_scope_truncated");
      continue;
    }
    const text = observation.text.length > limits.maxBlockTextChars
      ? observation.text.slice(0, limits.maxBlockTextChars)
      : observation.text;
    if (text.length !== observation.text.length) warnings.add("llm_input_truncated");
    if (totalText + text.length > limits.maxTotalTextChars) {
      warnings.add("organize_scope_truncated");
      continue;
    }
    totalText += text.length;
    userBlocks++;
    limited.push(text === observation.text ? observation : { ...observation, text });
  }
  return limited;
}

async function writeRuleTodos(
  db: Database,
  observations: ObservationForOrganize[],
  options: OrganizeOptions,
  warnings: Set<string>
): Promise<WriteResult> {
  let created = 0;
  let updated = 0;
  let enhanced = false;

  for (const observation of observations) {
    if (observation.role !== "user") continue;

    const candidate = extractRuleCandidate(observation.text);
    if (!candidate) continue;
    if (!options.enhancer && !options.llmExtractor) warnings.add("llm_enhancer_unavailable");
    const card = await enhanceCandidate({ ...candidate, evidenceText: observation.text }, options.enhancer, warnings);
    enhanced ||= card.enhanced;

    const todoId = stableId(candidate.mergeKey);
    const now = new Date().toISOString();
    const existing = db.prepare("SELECT id FROM todos WHERE id = ?").get(todoId);
    if (existing) {
      db.prepare(
        "UPDATE todos SET description = ?, updated_at = ? WHERE id = ?"
      ).run(card.description, now, todoId);
      updated++;
    } else {
      db.prepare(
        "INSERT INTO todos (id, title, description, status, updated_at) VALUES (?, ?, ?, 'todo', ?)"
      ).run(todoId, card.title, card.description, now);
      created++;
    }

    db.prepare(
      "INSERT OR REPLACE INTO evidence (id, todo_id, observation_id, text) VALUES (?, ?, ?, ?)"
    ).run(stableId(todoId, observation.id), todoId, observation.id, observation.text);
  }

  return { created, updated, engine: enhanced ? "rules+llm" : "rules" };
}

async function writeLlmTodos(
  db: Database,
  observations: ObservationForOrganize[],
  extractor: NonNullable<OrganizeOptions["llmExtractor"]>,
  warnings: Set<string>
): Promise<WriteResult | null> {
  const extracted = await extractor(observations);
  if (!extracted.ok) {
    warnings.add(extracted.warning);
    return null;
  }
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  const candidates = extracted.todos.filter((candidate) => validLlmCandidate(candidate, byId));
  if (candidates.length === 0) {
    warnings.add("llm_no_valid_candidates");
    return null;
  }

  let created = 0;
  let updated = 0;
  for (const candidate of candidates) {
    const observation = byId.get(candidate.sourceObservationId);
    if (!observation) continue;
    const todoId = stableId(candidate.dedupeKey);
    const now = new Date().toISOString();
    const existing = db.prepare("SELECT id FROM todos WHERE id = ?").get(todoId);
    if (existing) {
      db.prepare(
        "UPDATE todos SET title = ?, description = ?, updated_at = ? WHERE id = ?"
      ).run(candidate.title.trim(), candidate.description.trim(), now, todoId);
      updated++;
    } else {
      db.prepare(
        "INSERT INTO todos (id, title, description, status, updated_at) VALUES (?, ?, ?, 'todo', ?)"
      ).run(todoId, candidate.title.trim(), candidate.description.trim(), now);
      created++;
    }
    db.prepare(
      "INSERT OR REPLACE INTO evidence (id, todo_id, observation_id, text) VALUES (?, ?, ?, ?)"
    ).run(stableId(todoId, observation.id), todoId, observation.id, candidate.quote.trim());
  }
  return { created, updated, engine: "llm" };
}

async function writeBatchedLlmTodos(
  db: Database,
  observations: ObservationForOrganize[],
  options: OrganizeOptions,
  limits: OrganizeLimits,
  warnings: Set<string>
): Promise<WriteResult | null> {
  const extractor = options.llmExtractor;
  if (!extractor) return null;
  const batches = chunkObservations(observations, limits.llmBatchSize);
  let totalCreated = 0;
  let totalUpdated = 0;
  let llmSucceeded = false;
  let rulesUsed = false;

  for (const batch of batches) {
    if (!batch.some((observation) => observation.role === "user")) continue;
    const warningsBefore = new Set(warnings);
    const result = await writeLlmTodos(db, batch, extractor, warnings);
    if (result) {
      totalCreated += result.created;
      totalUpdated += result.updated;
      llmSucceeded = true;
      continue;
    }
    if (hasBatchFailureWarning(warnings, warningsBefore)) warnings.add("llm_batch_failed");
    const fallback = await writeRuleTodos(db, batch, options, warnings);
    totalCreated += fallback.created;
    totalUpdated += fallback.updated;
    rulesUsed = true;
  }

  if (!llmSucceeded && !rulesUsed) return null;
  return {
    created: totalCreated,
    updated: totalUpdated,
    engine: llmSucceeded && rulesUsed ? "rules+llm" : llmSucceeded ? "llm" : "rules"
  };
}

function hasBatchFailureWarning(warnings: Set<string>, before: Set<string>): boolean {
  for (const warning of warnings) {
    if (before.has(warning)) continue;
    if (
      warning === "llm_runtime_missing" ||
      warning === "llm_timeout" ||
      warning === "llm_provider_failed" ||
      warning === "llm_output_invalid"
    ) return true;
  }
  return false;
}

function chunkObservations(observations: ObservationForOrganize[], batchSize: number): ObservationForOrganize[][] {
  const chunks: ObservationForOrganize[][] = [];
  let chunk: ObservationForOrganize[] = [];
  let users = 0;
  for (const observation of observations) {
    if (observation.role === "user" && users >= batchSize && chunk.length > 0) {
      chunks.push(chunk);
      chunk = [];
      users = 0;
    }
    chunk.push(observation);
    if (observation.role === "user") users++;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

function validLlmCandidate(candidate: LlmTodoCandidate, observations: Map<string, ObservationForOrganize>): boolean {
  const observation = observations.get(candidate.sourceObservationId);
  return !!observation &&
    typeof candidate.title === "string" &&
    !!candidate.title.trim() &&
    typeof candidate.description === "string" &&
    !!candidate.description.trim() &&
    typeof candidate.quote === "string" &&
    !!candidate.quote.trim() &&
    observation.text.includes(candidate.quote.trim()) &&
    typeof candidate.dedupeKey === "string" &&
    !!candidate.dedupeKey.trim() &&
    typeof candidate.confidence === "number" &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= 0.55;
}

async function enhanceCandidate(
  candidate: { title: string; description: string; mergeKey: string; evidenceText: string },
  enhancer: OrganizeOptions["enhancer"],
  warnings: Set<string>
): Promise<{ title: string; description: string; enhanced: boolean }> {
  if (!enhancer) return { title: candidate.title, description: candidate.description, enhanced: false };
  try {
    const enhanced = await enhancer(candidate);
    if (!enhanced) {
      warnings.add("llm_enhancer_invalid");
      return { title: candidate.title, description: candidate.description, enhanced: false };
    }
    if (enhanced.title !== undefined && (typeof enhanced.title !== "string" || !enhanced.title.trim())) {
      warnings.add("llm_enhancer_invalid");
      return { title: candidate.title, description: candidate.description, enhanced: false };
    }
    if (enhanced.description !== undefined && (typeof enhanced.description !== "string" || !enhanced.description.trim())) {
      warnings.add("llm_enhancer_invalid");
      return { title: candidate.title, description: candidate.description, enhanced: false };
    }
    return {
      title: enhanced.title?.trim() ?? candidate.title,
      description: enhanced.description?.trim() ?? candidate.description,
      enhanced: true
    };
  } catch {
    warnings.add("llm_enhancer_failed");
    return { title: candidate.title, description: candidate.description, enhanced: false };
  }
}

export function listTodos(db: Database): TodoCard[] {
  return db.prepare(
    `SELECT
      todos.id,
      todos.title,
      todos.description,
      todos.status,
      todos.updated_at as updatedAt,
      COALESCE(json_group_array(evidence.id) FILTER (WHERE evidence.id IS NOT NULL), '[]') as evidenceIds
    FROM todos
    LEFT JOIN evidence ON evidence.todo_id = todos.id
    GROUP BY todos.id
    ORDER BY todos.updated_at DESC`
  ).all().map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id),
      title: String(record.title),
      description: String(record.description),
      status: record.status as TodoCard["status"],
      updatedAt: String(record.updatedAt),
      evidenceIds: JSON.parse(String(record.evidenceIds))
    };
  });
}

export function updateTodoStatus(db: Database, id: string, status: "done" | "ignored"): boolean {
  const result = db.prepare(
    "UPDATE todos SET status = ?, updated_at = ? WHERE id = ?"
  ).run(status, new Date().toISOString(), id);
  return result.changes > 0;
}

export function listTodoEvidence(db: Database, todoId: string): TodoEvidence[] | null {
  const todo = db.prepare("SELECT id FROM todos WHERE id = ?").get(todoId);
  if (!todo) return null;
  return db.prepare(
    "SELECT id, observation_id as observationId, text FROM evidence WHERE todo_id = ? ORDER BY id"
  ).all(todoId).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id),
      observationId: String(record.observationId),
      text: String(record.text)
    };
  });
}

export function getOrganizeRun(db: Database, id: string): OrganizeResult | null {
  const row = db.prepare(
    "SELECT result_json as resultJson FROM organize_runs WHERE id = ?"
  ).get(id) as { resultJson: string } | undefined;
  return row ? JSON.parse(row.resultJson) as OrganizeResult : null;
}
