import type { OrganizeResult, SourceKind, TodoCard } from "../contracts.js";
import type { Database } from "../db/index.js";
import { extractRuleCandidate, stableId } from "../extract/rules.js";

export function organizeTodos(db: Database): OrganizeResult {
  const started = Date.now();
  const runId = stableId("organize", new Date(started).toISOString());
  const observations = db.prepare(
    "SELECT id, source, role, text FROM observations ORDER BY created_at, id"
  ).all() as Array<{ id: string; source: SourceKind; role: string; text: string }>;
  const sourceCounts = new Map<SourceKind, number>();
  let created = 0;
  let updated = 0;

  for (const observation of observations) {
    sourceCounts.set(observation.source, (sourceCounts.get(observation.source) ?? 0) + 1);
    if (observation.role !== "user") continue;

    const candidate = extractRuleCandidate(observation.text);
    if (!candidate) continue;

    const todoId = stableId(candidate.title);
    const now = new Date().toISOString();
    const existing = db.prepare("SELECT id FROM todos WHERE id = ?").get(todoId);
    if (existing) {
      db.prepare(
        "UPDATE todos SET description = ?, updated_at = ? WHERE id = ?"
      ).run(candidate.description, now, todoId);
      updated++;
    } else {
      db.prepare(
        "INSERT INTO todos (id, title, description, status, updated_at) VALUES (?, ?, ?, 'todo', ?)"
      ).run(todoId, candidate.title, candidate.description, now);
      created++;
    }

    db.prepare(
      "INSERT OR REPLACE INTO evidence (id, todo_id, observation_id, text) VALUES (?, ?, ?, ?)"
    ).run(stableId(todoId, observation.id), todoId, observation.id, observation.text);
  }

  const result: OrganizeResult = {
    runId,
    scanned: observations.length,
    sources: Array.from(sourceCounts, ([source, scanned]) => ({ source, scanned })),
    created,
    updated,
    completed: 0,
    ignored: 0,
    engine: "rules",
    warnings: [],
    durationMs: Date.now() - started
  };

  db.prepare(
    "INSERT INTO organize_runs (id, result_json, created_at) VALUES (?, ?, ?)"
  ).run(runId, JSON.stringify(result), new Date().toISOString());
  return result;
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
