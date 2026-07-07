import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openDatabase } from "../src/db/index.js";
import { getAppPaths } from "../src/paths.js";
import { parseJsonl } from "../src/parser/jsonl.js";
import { createAppServer } from "../src/server/index.js";
import { scanClaudeCodeSessions } from "../src/sources/claude-code.js";
import { scanCodexSessions } from "../src/sources/codex.js";
import { scanCursorSessions } from "../src/sources/cursor.js";
import { observationFromRecord } from "../src/sources/jsonl-source.js";

test("parseJsonl reads non-empty JSON object lines", () => {
  const records = parseJsonl("{\"text\":\"one\"}\n\n{\"text\":\"two\"}\n");
  assert.deepEqual(records.map((record) => record.value.text), ["one", "two"]);
});

test("codex and claude scanners write clean visible transcript and skip unchanged files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-"));
  try {
    mkdirSync(join(dir, "codex"));
    mkdirSync(join(dir, "claude"));
    writeFileSync(join(dir, "codex", "session.jsonl"), [
      JSON.stringify({ type: "session_meta", payload: { id: "codex-session", cwd: "/tmp/project", timestamp: "2026-01-01T00:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Please add a CLI doctor command", timestamp: "2026-01-01T00:00:01.000Z" } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: "{\"cmd\":\"git status\"}" } }),
      JSON.stringify({ type: "response_item", payload: { type: "function_call_output", output: "tool output should not be stored" } }),
      JSON.stringify({ type: "response_item", payload: { type: "reasoning", text: "hidden reasoning should not be stored" } }),
      JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Implemented doctor" }, { type: "tool_use", text: "tool text" }] } })
    ].join("\n"));
    writeFileSync(join(dir, "claude", "session.jsonl"), [
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Fix the scanner checkpoint" },
            { type: "tool_result", content: "tool result should not be stored" }
          ]
        }
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", text: "private chain of thought" },
            { type: "text", text: "The checkpoint now skips unchanged files." },
            { type: "tool_use", name: "Bash", input: { command: "npm test" } }
          ]
        }
      })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.deepEqual(scanCodexSessions(db, join(dir, "codex")), {
      source: "codex",
      scanned: 1,
      observations: 2,
      skipped: 0
    });
    const codexSession = db.prepare("SELECT project_path as projectPath FROM sessions WHERE source = 'codex'").get() as { projectPath: string };
    assert.equal(codexSession.projectPath, "/tmp/project");
    assert.deepEqual(scanCodexSessions(db, join(dir, "codex")), {
      source: "codex",
      scanned: 0,
      observations: 0,
      skipped: 1
    });
    assert.equal(scanClaudeCodeSessions(db, join(dir, "claude")).observations, 2);
    const rows = db.prepare("SELECT source, role, text FROM observations ORDER BY source, text").all();
    db.close();
    assert.equal(rows.length, 4);
    assert.ok(rows.some((row) => row.source === "claude-code" && row.text === "Fix the scanner checkpoint"));
    assert.ok(rows.some((row) => row.source === "claude-code" && row.role === "assistant" && row.text === "The checkpoint now skips unchanged files."));
    assert.ok(rows.some((row) => row.source === "codex" && row.role === "assistant" && row.text === "Implemented doctor"));
    assert.ok(!rows.some((row) => String(row.text).includes("tool")));
    assert.ok(!rows.some((row) => String(row.text).includes("reasoning")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cursor scanner reads composerHeaders from copied state database and checkpoints unchanged DBs", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cursor-composer-"));
  const appDb = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const workspaceStorage = join(dir, "workspaceStorage");
    const workspace = join(workspaceStorage, "workspace-one");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "workspace.json"), JSON.stringify({ folder: "file:///tmp/cursor-project" }));
    const stateDb = join(workspace, "state.vscdb");
    const cursorDb = new DatabaseSync(stateDb);
    cursorDb.exec("CREATE TABLE composerHeaders (composerId TEXT PRIMARY KEY, value TEXT, lastUpdatedAt INTEGER)");
    cursorDb.prepare("INSERT INTO composerHeaders (composerId, value, lastUpdatedAt) VALUES (?, ?, ?)").run(
      "composer-one",
      JSON.stringify({
        title: "Cursor release checklist",
        messages: [
          { role: "user", text: "Please add Cursor source support", createdAt: "2026-01-01T00:00:00.000Z" },
          { role: "assistant", content: "Cursor source support is ready.", createdAt: "2026-01-01T00:00:01.000Z" },
          { role: "system", text: "Skip private setup" }
        ]
      }),
      Date.parse("2026-01-01T00:00:01.000Z")
    );
    cursorDb.close();

    assert.deepEqual(scanCursorSessions(appDb, workspaceStorage), {
      source: "cursor",
      scanned: 1,
      observations: 2,
      skipped: 0
    });
    const session = appDb.prepare("SELECT source, path, title, project_path as projectPath FROM sessions WHERE source = 'cursor'")
      .get() as { source: string; path: string; title: string; projectPath: string };
    assert.equal(session.source, "cursor");
    assert.equal(session.path, stateDb);
    assert.equal(session.title, "Cursor: Cursor release checklist");
    assert.equal(session.projectPath, "/tmp/cursor-project");
    const observations = (appDb.prepare("SELECT role, text FROM observations WHERE source = 'cursor' ORDER BY created_at")
      .all() as Array<{ role: string; text: string }>).map((row) => ({ role: row.role, text: row.text }));
    assert.deepEqual(observations, [
      { role: "user", text: "Please add Cursor source support" },
      { role: "assistant", text: "Cursor source support is ready." }
    ]);
    assert.deepEqual(scanCursorSessions(appDb, workspaceStorage), {
      source: "cursor",
      scanned: 0,
      observations: 0,
      skipped: 1
    });
  } finally {
    appDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cursor scanner reads agent transcript JSONL and checkpoints unchanged transcripts", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cursor-agent-"));
  const appDb = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const projectsRoot = join(dir, ".cursor", "projects");
    const transcript = writeCursorAgentTranscript(projectsRoot, "Users-ppio-Documents-AI-Inbox-cursor-source", "4b13c659-test", [
      { role: "assistant", message: { content: [{ type: "text", text: "[REDACTED]" }] } },
      { role: "user", title: "Cursor agent transcript", message: { content: [{ type: "text", text: "<timestamp>Monday, Jul 6, 2026, 1:52 PM (UTC+8)</timestamp>\n<user_query> 为cursor加载codex中能加载的插件和skills </user_query>" }, { type: "tool_use", text: "hidden" }] } },
      { role: "assistant", message: { content: [{ type: "tool_use", text: "hidden" }, { type: "text", text: "正在查看 Codex 与 Cursor 的插件/skills 配置，确定可加载项及加载方式。" }, { type: "text", text: "[REDACTED]" }] } },
      { type: "turn_ended", status: "success" }
    ]);
    const transcriptTime = new Date("2026-01-01T00:00:10.000Z");
    utimesSync(transcript, transcriptTime, transcriptTime);

    assert.deepEqual(scanCursorSessions(appDb, projectsRoot), {
      source: "cursor",
      scanned: 1,
      observations: 2,
      skipped: 0
    });
    const session = appDb.prepare("SELECT path, title, project_path as projectPath FROM sessions WHERE source = 'cursor'")
      .get() as { path: string; title: string; projectPath: string };
    assert.equal(session.path, transcript);
    assert.equal(session.title, "Cursor: Cursor agent transcript");
    assert.equal(session.projectPath, "/Users/ppio/Documents/AI-Inbox-cursor-source");
    const rows = (appDb.prepare("SELECT role, text, created_at as createdAt FROM observations WHERE source = 'cursor' ORDER BY created_at")
      .all() as Array<{ role: string; text: string; createdAt: string }>)
      .map((row) => ({ role: row.role, text: row.text, createdAt: row.createdAt }));
    assert.deepEqual(rows, [
      { role: "user", text: "为cursor加载codex中能加载的插件和skills", createdAt: "2026-01-01T00:00:09.000Z" },
      { role: "assistant", text: "正在查看 Codex 与 Cursor 的插件/skills 配置，确定可加载项及加载方式。", createdAt: "2026-01-01T00:00:10.000Z" }
    ]);
    assert.deepEqual(scanCursorSessions(appDb, projectsRoot), {
      source: "cursor",
      scanned: 0,
      observations: 0,
      skipped: 1
    });
  } finally {
    appDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cursor scanner rescans checkpointed agent transcripts with old noisy observations", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cursor-agent-dirty-"));
  const appDb = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const projectsRoot = join(dir, ".cursor", "projects");
    const transcript = writeCursorAgentTranscript(projectsRoot, "Users-ppio-Documents-AI-Inbox-cursor-source", "dirty", [
      { role: "user", message: { content: [{ type: "text", text: "<user_query> Clean old Cursor data </user_query>" }] } },
      { role: "assistant", message: { content: [{ type: "text", text: "Old Cursor data is clean." }] } }
    ]);
    const transcriptTime = new Date("2026-01-01T00:00:20.000Z");
    utimesSync(transcript, transcriptTime, transcriptTime);
    const fileStat = statSync(transcript);
    const sessionId = createHash("sha1").update(["cursor-agent", transcript].join("\0")).digest("hex");
    appDb.prepare("INSERT INTO sessions (id, source, path, title, updated_at) VALUES (?, 'cursor', ?, 'Cursor: dirty', ?)").run(sessionId, transcript, "1970-01-01T00:00:00.000Z");
    appDb.prepare("INSERT INTO observations (id, session_id, source, role, text, created_at) VALUES (?, ?, 'cursor', 'assistant', ?, '1970-01-01T00:00:00.000Z')").run("old-cursor-observation", sessionId, "Old answer\n[REDACTED]");
    appDb.prepare("INSERT INTO scan_checkpoints (source, path, mtime_ms, size) VALUES ('cursor', ?, ?, ?)").run(transcript, fileStat.mtimeMs, fileStat.size);

    assert.deepEqual(scanCursorSessions(appDb, projectsRoot), {
      source: "cursor",
      scanned: 1,
      observations: 2,
      skipped: 0
    });
    const rows = (appDb.prepare("SELECT text, created_at as createdAt FROM observations WHERE session_id = ? ORDER BY created_at")
      .all(sessionId) as Array<{ text: string; createdAt: string }>)
      .map((row) => ({ text: row.text, createdAt: row.createdAt }));
    assert.deepEqual(rows, [
      { text: "Clean old Cursor data", createdAt: "2026-01-01T00:00:19.000Z" },
      { text: "Old Cursor data is clean.", createdAt: "2026-01-01T00:00:20.000Z" }
    ]);
    assert.deepEqual(scanCursorSessions(appDb, projectsRoot), {
      source: "cursor",
      scanned: 0,
      observations: 0,
      skipped: 1
    });
  } finally {
    appDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cursor scanner removes agent transcript sessions deleted from a scanned project root", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cursor-agent-stale-"));
  const appDb = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const projectsRoot = join(dir, ".cursor", "projects");
    const first = writeCursorAgentTranscript(projectsRoot, "Users-ppio-Documents-AI-Inbox-cursor-source", "keep", [
      { role: "user", message: { content: [{ type: "text", text: "Please keep this Cursor transcript" }] } }
    ]);
    const stale = writeCursorAgentTranscript(projectsRoot, "Users-ppio-Documents-AI-Inbox-cursor-source", "stale", [
      { role: "assistant", message: { content: [{ type: "text", text: "Please remove this Cursor transcript" }] } }
    ]);

    assert.equal(scanCursorSessions(appDb, projectsRoot).observations, 2);
    rmSync(stale);
    const changedTime = new Date(Date.now() + 5000);
    utimesSync(first, changedTime, changedTime);

    assert.deepEqual(scanCursorSessions(appDb, projectsRoot), {
      source: "cursor",
      scanned: 1,
      observations: 1,
      skipped: 0
    });
    const sessions = appDb.prepare("SELECT path FROM sessions WHERE source = 'cursor'").all() as Array<{ path: string }>;
    assert.deepEqual(sessions.map((session) => session.path), [first]);
  } finally {
    appDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cursor scanner skips invalid agent transcript lines and non-visible roles", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cursor-agent-invalid-"));
  const appDb = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const projectsRoot = join(dir, ".cursor", "projects");
    const transcriptDir = join(projectsRoot, "Users-ppio-Documents-AI-Inbox-cursor-source", "agent-transcripts");
    mkdirSync(transcriptDir, { recursive: true });
    writeFileSync(join(transcriptDir, "invalid.jsonl"), [
      "{",
      JSON.stringify({ role: "system", text: "hidden" }),
      JSON.stringify({ role: "tool", text: "hidden" }),
      JSON.stringify({ settings: { theme: "dark" } })
    ].join("\n"));

    assert.deepEqual(scanCursorSessions(appDb, projectsRoot), {
      source: "cursor",
      scanned: 1,
      observations: 0,
      skipped: 0
    });
    assert.equal((appDb.prepare("SELECT COUNT(*) as count FROM sessions WHERE source = 'cursor'").get() as { count: number }).count, 0);
  } finally {
    appDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cursor scanner parses ItemTable conversations and removes sessions deleted from a changed DB", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cursor-stale-"));
  const appDb = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const workspace = join(dir, "workspaceStorage", "workspace-two");
    mkdirSync(workspace, { recursive: true });
    const stateDb = join(workspace, "state.vscdb");
    writeCursorItemTable(stateDb, {
      first: cursorConversation("first", "Keep Cursor card", "Please keep this Cursor thread", "Kept."),
      stale: cursorConversation("stale", "Remove Cursor card", "Please remove this Cursor thread", "Removed.")
    });

    assert.equal(scanCursorSessions(appDb, workspace).observations, 4);
    assert.equal((appDb.prepare("SELECT COUNT(*) as count FROM sessions WHERE source = 'cursor'").get() as { count: number }).count, 2);

    writeCursorItemTable(stateDb, {
      first: cursorConversation("first", "Keep Cursor card", "Please keep this Cursor thread", "Kept.")
    });
    const changedTime = new Date(Date.now() + 5000);
    utimesSync(stateDb, changedTime, changedTime);

    assert.deepEqual(scanCursorSessions(appDb, stateDb), {
      source: "cursor",
      scanned: 1,
      observations: 2,
      skipped: 0
    });
    const sessions = appDb.prepare("SELECT title FROM sessions WHERE source = 'cursor' ORDER BY title").all() as Array<{ title: string }>;
    assert.deepEqual(sessions.map((session) => session.title), ["Cursor: Keep Cursor card"]);
  } finally {
    appDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cursor scanner skips invalid JSON and non-transcript values", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-cursor-invalid-"));
  const appDb = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const workspace = join(dir, "workspaceStorage", "workspace-three");
    mkdirSync(workspace, { recursive: true });
    const stateDb = join(workspace, "state.vscdb");
    const cursorDb = new DatabaseSync(stateDb);
    cursorDb.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)");
    cursorDb.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)").run("composer.settings", JSON.stringify({ theme: "dark" }));
    cursorDb.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)").run("aichat.invalid", "{");
    cursorDb.close();

    assert.deepEqual(scanCursorSessions(appDb, workspace), {
      source: "cursor",
      scanned: 1,
      observations: 0,
      skipped: 0
    });
    assert.equal((appDb.prepare("SELECT COUNT(*) as count FROM sessions WHERE source = 'cursor'").get() as { count: number }).count, 0);
  } finally {
    appDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex scanner backfills project path when checkpoint is unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-codex-project-backfill-"));
  const db = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const codexDir = join(dir, "codex");
    mkdirSync(codexDir);
    const file = join(codexDir, "session.jsonl");
    writeFileSync(file, [
      JSON.stringify({ type: "session_meta", payload: { id: "codex-project-session", cwd: "/Users/demo/workspace", timestamp: "2026-01-01T00:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Please keep this session visible", timestamp: "2026-01-01T00:00:00.000Z" } })
    ].join("\n"));

    assert.equal(scanCodexSessions(db, codexDir).observations, 1);
    db.prepare("UPDATE sessions SET project_path = NULL WHERE source = 'codex' AND path = ?").run(file);
    assert.deepEqual(scanCodexSessions(db, codexDir), {
      source: "codex",
      scanned: 0,
      observations: 0,
      skipped: 1
    });
    const row = db.prepare("SELECT project_path as projectPath FROM sessions WHERE source = 'codex' AND path = ?").get(file) as { projectPath: string };
    assert.equal(row.projectPath, "/Users/demo/workspace");
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claude scanner stores project path from cwd fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-claude-project-cwd-"));
  const db = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const claudeDir = join(dir, "claude");
    mkdirSync(claudeDir);
    writeFileSync(join(claudeDir, "session.jsonl"), [
      JSON.stringify({
        type: "user",
        cwd: "/Users/demo/Projects/ClaudeApp",
        message: {
          role: "user",
          content: [{ type: "text", text: "Please fix Claude project grouping" }]
        }
      })
    ].join("\n"));

    assert.equal(scanClaudeCodeSessions(db, claudeDir).observations, 1);
    const row = db.prepare("SELECT project_path as projectPath FROM sessions WHERE source = 'claude-code'").get() as { projectPath: string | null };
    assert.equal(row.projectPath, "/Users/demo/Projects/ClaudeApp");
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claude scanner stores ai title as session title", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-claude-session-title-"));
  const db = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const claudeDir = join(dir, "claude");
    mkdirSync(claudeDir);
    writeFileSync(join(claudeDir, "session.jsonl"), [
      JSON.stringify({ type: "ai-title", aiTitle: "模型思考深度变化对缓存命中的影响" }),
      JSON.stringify({
        type: "user",
        cwd: "/Users/demo/Projects/ClaudeApp",
        message: { role: "user", content: [{ type: "text", text: "Image: Image #1 (/tmp/noisy.png)\n请分析模型缓存。" }] }
      })
    ].join("\n"));

    assert.equal(scanClaudeCodeSessions(db, claudeDir).observations, 1);
    const row = db.prepare("SELECT title FROM sessions WHERE source = 'claude-code'").get() as { title: string | null };
    assert.equal(row.title, "模型思考深度变化对缓存命中的影响");
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claude scanner decodes encoded project directories when cwd is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-claude-project-encoded-"));
  const db = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const claudeDir = join(dir, "claude");
    const usersProject = join(claudeDir, "-Users-demo-Projects-SampleApp");
    const homeProject = join(claudeDir, "-home-demo-workspace-ServiceApp");
    mkdirSync(usersProject, { recursive: true });
    mkdirSync(homeProject, { recursive: true });
    const message = {
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "Please keep project path from the Claude directory" }] }
    };
    writeFileSync(join(usersProject, "users.jsonl"), JSON.stringify(message));
    writeFileSync(join(homeProject, "home.jsonl"), JSON.stringify(message));

    assert.equal(scanClaudeCodeSessions(db, claudeDir).observations, 2);
    const rows = db.prepare("SELECT project_path as projectPath FROM sessions WHERE source = 'claude-code' ORDER BY project_path").all() as Array<{ projectPath: string | null }>;
    assert.deepEqual(rows.map((row) => row.projectPath), [
      "/Users/demo/Projects/SampleApp",
      "/home/demo/workspace/ServiceApp"
    ]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claude scanner leaves project path null when cwd and encoded directory are unavailable", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-claude-no-project-"));
  const db = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const claudeDir = join(dir, "claude");
    mkdirSync(claudeDir);
    writeFileSync(join(claudeDir, "session.jsonl"), JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "Please still scan this Claude session" }] }
    }));

    assert.equal(scanClaudeCodeSessions(db, claudeDir).observations, 1);
    const row = db.prepare("SELECT project_path as projectPath FROM sessions WHERE source = 'claude-code'").get() as { projectPath: string | null };
    assert.equal(row.projectPath, null);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex scanner tolerates missing project path metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-codex-no-project-"));
  const db = openDatabase(getAppPaths(join(dir, "home")));
  try {
    const codexDir = join(dir, "codex");
    mkdirSync(codexDir);
    writeFileSync(join(codexDir, "session.jsonl"), [
      JSON.stringify({ type: "session_meta", payload: { id: "codex-no-project", timestamp: "2026-01-01T00:00:00.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Please still scan this session", timestamp: "2026-01-01T00:00:00.000Z" } })
    ].join("\n"));

    assert.equal(scanCodexSessions(db, codexDir).observations, 1);
    const row = db.prepare("SELECT project_path as projectPath FROM sessions WHERE source = 'codex'").get() as { projectPath: string | null };
    assert.equal(row.projectPath, null);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex scanner dedupes mirrored event and response messages", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-dedupe-"));
  try {
    mkdirSync(join(dir, "codex"));
    writeFileSync(join(dir, "codex", "session.jsonl"), [
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Please add clean transcript tests" } }),
      JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Please add clean transcript tests" }] } }),
      JSON.stringify({ type: "event_msg", payload: { type: "agent_message", message: "Added clean transcript tests." } }),
      JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Added clean transcript tests." }] } })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 2);
    const rows = db.prepare("SELECT role, text FROM observations").all();
    db.close();
    assert.equal(rows.length, 2);
    assert.ok(rows.some((row) => row.role === "user" && row.text === "Please add clean transcript tests"));
    assert.ok(rows.some((row) => row.role === "assistant" && row.text === "Added clean transcript tests."));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex scanner stores readable file and image references", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-attachments-"));
  try {
    mkdirSync(join(dir, "codex"));
    const imagePath = "/var/folders/demo/codex-clipboard-a1ec.png";
    const filePath = "/home/example/Documents/brief.md";
    writeFileSync(join(dir, "codex", "session.jsonl"), [
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "user_message",
          message: [
            "Please inspect the attached screenshot.",
            "",
            "# Files mentioned by the user:",
            "",
            `## brief.md: ${filePath}`,
            "",
            `## codex-clipboard-a1ec.png: ${imagePath}`,
            "",
            `<image name=[Image #1] path="${imagePath}">`,
            "</image>"
          ].join("\n"),
          timestamp: "2026-01-01T00:00:01.000Z"
        }
      })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 1);
    const row = db.prepare("SELECT text FROM observations").get() as { text: string };
    db.close();

    assert.match(row.text, /Please inspect the attached screenshot/);
    assert.match(row.text, /Files mentioned: brief\.md \(\/home\/example\/Documents\/brief\.md\)/);
    assert.match(row.text, /Image: Image #1 \(\/var\/folders\/demo\/codex-clipboard-a1ec\.png\)/);
    assert.doesNotMatch(row.text, /Files mentioned: codex-clipboard-a1ec\.png/);
    assert.equal((row.text.match(/\/var\/folders\/demo\/codex-clipboard-a1ec\.png/g) ?? []).length, 1);
    assert.equal((row.text.match(/\/home\/example\/Documents\/brief\.md/g) ?? []).length, 1);
    assert.doesNotMatch(row.text, /<image|<\/image>/);
    assert.doesNotMatch(row.text, /# Files mentioned by the user/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex scanner stores structured local image references without inline image tags", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-local-images-"));
  try {
    mkdirSync(join(dir, "codex"));
    writeFileSync(join(dir, "codex", "session.jsonl"), [
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Please compare this screenshot with the expected layout.",
          images: [{ path: "/tmp/layout.png", name: "layout.png" }],
          local_images: ["/tmp/layout.png", { path: "/tmp/extra.png", name: "extra.png" }],
          timestamp: "2026-01-01T00:00:01.000Z"
        }
      })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 1);
    const row = db.prepare("SELECT text FROM observations").get() as { text: string };
    db.close();

    assert.match(row.text, /Please compare this screenshot/);
    assert.match(row.text, /Image: layout\.png \(\/tmp\/layout\.png\)/);
    assert.match(row.text, /Image: extra\.png \(\/tmp\/extra\.png\)/);
    assert.equal((row.text.match(/\/tmp\/layout\.png/g) ?? []).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("clean transcript preserves meaningful newlines and does not drop user JSON examples", () => {
  const multiline = observationFromRecord("codex", "session", "/tmp/session.jsonl", {
    line: 1,
    value: {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "Please keep this list:\n- first item\n- second item\n\n```json\n{\"exec_command\":\"example, not tool output\"}\n```"
      }
    }
  });
  assert.ok(multiline);
  assert.match(multiline.text, /first item\n- second item/);
  assert.match(multiline.text, /exec_command/);
});

test("codex scanner removes injected instruction noise before storing observations", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-noise-"));
  try {
    mkdirSync(join(dir, "codex"));
    writeFileSync(join(dir, "codex", "session.jsonl"), [
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "user_message",
          message: [
            "# AGENTS.md instructions",
            "<INSTRUCTIONS>do not store this</INSTRUCTIONS>",
            "<environment_context>secret local context</environment_context>",
            "<system-reminder>stale cwd reminder</system-reminder>",
            "## My request for Codex:",
            "Please keep only this visible request"
          ].join("\n"),
          timestamp: "2026-01-01T00:00:01.000Z"
        }
      })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 1);
    const row = db.prepare("SELECT text FROM observations").get() as { text: string };
    db.close();
    assert.equal(row.text, "Please keep only this visible request");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex scanner removes subagent notifications from user observations", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-subagent-"));
  try {
    mkdirSync(join(dir, "codex"));
    const subagent = [
      "<subagent_notification>",
      JSON.stringify({ agent_path: "agent-1", status: { completed: "**Subagent report**\nShould not appear." } }),
      "</subagent_notification>"
    ].join("\n");
    writeFileSync(join(dir, "codex", "session.jsonl"), [
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: subagent, timestamp: "2026-01-01T00:00:01.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: `Please keep this request.\n${subagent}\nThanks.`, timestamp: "2026-01-01T00:00:02.000Z" } })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 1);
    const row = db.prepare("SELECT text FROM observations").get() as { text: string };
    db.close();
    assert.equal(row.text, "Please keep this request.\n\nThanks.");
    assert.doesNotMatch(row.text, /<subagent_notification>|agent_path|completed|Subagent report/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex scanner merges linked subagent sessions into the parent session", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-subagent-merge-"));
  try {
    const root = join(dir, "codex");
    const agentDir = join(root, "agents", "agent-1");
    mkdirSync(agentDir, { recursive: true });
    const subagent = [
      "<subagent_notification>",
      JSON.stringify({ agent_path: agentDir.replace(/\//gu, "\\"), status: { completed: "hidden report" } }),
      "</subagent_notification>"
    ].join("\n");
    writeFileSync(join(root, "parent.jsonl"), [
      JSON.stringify({ type: "session_meta", payload: { id: "parent-session", cwd: "/tmp/project" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: `Please audit this.\n${subagent}`, timestamp: "2026-01-01T00:00:01.000Z" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "agent_message", message: "Starting audit.", timestamp: "2026-01-01T00:00:02.000Z" } })
    ].join("\n"));
    writeFileSync(join(agentDir, "child.jsonl"), [
      JSON.stringify({ type: "session_meta", payload: { id: "child-session", cwd: "/tmp/project" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "agent_message", message: "Subagent found the issue.", timestamp: "2026-01-01T00:00:03.000Z" } })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.deepEqual(scanCodexSessions(db, root), {
      source: "codex",
      scanned: 2,
      observations: 3,
      skipped: 0
    });
    const sessions = db.prepare("SELECT id FROM sessions ORDER BY id").all() as Array<{ id: string }>;
    const observations = db.prepare("SELECT session_id as sessionId, text FROM observations ORDER BY created_at").all() as Array<{ sessionId: string; text: string }>;
    db.close();
    const parentSessionId = testId("codex", "parent-session");
    assert.deepEqual(sessions.map((session) => session.id), [parentSessionId]);
    assert.deepEqual(observations.map((row) => row.sessionId), [parentSessionId, parentSessionId, parentSessionId]);
    assert.ok(observations.some((row) => row.text === "[Agent Context]\nSubagent found the issue."));
    assert.ok(!observations.some((row) => /subagent_notification|agent_path|hidden report/.test(row.text)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function testId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\0")).digest("hex");
}

test("scanner checkpoints but does not store sessions with no visible observations", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-empty-session-"));
  try {
    mkdirSync(join(dir, "claude"));
    writeFileSync(join(dir, "claude", "session.jsonl"), [
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "<command-name>/effort</command-name>\n<command-message>effort</command-message>\n<command-args>ultracode</command-args>"
            }
          ]
        }
      }),
      JSON.stringify({
        type: "assistant",
        isMeta: true,
        message: { role: "assistant", content: [{ type: "text", text: "metadata should not be stored" }] }
      })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.deepEqual(scanClaudeCodeSessions(db, join(dir, "claude")), {
      source: "claude-code",
      scanned: 1,
      observations: 0,
      skipped: 0
    });
    assert.equal((db.prepare("SELECT COUNT(*) as count FROM sessions").get() as { count: number }).count, 0);
    assert.equal((db.prepare("SELECT COUNT(*) as count FROM scan_checkpoints").get() as { count: number }).count, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claude scanner keeps visible user and assistant text after filtering metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-claude-visible-"));
  try {
    mkdirSync(join(dir, "claude"));
    writeFileSync(join(dir, "claude", "session.jsonl"), [
      JSON.stringify({ type: "user", isSidechain: true, message: { role: "user", content: [{ type: "text", text: "sidechain should be skipped" }] } }),
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "Please clean Claude visible transcript" }] } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "I will keep only readable transcript text." }] } })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanClaudeCodeSessions(db, join(dir, "claude")).observations, 2);
    const rows = db.prepare("SELECT role, text FROM observations ORDER BY role DESC").all();
    db.close();
    assert.ok(rows.some((row) => row.role === "user" && row.text === "Please clean Claude visible transcript"));
    assert.ok(rows.some((row) => row.role === "assistant" && row.text === "I will keep only readable transcript text."));
    assert.ok(!rows.some((row) => String(row.text).includes("sidechain")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claude scanner removes subagent notifications from visible text", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-claude-subagent-"));
  try {
    mkdirSync(join(dir, "claude"));
    writeFileSync(join(dir, "claude", "session.jsonl"), [
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [{
            type: "text",
            text: [
              "Please keep this Claude request.",
              "<subagent_notification>",
              "{\"agent_path\":\"agent-2\",\"status\":{\"completed\":\"hidden report\"}}",
              "</subagent_notification>"
            ].join("\n")
          }]
        }
      })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanClaudeCodeSessions(db, join(dir, "claude")).observations, 1);
    const row = db.prepare("SELECT text FROM observations").get() as { text: string };
    db.close();
    assert.equal(row.text, "Please keep this Claude request.");
    assert.doesNotMatch(row.text, /<subagent_notification>|agent_path|completed|hidden report/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claude scanner stores readable attachment references", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-source-claude-attachments-"));
  try {
    mkdirSync(join(dir, "claude"));
    writeFileSync(join(dir, "claude", "session.jsonl"), [
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Please review these inputs." },
            { type: "image", name: "mockup.png", path: "/tmp/mockup.png" },
            { type: "attachment", name: "notes.md", path: "/tmp/notes.md" },
            { type: "text", text: '<image name="mockup.png" path="/tmp/mockup.png"></image>' }
          ]
        }
      })
    ].join("\n"));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanClaudeCodeSessions(db, join(dir, "claude")).observations, 1);
    const row = db.prepare("SELECT text FROM observations").get() as { text: string };
    db.close();

    assert.match(row.text, /Please review these inputs/);
    assert.match(row.text, /Image: mockup\.png \(\/tmp\/mockup\.png\)/);
    assert.match(row.text, /File: notes\.md \(\/tmp\/notes\.md\)/);
    assert.equal((row.text.match(/\/tmp\/mockup\.png/g) ?? []).length, 1);
    assert.doesNotMatch(row.text, /<image|<\/image>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkpoint rescans when jsonl file mtime and size change", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-inbox-checkpoint-"));
  try {
    mkdirSync(join(dir, "codex"));
    const file = join(dir, "codex", "session.jsonl");
    writeFileSync(file, JSON.stringify({ role: "user", text: "Please scan once" }));

    const db = openDatabase(getAppPaths(join(dir, "home")));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 1);
    writeFileSync(file, [
      JSON.stringify({ role: "user", text: "Please scan once" }),
      JSON.stringify({ role: "user", text: "Please scan twice now" })
    ].join("\n"));
    assert.equal(scanCodexSessions(db, join(dir, "codex")).observations, 2);
    const row = db.prepare("SELECT COUNT(*) as count FROM observations").get();
    db.close();
    assert.ok(row);
    assert.equal(row.count, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeCursorItemTable(path: string, conversations: Record<string, unknown>): void {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)");
  db.prepare("DELETE FROM ItemTable").run();
  db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
    "composer.composerData",
    JSON.stringify({ allComposers: conversations })
  );
  db.close();
}

function cursorConversation(id: string, title: string, user: string, assistant: string): unknown {
  return {
    id,
    title,
    messages: [
      { role: "user", text: user, createdAt: "2026-01-01T00:00:00.000Z" },
      { role: "assistant", markdown: assistant, createdAt: "2026-01-01T00:00:01.000Z" }
    ]
  };
}

function writeCursorAgentTranscript(projectsRoot: string, encodedProject: string, id: string, records: Array<Record<string, unknown>>): string {
  const transcriptDir = join(projectsRoot, encodedProject, "agent-transcripts", id);
  mkdirSync(transcriptDir, { recursive: true });
  const path = join(transcriptDir, `${id}.jsonl`);
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n"));
  return path;
}
