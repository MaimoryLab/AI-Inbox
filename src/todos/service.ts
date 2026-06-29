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
  | "llm_no_valid_candidates";

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

export async function organizeTodos(db: Database, options: OrganizeOptions = {}): Promise<OrganizeResult> {
  const started = Date.now();
  const runId = stableId("organize", new Date(started).toISOString(), Math.random().toString(36));
  const allObservations = db.prepare(
    "SELECT id, session_id as sessionId, source, role, text, created_at as createdAt FROM observations ORDER BY created_at, id"
  ).all() as unknown as ObservationForOrganize[];
  const observations = scopeObservations(allObservations, options.scope);
  const sourceCounts = new Map<SourceKind, number>();
  for (const observation of observations) {
    sourceCounts.set(observation.source, (sourceCounts.get(observation.source) ?? 0) + 1);
  }
  const warnings = new Set<string>();
  let writeResult: WriteResult | null = options.llmExtractor ? await writeLlmTodos(db, observations, options.llmExtractor, warnings) : null;
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
