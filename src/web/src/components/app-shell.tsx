import { ListTodo, Loader2, PanelLeft, RefreshCw, Settings2, Sparkles } from "lucide-react";
import type { textFor } from "../i18n.js";
import { cn } from "../lib/utils.js";
import type { View } from "../view-model.js";
import { Button, IconButton, SectionTitle } from "./ui.js";

type AppText = ReturnType<typeof textFor>;

export function AppShell({ text, view, status, openCount, doneCount, sourcesCount, busy, onView, onRefresh, onOrganize, children }: {
  text: AppText;
  view: View;
  status: string;
  openCount: number;
  doneCount: number;
  sourcesCount: number;
  busy: boolean;
  onView: (view: View) => void;
  onRefresh: () => void;
  onOrganize: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[var(--app-line)] pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--app-subtle)]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {text.appName}
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-[var(--app-ink)]">{text.actionInbox}</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--app-muted)]">{text.appSubtitle}</p>
          </div>
          <div className="grid gap-3 xl:min-w-[520px] xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="order-2 min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 xl:order-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <SectionTitle>{text.status}</SectionTitle>
                  <p className="mt-0.5 truncate text-sm text-[var(--app-muted)]" title={status}>{status}</p>
                </div>
                <dl className="grid shrink-0 grid-cols-3 gap-2 text-right">
                  <Metric label={text.open} value={openCount} />
                  <Metric label={text.done} value={doneCount} />
                  <Metric label={text.sources} value={sourcesCount} />
                </dl>
              </div>
            </div>
            <div className="order-1 flex flex-wrap items-center justify-start gap-2 xl:order-2 xl:justify-end">
              <IconButton label={text.refresh} onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </IconButton>
              <Button aria-label={text.organizeAll} title={text.organizeAll} onClick={onOrganize} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                {text.organize}
              </Button>
            </div>
          </div>
        </header>

        <nav className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-[var(--app-line)] bg-[var(--app-bg)]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0 app-scroll" aria-label={text.primaryNav}>
          <NavButton label={text.openView(text.todos)} active={view === "todos"} onClick={() => onView("todos")} icon={<ListTodo className="h-4 w-4" />}>{text.todos}</NavButton>
          <NavButton label={text.openView(text.sources)} active={view === "sources"} onClick={() => onView("sources")} icon={<PanelLeft className="h-4 w-4" />}>{text.sources}</NavButton>
          <NavButton label={text.openView(text.settings)} active={view === "settings"} onClick={() => onView("settings")} icon={<Settings2 className="h-4 w-4" />}>{text.settings}</NavButton>
        </nav>

        <section className="mt-4 min-w-0">{children}</section>
      </div>
    </main>
  );
}

function NavButton({ active, onClick, icon, children, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-[var(--app-muted)] transition active:translate-y-px",
        active ? "bg-[var(--app-surface)] text-[var(--app-ink)] shadow-sm ring-1 ring-[var(--app-border)]" : "hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-ink)]"
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-14 rounded-md bg-[var(--app-surface-muted)] px-2 py-1.5">
      <dt className="text-[11px] leading-none text-[var(--app-subtle)]">{label}</dt>
      <dd className="mt-1 text-base font-semibold leading-none text-[var(--app-ink)]">{value}</dd>
    </div>
  );
}
