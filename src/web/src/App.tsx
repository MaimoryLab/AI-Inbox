import {
  Archive,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Code2,
  Eye,
  FolderOpen,
  FolderKanban,
  Globe2,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare
} from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { api, localizedUserFacingError } from "./api/client.js";
import { Badge, Button, Card, IconButton, Input, SectionTitle } from "./components/ui.js";
import { readLocale, sourceLabel, textFor, writeLocale, type Locale } from "./i18n.js";
import { cn } from "./lib/utils.js";
import type { ObservationRecord, OrganizeResult, PublicAppConfig, SessionRecord, SourceKind, SourceSummary, StartupScanStatus, TodoCard } from "./types.js";

type View = "todos" | "sources" | "settings";
type SourceFilter = SourceKind | "all";
type SessionSource = Extract<SourceKind, "codex" | "claude-code">;
type SourceScanResult = { warning?: string };

const SESSION_PAGE_SIZE = 50;
const OPEN_GROUP_PREVIEW_LIMIT = 6;
const SESSION_GROUP_PREVIEW_LIMIT = 6;
const OBSERVATION_PREVIEW_LIMIT = 12;

export function App() {
  const [view, setView] = useState<View>("todos");
  const [todos, setTodos] = useState<TodoCard[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [locale, setLocale] = useState<Locale>(() => readLocale());
  const [sourceSummaries, setSourceSummaries] = useState<SourceSummary[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sessionOffset, setSessionOffset] = useState(0);
  const [observationsBySession, setObservationsBySession] = useState<Record<string, ObservationRecord[]>>({});
  const [settings, setSettings] = useState<PublicAppConfig | null>(null);
  const [startup, setStartup] = useState<StartupScanStatus | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [highlightedObservationId, setHighlightedObservationId] = useState<string>("");
  const [status, setStatus] = useState<string>(() => textFor(readLocale()).ready);
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
    requestAnimationFrame(() => document.getElementById(`obs-${highlightedObservationId}`)?.scrollIntoView({ block: "center" }));
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

  async function refresh() {
    const [nextTodos, nextSources, nextSettings, nextStartup] = await Promise.all([
      api<TodoCard[]>("/todos"),
      api<SourceSummary[]>("/sources"),
      api<PublicAppConfig>("/settings"),
      api<StartupScanStatus>("/startup/scan")
    ]);
    setTodos(nextTodos);
    setSourceSummaries(nextSources);
    setSettings(nextSettings);
    setStartup(nextStartup);
    await loadSessions(sourceFilter, 0);
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
    setBusy(true);
    setStatus(text.organizing);
    try {
      const result = await api<OrganizeResult>("/todos/organize", { method: "POST", body: {} });
      await refresh();
      setStatus(organizeStatus(result, locale));
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateTodo(id: string, status: "done" | "ignored") {
    await api<TodoCard>(`/todos/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
    await refresh();
  }

  async function openTodoSources(todo: TodoCard) {
    if (!todo.origin) {
      setView("sources");
      setStatus(text.noLinkedSource);
      return;
    }
    const session = await ensureSessionLoaded(todo.origin.sessionId);
    if (!session) {
      setView("sources");
      setStatus(text.linkedSourceMissing);
      return;
    }
    setSelectedSessionId(todo.origin.sessionId);
    setHighlightedObservationId(todo.origin.observationId);
    await loadObservations(todo.origin.sessionId);
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

  const openTodos = todos.filter((todo) => todo.status === "todo");
  const closedTodos = todos.filter((todo) => todo.status !== "todo");

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-neutral-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-neutral-300/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-500">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {text.appName}
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">{text.actionInbox}</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">{text.appSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label={text.refresh} onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            <Button aria-label={text.organizeAll} title={text.organizeAll} onClick={() => void organize()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {text.organize}
            </Button>
          </div>
        </header>

        <nav className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-neutral-300/80 bg-[var(--app-bg)]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0" aria-label={text.primaryNav}>
          <NavButton label={text.openView(text.todos)} active={view === "todos"} onClick={() => setView("todos")} icon={<CircleDot className="h-4 w-4" />}>{text.todos}</NavButton>
          <NavButton label={text.openView(text.sources)} active={view === "sources"} onClick={() => setView("sources")} icon={<FolderKanban className="h-4 w-4" />}>{text.sources}</NavButton>
          <NavButton label={text.openView(text.settings)} active={view === "settings"} onClick={() => setView("settings")} icon={<Settings className="h-4 w-4" />}>{text.settings}</NavButton>
        </nav>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            {view === "todos" && (
              <TodoWorkspace
                openTodos={openTodos}
                closedTodos={closedTodos}
                onComplete={(id) => void updateTodo(id, "done")}
                onIgnore={(id) => void updateTodo(id, "ignored")}
                onSources={(todo) => void openTodoSources(todo)}
                onOrganize={() => void organize()}
                busy={busy}
                locale={locale}
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
              />
            )}
          </section>
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="p-4">
              <SectionTitle>{text.status}</SectionTitle>
              <p className="mt-2 text-sm text-neutral-700">{status}</p>
            </Card>
            <Card className="p-4">
              <SectionTitle>{text.review}</SectionTitle>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Metric label={text.open} value={openTodos.length} />
                <Metric label={text.done} value={todos.filter((todo) => todo.status === "done").length} />
                <Metric label={text.sources} value={sessions.length} />
              </dl>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}

function NavButton({ active, onClick, icon, children, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-neutral-600",
        active ? "bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-200" : "hover:bg-white/70"
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

function TodoWorkspace(props: {
  openTodos: TodoCard[];
  closedTodos: TodoCard[];
  onComplete: (id: string) => void;
  onIgnore: (id: string) => void;
  onSources: (todo: TodoCard) => void;
  onOrganize: () => void;
  busy: boolean;
  locale: Locale;
}) {
  const text = textFor(props.locale);
  const [showClosed, setShowClosed] = useState(false);
  const [expandedOpenGroups, setExpandedOpenGroups] = useState<Record<string, boolean>>({});
  if (props.openTodos.length === 0 && props.closedTodos.length === 0) {
    return (
      <Card className="flex min-h-80 flex-col items-center justify-center p-6 text-center">
        <Sparkles className="h-10 w-10 text-neutral-400" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">{text.noCards}</h2>
        <p className="mt-1 max-w-md text-sm text-neutral-600">{text.noCardsDescription}</p>
        <Button aria-label={text.organizeEmpty} title={text.organizeEmpty} className="mt-4" onClick={props.onOrganize} disabled={props.busy}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {text.organize}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionTitle>{text.todos}</SectionTitle>
          <h2 className="text-xl font-semibold tracking-normal">{text.openLoopsTitle}</h2>
          <p className="mt-1 text-sm text-neutral-600">{text.openLoopsDescription}</p>
        </div>
        <Badge className="self-start border-blue-200 bg-blue-50 text-blue-700">{text.openCount(props.openTodos.length)}</Badge>
      </div>
      {todoGroups(props.openTodos, props.locale).map((group) => {
        const expanded = expandedOpenGroups[group.key] ?? false;
        const visibleTodos = expanded ? group.todos : group.todos.slice(0, OPEN_GROUP_PREVIEW_LIMIT);
        const hiddenCount = group.todos.length - visibleTodos.length;
        return (
        <section key={group.key} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50/70 px-3 py-2 text-left"
            aria-expanded={expanded}
            onClick={() => setExpandedOpenGroups((current) => ({ ...current, [group.key]: !expanded }))}
          >
            <span className="min-w-0">
              <h3 className="text-sm font-semibold text-neutral-800">{group.label}</h3>
              <span className="block truncate text-xs text-neutral-500">{group.description}</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <Badge className={group.badgeClass}>{group.todos.length}</Badge>
              <ChevronDown className={cn("h-4 w-4 text-neutral-500 transition", expanded && "rotate-180")} aria-hidden="true" />
            </span>
          </button>
          <div className="divide-y divide-neutral-100">
            {visibleTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} locale={props.locale} onComplete={props.onComplete} onIgnore={props.onIgnore} onSources={props.onSources} compactStatus />
            ))}
            {hiddenCount > 0 && (
              <div className="p-3">
              <Button variant="secondary" className="w-full" onClick={() => setExpandedOpenGroups((current) => ({ ...current, [group.key]: true }))}>
                {text.showMore(hiddenCount)}
              </Button>
              </div>
            )}
          </div>
        </section>
        );
      })}
      {props.closedTodos.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-white p-3">
          <button className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-neutral-700" type="button" aria-expanded={showClosed} onClick={() => setShowClosed(!showClosed)}>
            {text.completedIgnored}
            <span className="inline-flex items-center gap-2 text-xs font-medium text-neutral-500">
              {props.closedTodos.length}
              <ChevronDown className={cn("h-4 w-4 transition", showClosed && "rotate-180")} aria-hidden="true" />
            </span>
          </button>
          {showClosed && (
            <div className="mt-3 space-y-3">
              {props.closedTodos.map((todo) => (
                <TodoItem key={todo.id} todo={todo} locale={props.locale} onComplete={props.onComplete} onIgnore={props.onIgnore} onSources={props.onSources} muted />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function todoGroups(todos: TodoCard[], locale: Locale): Array<{ key: string; label: string; description: string; badgeClass: string; todos: TodoCard[] }> {
  const text = textFor(locale);
  const groups = [
    { key: "blocked", label: text.blocked, description: text.blockedDescription, badgeClass: "border-red-200 bg-red-50 text-red-700", todos: [] as TodoCard[] },
    { key: "in_progress", label: text.inProgress, description: text.inProgressDescription, badgeClass: "border-blue-200 bg-blue-50 text-blue-700", todos: [] as TodoCard[] },
    { key: "needs_review", label: text.needsReview, description: text.needsReviewDescription, badgeClass: "border-amber-200 bg-amber-50 text-amber-700", todos: [] as TodoCard[] }
  ];
  for (const todo of todos) {
    const state = todo.metadata.completionState?.toLowerCase().replace(/\s+/g, "_");
    const target = groups.find((group) => group.key === state) ?? groups[2];
    target.todos.push(todo);
  }
  return groups.filter((group) => group.todos.length > 0);
}

function TodoItem({ todo, muted, compactStatus, locale, onComplete, onIgnore, onSources }: {
  todo: TodoCard;
  muted?: boolean;
  compactStatus?: boolean;
  locale: Locale;
  onComplete: (id: string) => void;
  onIgnore: (id: string) => void;
  onSources: (todo: TodoCard) => void;
}) {
  const text = textFor(locale);
  return (
    <Card className={cn("relative overflow-hidden rounded-none border-0 border-b border-neutral-100 p-4 shadow-none last:border-b-0", muted && "opacity-70")}>
      <div className={cn("absolute inset-y-0 left-0 w-1", sourceRailClass(todo.origin?.source))} aria-hidden="true" />
      <div className="flex flex-col gap-4 pl-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {!compactStatus && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={todo.status === "todo" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-green-200 bg-green-50 text-green-700"}>{todo.status === "todo" ? text.open : todo.status === "done" ? text.done : text.ignored}</Badge>
              {todo.metadata.completionState && <Badge>{todo.metadata.completionState}</Badge>}
            </div>
          )}
          <h3 className="break-words text-lg font-semibold tracking-normal">{todo.title}</h3>
          <p className="break-words text-sm leading-6 text-neutral-700">{todo.description}</p>
          {todo.metadata.completionSummary && (
            <p className="break-words text-sm text-neutral-500">
              <span className="font-medium text-neutral-600">{text.agent}:</span> {todo.metadata.completionSummary}
            </p>
          )}
          <button aria-label={text.openSourceSession(todo.title)} className="flex max-w-full items-start gap-2 rounded-md text-left text-sm text-neutral-500 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-70" type="button" title={originLabel(todo, locale)} disabled={!todo.origin} onClick={() => onSources(todo)}>
            <SourceIcon source={todo.origin?.source} />
            <span className="min-w-0">
              <span className="block truncate font-medium text-neutral-600">{originProjectLabel(todo, locale)}</span>
              <span className="block truncate text-xs text-neutral-500">{originSessionLabel(todo, locale)}</span>
            </span>
          </button>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button aria-label={text.completeTodo(todo.title)} variant="secondary" onClick={() => onComplete(todo.id)}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {text.complete}
          </Button>
          <Button aria-label={text.openTodoSources(todo.title)} variant="secondary" onClick={() => onSources(todo)}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            {text.sources}
          </Button>
          <IconButton label={text.ignoreTodo(todo.title)} onClick={() => onIgnore(todo.id)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </Card>
  );
}

function SourcesWorkspace({ sessions, sourceSummaries, sourceFilter, sessionOffset, observationsBySession, selectedSessionId, highlightedObservationId, locale, onFilter, onLoadMore, onSelect }: {
  sessions: SessionRecord[];
  sourceSummaries: SourceSummary[];
  sourceFilter: SourceFilter;
  sessionOffset: number;
  observationsBySession: Record<string, ObservationRecord[]>;
  selectedSessionId: string;
  highlightedObservationId: string;
  locale: Locale;
  onFilter: (filter: SourceFilter) => void;
  onLoadMore: () => void;
  onSelect: (sessionId: string) => void;
}) {
  const text = textFor(locale);
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showAllMessages, setShowAllMessages] = useState(false);
  const selected = sessions.find((session) => session.id === selectedSessionId) ?? (selectedSessionId ? undefined : sessions[0]);
  const observations = selected ? observationsBySession[selected.id] ?? [] : [];
  const visibleObservations = showAllMessages ? observations : observations.slice(0, OBSERVATION_PREVIEW_LIMIT);
  const totalSessions = sourceFilter === "all"
    ? sourceSummaries.reduce((sum, source) => sum + source.sessions, 0)
    : sourceSummaries.find((source) => source.source === sourceFilter)?.sessions ?? 0;
  const filters: SourceFilter[] = ["all", "codex", "claude-code", "browser"];
  const filteredSessions = sessions.filter((session) => matchesSessionQuery(session, query, locale));
  const groups = sessionGroups(filteredSessions, locale);

  useEffect(() => {
    setShowAllMessages(false);
  }, [selectedSessionId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="min-w-0 p-3">
        <div className="mb-3 space-y-3 px-1">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-neutral-400" aria-hidden="true" />
            <SectionTitle>{text.sources}</SectionTitle>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
            <Input aria-label={text.searchSources} placeholder={text.searchSources} value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" />
          </label>
          <div className="flex gap-1 overflow-x-auto" aria-label={text.sourceFilter}>
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                  sourceFilter === filter ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                )}
                onClick={() => onFilter(filter)}
              >
                {filter === "all" ? text.all : sourceLabel(filter, locale)}
                <span>{sourceCount(sourceSummaries, filter)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto pr-1">
          {sessions.length === 0 && <div className="rounded-md bg-neutral-50 p-4 text-sm text-neutral-600">{text.connectSource}</div>}
          {sessions.length > 0 && groups.length === 0 && <div className="rounded-md bg-neutral-50 p-4 text-sm text-neutral-600">{text.noSessionsMatch}</div>}
          {groups.map((group) => {
            const expanded = expandedGroups[group.key] ?? false;
            const visibleSessions = expanded ? group.sessions : group.sessions.slice(0, SESSION_GROUP_PREVIEW_LIMIT);
            const hiddenCount = group.sessions.length - visibleSessions.length;
            return (
              <section key={group.key} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                <button
                  type="button"
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50/70 px-3 py-2 text-left"
                  onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: !expanded }))}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FolderOpen className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-800">{group.label}</span>
                      <span className="block text-xs text-neutral-500">{text.sessionCount(group.sessions.length)}</span>
                    </span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-neutral-500 transition", expanded && "rotate-180")} aria-hidden="true" />
                </button>
                <div className="divide-y divide-neutral-100">
                  {visibleSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={cn(
                        "w-full p-3 text-left transition",
                        selected?.id === session.id ? "bg-blue-50" : "bg-white hover:bg-neutral-50"
                      )}
                      onClick={() => {
                        setShowAllMessages(false);
                        onSelect(session.id);
                      }}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <SourceIcon source={session.source} />
                        <span className="truncate">{sourceLabel(session.source, locale)}</span>
                      </div>
                      <div className="mt-1 truncate text-sm text-neutral-600">{session.preview || text.temporarySession}</div>
                      <div className="mt-2 text-xs text-neutral-400">{text.messageCount(session.observationCount)}</div>
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50"
                      onClick={() => setExpandedGroups((current) => ({ ...current, [group.key]: true }))}
                    >
                      {text.moreSessions(hiddenCount)}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
          {sessionOffset < totalSessions && (
            <Button variant="secondary" className="w-full" onClick={onLoadMore}>
              {text.loadMore}
            </Button>
          )}
        </div>
      </Card>
      <Card className="min-w-0 p-4">
        {selected ? (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SectionTitle>{sourceLabel(selected.source, locale)}</SectionTitle>
                <h2 className="truncate text-xl font-semibold tracking-normal">{selected.preview || text.temporarySession}</h2>
              </div>
              <Badge>{text.messageCount(selected.observationCount)}</Badge>
            </div>
            <div className="max-h-[calc(100vh-220px)] space-y-3 overflow-y-auto pr-1">
              {observations.length === 0 && <div className="rounded-md bg-neutral-50 p-4 text-sm text-neutral-600">{text.selectSource}</div>}
              {visibleObservations.map((observation) => (
                <article
                  id={`obs-${observation.id}`}
                  key={observation.id}
                  className={cn(
                    "rounded-md border border-neutral-200 bg-white p-3",
                    highlightedObservationId === observation.id && "border-amber-300 bg-amber-50"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-neutral-500">
                    <span className="capitalize">{observation.role === "unknown" ? text.message : observation.role}</span>
                    <time>{new Date(observation.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-800">{observation.text}</p>
                </article>
              ))}
              {!showAllMessages && observations.length > visibleObservations.length && (
                <Button variant="secondary" className="w-full" onClick={() => setShowAllMessages(true)}>
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                  {text.showAllMessages}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-md bg-neutral-50 p-4 text-sm text-neutral-600">{text.noSourceSessions}</div>
        )}
      </Card>
    </div>
  );
}

function SettingsWorkspace({ settings, startup, locale, onLocale, onSaved }: {
  settings: PublicAppConfig;
  startup: StartupScanStatus | null;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  onSaved: (message?: string) => Promise<void>;
}) {
  const text = textFor(locale);
  const [form, setForm] = useState(settings);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const changedSources = changedSourcePaths(settings.sources, form.sources);
      const saved = await api<PublicAppConfig>("/settings", {
        method: "PUT",
        body: {
          sources: form.sources,
          llm: {
            enabled: form.llm.enabled,
            provider: "openai",
            model: form.llm.model,
            endpoint: form.llm.endpoint,
            thinkingDepth: form.llm.thinkingDepth,
            timeoutMs: form.llm.timeoutMs,
            ...(clearKey ? { apiKey: "" } : apiKey ? { apiKey } : {})
          },
          organize: form.organize
        }
      });
      setForm(saved);
      await onSaved(await scanChangedSources(changedSources, locale));
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-neutral-500" aria-hidden="true" />
          <SectionTitle>{text.settings}</SectionTitle>
        </div>
        <div className="mt-4 space-y-6">
          <section>
            <h2 className="text-base font-semibold">{text.language}</h2>
            <p className="mt-1 text-sm text-neutral-600">{text.languageDescription}</p>
            <div className="mt-3 inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-1">
              {(["zh-CN", "en-US"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "rounded px-3 py-1.5 text-sm font-medium",
                    locale === option ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-600 hover:text-neutral-950"
                  )}
                  aria-pressed={locale === option}
                  onClick={() => onLocale(option)}
                >
                  {option === "zh-CN" ? text.chinese : text.english}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-base font-semibold">{text.sourceSettings}</h2>
            <p className="mt-1 text-sm text-neutral-600">{text.sourceSettingsDescription}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label={text.codexSource}>
                <Input value={form.sources.codex.path ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, sources: { ...form.sources, codex: { path: event.target.value } } })} />
              </Field>
              <Field label={text.claudeSource}>
                <Input value={form.sources["claude-code"].path ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, sources: { ...form.sources, "claude-code": { path: event.target.value } } })} />
              </Field>
            </div>
            {startup?.discovery.length ? (
              <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{text.discovery}</div>
                <div className="mt-2 grid gap-2 text-sm text-neutral-700">
                  {startup.discovery.map((item) => (
                    <div key={item.source} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium">{sourceLabel(item.source, locale)}</span>
                      <span className="text-neutral-600">
                        {discoveryStatusLabel(item.status, locale)}
                        {item.path ? ` · ${item.path}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
          <section>
            <h2 className="text-base font-semibold">{text.extraction}</h2>
            <p className="mt-1 text-sm text-neutral-600">{text.extractionDescription}</p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <Field label={text.lookbackDays}>
                <Input type="number" min={1} value={form.organize.sinceDays} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, organize: { ...form.organize, sinceDays: Number(event.target.value) } })} />
              </Field>
              <Field label={text.maxSessions}>
                <Input type="number" min={1} max={200} value={form.organize.maxSessions} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, organize: { ...form.organize, maxSessions: Number(event.target.value) } })} />
              </Field>
              <Field label={text.apiKey}>
                <Input type="password" placeholder={settings.llm.apiKeyConfigured ? `${text.configured} ${settings.llm.apiKeyMasked}` : text.pasteApiKey} value={apiKey} onChange={(event: ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value)} />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} />
              {text.clearSavedApiKey}
            </label>
          </section>
        </div>
        <Button className="mt-4" onClick={() => void save()} disabled={saving}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {text.saveSettings}
        </Button>
        {saveError && <p className="mt-3 text-sm text-red-700">{saveError}</p>}
      </Card>
      <details className="rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
          {text.advancedDiagnostics}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </summary>
        <div className="mt-3 grid gap-4 text-sm text-neutral-600 md:grid-cols-2">
          <Field label={text.model}>
            <Input value={form.llm.model} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, llm: { ...form.llm, model: event.target.value } })} />
          </Field>
          <Field label={text.endpoint}>
            <Input value={form.llm.endpoint} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, llm: { ...form.llm, endpoint: event.target.value } })} />
          </Field>
          <p>{text.startupScan}: {startup?.status ?? "idle"}</p>
          <p>{text.extraction}: {settings.llm.apiKeyConfigured ? text.configured : text.needsSetup}</p>
          {startup?.warnings.map((warning: string) => <p key={warning}>{localizedUserFacingError(warning, locale)}</p>)}
        </div>
      </details>
    </div>
  );
}

function changedSourcePaths(
  before: PublicAppConfig["sources"],
  after: PublicAppConfig["sources"]
): SessionSource[] {
  return (["codex", "claude-code"] as const).filter((source) =>
    (before[source].path ?? "").trim() !== (after[source].path ?? "").trim()
  );
}

function discoveryStatusLabel(status: "configured" | "discovered" | "missing", locale: Locale): string {
  const text = textFor(locale);
  if (status === "configured") return text.discoveryConfigured;
  if (status === "discovered") return text.discoveryDiscovered;
  return text.discoveryMissing;
}

function sessionGroups(sessions: SessionRecord[], locale: Locale): Array<{ key: string; label: string; sessions: SessionRecord[] }> {
  const groups = new Map<string, { key: string; label: string; sessions: SessionRecord[] }>();
  for (const session of sessions) {
    const label = sessionProjectLabel(session, locale);
    const key = `${session.source}:${label}`;
    const group = groups.get(key) ?? { key, label, sessions: [] };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function matchesSessionQuery(session: SessionRecord, query: string, locale: Locale): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [sourceLabel(session.source, locale), sessionProjectLabel(session, locale), session.preview, session.path]
    .some((value) => value.toLowerCase().includes(term));
}

function sessionProjectLabel(session: SessionRecord, locale: Locale): string {
  if (session.source === "browser") return session.path === "browser" ? textFor(locale).browserSessions : readablePathSegment(session.path, locale);
  const parts = session.path.split("/").filter(Boolean);
  if (session.source === "claude-code") return readablePathSegment(parts.at(-2) ?? parts.at(-1), locale);
  return readablePathSegment(parts.at(-3) ?? parts.at(-2) ?? parts.at(-1), locale);
}

function readablePathSegment(value: string | undefined, locale: Locale): string {
  if (!value) return textFor(locale).temporarySession;
  return value.replace(/\.jsonl$/u, "").replace(/^-+|-+$/gu, "").replace(/[-_]+/gu, " ") || textFor(locale).temporarySession;
}

async function scanChangedSources(sources: SessionSource[], locale: Locale): Promise<string | undefined> {
  if (sources.length === 0) return undefined;
  const text = textFor(locale);
  const failures: string[] = [];
  for (const source of sources) {
    try {
      const result = await api<SourceScanResult>("/sources/scan", { method: "POST", body: { source } });
      if (result.warning) failures.push(`${sourceLabel(source, locale)}: ${localizedUserFacingError(result.warning, locale)}`);
    } catch (error) {
      failures.push(`${sourceLabel(source, locale)}: ${(error as Error).message}`);
    }
  }
  if (failures.length > 0) return `${text.sourceScanFailed}${failures.join(" ")}`;
  return text.sourceScanFinished;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-neutral-700">
      {label}
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-neutral-50 p-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function sourceRailClass(source?: SourceKind): string {
  if (source === "codex") return "bg-blue-500";
  if (source === "claude-code") return "bg-green-500";
  if (source === "browser") return "bg-amber-500";
  return "bg-neutral-300";
}

function SourceIcon({ source }: { source?: SourceKind }) {
  const className = cn("h-4 w-4 shrink-0", source ? "text-neutral-500" : "text-neutral-400");
  if (source === "codex") return <TerminalSquare className={className} aria-hidden="true" />;
  if (source === "claude-code") return <Bot className={className} aria-hidden="true" />;
  if (source === "browser") return <Globe2 className={className} aria-hidden="true" />;
  return <Code2 className={className} aria-hidden="true" />;
}

function organizeStatus(result: OrganizeResult, locale: Locale): string {
  const text = textFor(locale);
  const summary = text.organized(result.created, result.updated);
  if (result.warnings.length === 0) return summary;
  const warnings = result.warnings.map((warning) => localizedUserFacingError(warning, locale)).join(" ");
  if (result.created + result.updated > 0) return `${summary} ${text.reviewSessions}${warnings}`;
  return `${summary} ${warnings}`;
}

function startupStatusMessage(startup: StartupScanStatus | null, locale: Locale): string {
  if (!startup?.warnings.length) return "";
  return `${textFor(locale).sourceScanFailed}${startup.warnings.map((warning) => localizedUserFacingError(warning, locale)).join(" ")}`;
}

function originLabel(todo: TodoCard, locale: Locale): string {
  const text = textFor(locale);
  if (!todo.origin) return text.sourceUnavailable;
  const source = sourceLabel(todo.origin.source, locale);
  const project = todo.origin.projectTitle || source;
  const session = todo.origin.sessionTitle || text.temporarySession;
  return `${source} · ${project} › ${session}`;
}

function originProjectLabel(todo: TodoCard, locale: Locale): string {
  const text = textFor(locale);
  if (!todo.origin) return text.sourceUnavailable;
  const source = sourceLabel(todo.origin.source, locale);
  const project = todo.origin.projectTitle || source;
  return `${source} · ${project}`;
}

function originSessionLabel(todo: TodoCard, locale: Locale): string {
  return todo.origin?.sessionTitle || textFor(locale).temporarySession;
}

function sourceCount(sources: SourceSummary[], filter: SourceFilter): number {
  if (filter === "all") return sources.reduce((sum, source) => sum + source.sessions, 0);
  return sources.find((source) => source.source === filter)?.sessions ?? 0;
}

function mergeSessions(first: SessionRecord[], second: SessionRecord[]): SessionRecord[] {
  const seen = new Set<string>();
  return [...first, ...second].filter((session) => {
    if (seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
}
