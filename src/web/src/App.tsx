import { useEffect, useState } from "react";
import { ApiError, api, localizedUserFacingError } from "./api/client.js";
import { AppShell } from "./components/app-shell.js";
import { SettingsWorkspace } from "./components/settings-workspace.js";
import { SourcesWorkspace } from "./components/sources-workspace.js";
import { TodoBoard } from "./components/todo-board.js";
import { organizeFailureReasonText, preflightCheckText, readLocale, textFor, writeLocale, type Locale } from "./i18n.js";
import type { ObservationRecord, OrganizeResult, OrganizeStatus, PreflightResult, PublicAppConfig, SessionRecord, SourceSummary, StartupScanStatus, TodoCard, TodoEvidence } from "./types.js";
import type { SourceFilter, View } from "./view-model.js";

const SESSION_PAGE_SIZE = 50;
const ORGANIZE_HISTORY_LIMIT = 5;

interface OrganizeHistoryItem {
  id: string;
  createdAt: string;
  result: OrganizeResult;
}

export function App() {
  const [view, setView] = useState<View>("todos");
  const [todos, setTodos] = useState<TodoCard[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [locale, setLocale] = useState<Locale>(() => readLocale());
  const [sourceSummaries, setSourceSummaries] = useState<SourceSummary[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sessionOffset, setSessionOffset] = useState(0);
  const [observationsBySession, setObservationsBySession] = useState<Record<string, ObservationRecord[]>>({});
  const [evidenceByTodo, setEvidenceByTodo] = useState<Record<string, TodoEvidence[]>>({});
  const [evidenceErrorsByTodo, setEvidenceErrorsByTodo] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<PublicAppConfig | null>(null);
  const [startup, setStartup] = useState<StartupScanStatus | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [highlightedObservationId, setHighlightedObservationId] = useState<string>("");
  const [status, setStatus] = useState<string>(() => textFor(readLocale()).ready);
  const [organizeHistory, setOrganizeHistory] = useState<OrganizeHistoryItem[]>([]);
  const [organizeRunning, setOrganizeRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startupNoticeShown, setStartupNoticeShown] = useState(false);
  const text = textFor(locale);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    writeLocale(locale);
  }, [locale]);

  useEffect(() => {
    void loadSessions(sourceFilter, 0);
  }, [sourceFilter]);

  useEffect(() => {
    if (!selectedSessionId && sessions[0]) setSelectedSessionId(sessions[0].id);
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    if (view !== "sources" || !highlightedObservationId || !observationsBySession[selectedSessionId]) return;
    let frame = 0;
    let attempts = 0;
    const scroll = () => {
      const target = document.getElementById(`obs-${highlightedObservationId}`);
      if (target) {
        target.scrollIntoView({ block: "center" });
        return;
      }
      if (attempts++ < 5) frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [view, selectedSessionId, highlightedObservationId, observationsBySession]);

  useEffect(() => {
    if (!startup) return;
    if (startup.status === "indexing") {
      const timer = window.setTimeout(() => void refresh(), 500);
      return () => window.clearTimeout(timer);
    }
    const message = startupStatusMessage(startup, locale);
    if (message && !startupNoticeShown) {
      setStatus(message);
      setStartupNoticeShown(true);
    }
  }, [locale, startup, startupNoticeShown]);

  useEffect(() => {
    if (!organizeRunning) return;
    const timer = window.setTimeout(async () => {
      const nextStatus = await api<OrganizeStatus>("/todos/organize/status");
      setOrganizeRunning(nextStatus.running);
      if (nextStatus.running) return;
      await refresh();
      setStatus(text.ready);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [locale, organizeRunning]);

  async function refresh() {
    const [nextTodos, nextSources, nextSettings, nextStartup, nextOrganizeStatus] = await Promise.all([
      api<TodoCard[]>("/todos"),
      api<SourceSummary[]>("/sources"),
      api<PublicAppConfig>("/settings"),
      api<StartupScanStatus>("/startup/scan"),
      api<OrganizeStatus>("/todos/organize/status")
    ]);
    setTodos(nextTodos);
    setSourceSummaries(nextSources);
    setSettings(nextSettings);
    setStartup(nextStartup);
    setOrganizeRunning(nextOrganizeStatus.running);
    if (nextOrganizeStatus.running) setStatus(text.organizing);
    await loadSessions(sourceFilter, 0);
  }

  async function refreshSources() {
    setBusy(true);
    setStatus(text.refreshingSources);
    try {
      await Promise.allSettled([scanSource("codex"), scanSource("claude-code"), scanSource("cursor")]);
      await refresh();
      setStatus(text.ready);
    } catch {
      setStatus(localizedUserFacingError("source_scan_failed", locale));
    } finally {
      setBusy(false);
    }
  }

  async function loadSessions(filter: SourceFilter, offset: number) {
    const query = new URLSearchParams({
      limit: String(SESSION_PAGE_SIZE),
      offset: String(offset)
    });
    if (filter !== "all") query.set("source", filter);
    const nextSessions = await api<SessionRecord[]>(`/sessions?${query.toString()}`);
    setSessions((current) => offset === 0 ? nextSessions : mergeSessions(current, nextSessions));
    setSessionOffset(offset + nextSessions.length);
    if (offset === 0) {
      setSelectedSessionId(nextSessions[0]?.id ?? "");
      setHighlightedObservationId("");
    }
  }

  async function organize() {
    if (organizeRunning) return;
    setBusy(true);
    setStatus(text.organizing);
    try {
      const preflight = await api<PreflightResult>("/diagnostics/preflight", { method: "POST", body: {} });
      if (!preflight.canOrganize) {
        const result = preflightFailureResult(preflight, locale);
        setStatus(text.preflightFailed);
        rememberOrganizeResult(result);
        return;
      }
      setOrganizeRunning(true);
      const result = await api<OrganizeResult>("/todos/organize", { method: "POST", body: {} });
      await refresh();
      setStatus(organizeStatus(result, locale));
      rememberOrganizeResult(result);
    } catch (error) {
      const message = (error as Error).message;
      if (message === localizedUserFacingError("organize_in_progress", locale)) {
        setOrganizeRunning(true);
        setStatus(message);
        return;
      }
      if (error instanceof ApiError) {
        const result = organizeResultFromError(error);
        if (result) {
          await refresh();
          setStatus(organizeStatus(result, locale));
          rememberOrganizeResult(result);
          return;
        }
      }
      const result: OrganizeResult = { created: 0, updated: 0, warnings: ["organize_failed"], durationMs: 0 };
      setStatus(localizedUserFacingError("organize_failed", locale));
      rememberOrganizeResult(result);
    } finally {
      try {
        const nextStatus = await api<OrganizeStatus>("/todos/organize/status");
        setOrganizeRunning(nextStatus.running);
      } catch {
        setOrganizeRunning(false);
      }
      setBusy(false);
    }
  }

  function rememberOrganizeResult(result: OrganizeResult) {
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString(), result };
    setOrganizeHistory((current) => [item, ...current].slice(0, ORGANIZE_HISTORY_LIMIT));
  }

  async function updateTodo(id: string, status: TodoCard["status"]) {
    await api<TodoCard>(`/todos/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
    await refresh();
  }

  async function clearTodoCards() {
    await api("/todos/clear", { method: "POST", body: {} });
    await refresh();
    setEvidenceByTodo({});
    setEvidenceErrorsByTodo({});
    setStatus(text.todoCardsCleared);
  }

  async function openTodoSources(todo: TodoCard, target?: Pick<TodoEvidence, "sessionId" | "observationId">) {
    const sessionId = target?.sessionId ?? todo.origin?.sessionId;
    const observationId = target?.observationId ?? todo.origin?.observationId;
    if (!sessionId || !observationId) {
      setView("sources");
      setStatus(text.noLinkedSource);
      return;
    }
    const session = await ensureSessionLoaded(sessionId);
    if (!session) {
      setView("sources");
      setStatus(text.linkedSourceMissing);
      return;
    }
    setSelectedSessionId(sessionId);
    setHighlightedObservationId(observationId);
    await loadObservations(sessionId);
    setView("sources");
  }

  async function ensureSessionLoaded(sessionId: string): Promise<SessionRecord | null> {
    const existing = sessions.find((session) => session.id === sessionId);
    if (existing) return existing;
    const [session] = await api<SessionRecord[]>(`/sessions?sessionId=${encodeURIComponent(sessionId)}`);
    if (!session) return null;
    setSessions((current) => mergeSessions([session], current));
    return session;
  }

  async function loadObservations(sessionId: string) {
    if (observationsBySession[sessionId]) return;
    const observations = await api<ObservationRecord[]>(`/sessions/${encodeURIComponent(sessionId)}/observations`);
    setObservationsBySession((current) => ({ ...current, [sessionId]: observations }));
  }

  async function loadTodoEvidence(todoId: string) {
    if (evidenceByTodo[todoId]) return;
    try {
      const evidence = await api<TodoEvidence[]>(`/todos/${encodeURIComponent(todoId)}/evidence`);
      setEvidenceByTodo((current) => ({ ...current, [todoId]: evidence }));
      setEvidenceErrorsByTodo((current) => ({ ...current, [todoId]: "" }));
    } catch (error) {
      const message = (error as Error).message;
      setEvidenceErrorsByTodo((current) => ({ ...current, [todoId]: message }));
      setStatus(message);
    }
  }

  const openTodos = todos.filter((todo) => todo.status === "todo");
  const closedTodos = todos.filter((todo) => todo.status !== "todo");

  return (
    <AppShell
      text={text}
      view={view}
      status={status}
      busy={busy || organizeRunning}
      onView={setView}
      onRefresh={() => void refreshSources()}
      onOrganize={() => void organize()}
    >
      {view === "todos" && (
        <TodoBoard
          openTodos={openTodos}
          closedTodos={closedTodos}
          onComplete={(id) => void updateTodo(id, "done")}
          onIgnore={(id) => void updateTodo(id, "ignored")}
          onRestore={(id) => void updateTodo(id, "todo")}
          onSources={(todo, target) => void openTodoSources(todo, target)}
          evidenceByTodo={evidenceByTodo}
          evidenceErrorsByTodo={evidenceErrorsByTodo}
          onSelectTodo={(todo) => void loadTodoEvidence(todo.id)}
          onOrganize={() => void organize()}
          busy={busy || organizeRunning}
          locale={locale}
          organizeHistory={<OrganizeHistoryPanel items={organizeHistory} locale={locale} />}
        />
      )}
      {view === "sources" && (
        <SourcesWorkspace
          sessions={sessions}
          sourceSummaries={sourceSummaries}
          sourceFilter={sourceFilter}
          sessionOffset={sessionOffset}
          observationsBySession={observationsBySession}
          selectedSessionId={selectedSessionId}
          highlightedObservationId={highlightedObservationId}
          locale={locale}
          onFilter={(filter) => setSourceFilter(filter)}
          onLoadMore={() => void loadSessions(sourceFilter, sessionOffset)}
          onSelect={(sessionId) => {
            setSelectedSessionId(sessionId);
            void loadObservations(sessionId);
          }}
        />
      )}
      {view === "settings" && settings && (
        <SettingsWorkspace
          settings={settings}
          startup={startup}
          locale={locale}
          onLocale={(nextLocale) => {
            setLocale(nextLocale);
            setStatus(textFor(nextLocale).ready);
          }}
          onSaved={async (message) => {
            await refresh();
            setStatus(message ?? textFor(locale).settingsSaved);
          }}
          onClearTodos={() => clearTodoCards()}
        />
      )}
    </AppShell>
  );
}

async function scanSource(source: Extract<SourceFilter, "codex" | "claude-code" | "cursor">): Promise<void> {
  await api("/sources/scan", { method: "POST", body: { source } });
}

function OrganizeHistoryPanel({ items, locale }: { items: OrganizeHistoryItem[]; locale: Locale }) {
  const text = textFor(locale);
  const latest = items[0];
  const [open, setOpen] = useState(latest ? isFailedOrganizeResult(latest.result) : false);
  useEffect(() => {
    if (latest) setOpen(isFailedOrganizeResult(latest.result));
  }, [latest?.id]);
  if (items.length === 0) return null;
  return (
    <details
      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-sm"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium text-[var(--app-ink)]">{text.organizeHistory}</summary>
      <div className="mt-3 grid gap-3">
        {items.map((item) => {
          const result = item.result;
          return (
            <section key={item.id} className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-[var(--app-ink)]">{organizeStatus(result, locale)}</p>
                <time className="text-xs text-[var(--app-subtle)]" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale)}</time>
              </div>
              <p className="mt-1 text-xs text-[var(--app-subtle)]">{text.organizeDetails(result.created, result.updated, Math.round(result.durationMs))}</p>
              <OrganizeDetailsSummary result={result} locale={locale} />
              {result.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--app-muted)]">
                  {result.warnings.map((warning) => <li key={warning}>{localizedUserFacingError(warning, locale)}</li>)}
                </ul>
              )}
              {result.details?.batchFailures?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--app-muted)]">
                  {dedupeBatchFailures(result.details.batchFailures).map((failure) => (
                    <li key={`${failure.warning}-${failure.reason}`}>
                      {localizedUserFacingError(failure.warning, locale)} {organizeFailureReasonText(failure.reason, locale)}
                      {failure.count > 1 ? ` ×${failure.count}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.details?.failureReason && <p className="mt-2 text-[var(--app-muted)]">{result.details.failureReason}</p>}
            </section>
          );
        })}
      </div>
    </details>
  );
}

function dedupeBatchFailures(failures: NonNullable<NonNullable<OrganizeResult["details"]>["batchFailures"]>) {
  const byReason = new Map<string, { warning: string; reason: string; count: number }>();
  for (const failure of failures) {
    const key = `${failure.warning}\0${failure.reason}`;
    const current = byReason.get(key);
    if (current) current.count++;
    else byReason.set(key, { warning: failure.warning, reason: failure.reason, count: 1 });
  }
  return Array.from(byReason.values());
}

function OrganizeDetailsSummary({ result, locale }: { result: OrganizeResult; locale: Locale }) {
  const text = textFor(locale);
  const details: string[] = [];
  if (result.scanned !== undefined) details.push(text.organizeScanned(result.scanned));
  if (result.details?.scope) {
    details.push(text.organizeScopeDetails(
      result.details.scope.sessionsScanned,
      result.details.scope.sessionsDropped,
      result.details.scope.observationsDropped
    ));
  }
  if (result.details?.truncations?.length) details.push(text.organizeTruncationDetails(result.details.truncations.length));
  if (result.details?.batchFailures?.length) {
    details.push(text.organizeBatchFailureDetails(result.details.batchFailures.length));
  }
  return details.length > 0 ? <p className="mt-2 text-xs text-[var(--app-muted)]">{details.join(" ")}</p> : null;
}

function organizeStatus(result: OrganizeResult, locale: Locale): string {
  if (result.warnings.includes("organize_failed")) return localizedUserFacingError("organize_failed", locale);
  const hardFailure = organizeHardFailure(result);
  if (hardFailure) return localizedUserFacingError(hardFailure, locale);
  const text = textFor(locale);
  const summary = text.organized(result.created, result.updated);
  return result.warnings.length > 0 ? `${summary} ${text.organizeNeedsReview}` : summary;
}

function organizeHardFailure(result: OrganizeResult): string | undefined {
  if (result.created > 0 || result.updated > 0) return undefined;
  if (result.warnings.includes("llm_config_missing")) return "llm_config_missing";
  if (result.warnings.includes("llm_timeout")) return "llm_timeout";
  if (result.warnings.includes("llm_provider_failed")) return "llm_provider_failed";
  if (result.warnings.includes("llm_output_invalid")) return "llm_output_invalid";
  return undefined;
}

function isFailedOrganizeResult(result: OrganizeResult): boolean {
  return result.warnings.includes("organize_failed") || Boolean(organizeHardFailure(result));
}

function organizeResultFromError(error: ApiError): OrganizeResult | null {
  const data = error.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Partial<OrganizeResult>;
  if (typeof record.created !== "number" || typeof record.updated !== "number" || !Array.isArray(record.warnings)) return null;
  return record as OrganizeResult;
}

function preflightFailureResult(preflight: PreflightResult, locale: Locale): OrganizeResult {
  const failed = preflight.checks.filter((check) => check.status === "fail");
  return {
    created: 0,
    updated: 0,
    warnings: ["organize_failed"],
    details: {
      failureReason: failed
        .map((check) => preflightCheckText(check, locale))
        .join("\n")
    },
    durationMs: preflight.durationMs
  };
}

function startupStatusMessage(startup: StartupScanStatus | null, locale: Locale): string {
  if (!startup?.warnings.length) return "";
  return `${textFor(locale).sourceScanFailed}${startup.warnings.map((warning) => localizedUserFacingError(warning, locale)).join(" ")}`;
}

function mergeSessions(first: SessionRecord[], second: SessionRecord[]): SessionRecord[] {
  const seen = new Set<string>();
  return [...first, ...second].filter((session) => {
    if (seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
}
