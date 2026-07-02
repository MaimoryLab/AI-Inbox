import { ChevronDown, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { api, localizedUserFacingError } from "../api/client.js";
import { sourceLabel, textFor, type Locale } from "../i18n.js";
import { cn } from "../lib/utils.js";
import type { PublicAppConfig, StartupScanStatus } from "../types.js";
import type { SessionSource, SourceScanResult } from "../view-model.js";
import { Button, Card, Field, Input, SectionTitle, StatusCallout } from "./ui.js";

export function SettingsWorkspace({ settings, startup, locale, onLocale, onSaved, onClearTodos }: {
  settings: PublicAppConfig;
  startup: StartupScanStatus | null;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  onSaved: (message?: string) => Promise<void>;
  onClearTodos: () => Promise<void>;
}) {
  const text = textFor(locale);
  const [form, setForm] = useState(settings);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearingTodos, setClearingTodos] = useState(false);
  const [saveError, setSaveError] = useState("");
  const clearDialogRef = useRef<HTMLDialogElement>(null);

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

  async function clearTodos() {
    setClearingTodos(true);
    setSaveError("");
    try {
      await onClearTodos();
      clearDialogRef.current?.close();
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setClearingTodos(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <form autoComplete="off" onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}>
          <div className="flex items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] p-4">
            <SlidersHorizontal className="h-4 w-4 text-[var(--app-subtle)]" aria-hidden="true" />
            <SectionTitle>{text.settings}</SectionTitle>
          </div>
          <div className="divide-y divide-[var(--app-border)]">
            <section className="grid gap-3 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-base font-semibold text-[var(--app-ink)]">{text.language}</h2>
                <p className="mt-1 text-sm text-[var(--app-muted)]">{text.languageDescription}</p>
              </div>
              <div className="inline-flex w-fit rounded-lg bg-[var(--app-surface-muted)] p-1">
                {(["zh-CN", "en-US"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition active:translate-y-px",
                      locale === option ? "bg-white text-[var(--app-ink)] shadow-sm" : "text-[var(--app-muted)] hover:text-[var(--app-ink)]"
                    )}
                    aria-pressed={locale === option}
                    onClick={() => onLocale(option)}
                  >
                    {option === "zh-CN" ? text.chinese : text.english}
                  </button>
                ))}
              </div>
            </section>
            <section className="grid gap-3 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-base font-semibold text-[var(--app-ink)]">{text.sourceSettings}</h2>
                <p className="mt-1 text-sm text-[var(--app-muted)]">{text.sourceSettingsDescription}</p>
              </div>
              <div className="min-w-0 space-y-3">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={text.codexSource}>
                    <Input autoComplete="off" value={form.sources.codex.path ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, sources: { ...form.sources, codex: { path: event.target.value } } })} />
                  </Field>
                  <Field label={text.claudeSource}>
                    <Input autoComplete="off" value={form.sources["claude-code"].path ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, sources: { ...form.sources, "claude-code": { path: event.target.value } } })} />
                  </Field>
                </div>
                {startup?.discovery.length ? (
                  <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3">
                    <SectionTitle>{text.discovery}</SectionTitle>
                    <div className="mt-2 grid gap-2 text-sm text-[var(--app-muted)]">
                      {startup.discovery.map((item) => (
                        <div key={item.source} className="grid gap-1 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                          <span className="font-medium text-[var(--app-ink)]">{sourceLabel(item.source, locale)}</span>
                          <span className="min-w-0 break-words">
                            {discoveryStatusLabel(item.status, locale)}
                            {item.path ? ` · ${item.path}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="grid gap-3 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <h2 className="text-base font-semibold text-[var(--app-ink)]">{text.extraction}</h2>
                <p className="mt-1 text-sm text-[var(--app-muted)]">{text.extractionDescription}</p>
              </div>
              <div className="min-w-0">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label={text.lookbackDays}>
                    <Input type="number" min={1} value={form.organize.sinceDays} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, organize: { ...form.organize, sinceDays: Number(event.target.value) } })} />
                  </Field>
                  <Field label={text.maxSessions}>
                    <Input type="number" min={1} max={200} value={form.organize.maxSessions} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, organize: { ...form.organize, maxSessions: Number(event.target.value) } })} />
                  </Field>
                  <Field label={text.apiKey}>
                    <Input type="password" autoComplete="off" placeholder={settings.llm.apiKeyConfigured ? `${text.configured} ${settings.llm.apiKeyMasked}` : text.pasteApiKey} value={apiKey} onChange={(event: ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value)} />
                  </Field>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm text-[var(--app-muted)]">
                  <input type="checkbox" checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} />
                  {text.clearSavedApiKey}
                </label>
              </div>
            </section>
          </div>
          <div className="border-t border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {text.saveSettings}
            </Button>
            {saveError && <StatusCallout tone="danger" className="mt-3">{saveError}</StatusCallout>}
          </div>
        </form>
      </Card>
      <details className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-[var(--app-ink)]">
          {text.advancedDiagnostics}
          <ChevronDown className="h-4 w-4 text-[var(--app-subtle)]" aria-hidden="true" />
        </summary>
        <div className="mt-3 grid gap-4 text-sm text-[var(--app-muted)] md:grid-cols-2">
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
      <Card className="border-red-200 bg-red-50/40 p-4">
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <h2 className="text-base font-semibold text-red-800">{text.dangerZone}</h2>
            <p className="mt-1 text-sm text-red-700">{text.clearTodoCardsDescription}</p>
          </div>
          <div className="flex items-start">
            <Button type="button" variant="danger" onClick={() => clearDialogRef.current?.showModal()}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {text.clearTodoCards}
            </Button>
          </div>
        </div>
      </Card>
      <dialog ref={clearDialogRef} className="w-[min(420px,calc(100vw-32px))] rounded-lg border border-red-200 bg-[var(--app-surface)] p-0 text-[var(--app-ink)] shadow-xl backdrop:bg-black/20">
        <div className="border-b border-[var(--app-border)] p-4">
          <h2 className="text-base font-semibold">{text.clearTodoCardsConfirmTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{text.clearTodoCardsConfirmDescription}</p>
        </div>
        <div className="flex justify-end gap-2 p-4">
          <Button type="button" variant="secondary" onClick={() => clearDialogRef.current?.close()} disabled={clearingTodos}>
            {text.cancel}
          </Button>
          <Button type="button" variant="danger" onClick={() => void clearTodos()} disabled={clearingTodos}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {clearingTodos ? text.clearingTodoCards : text.confirmClearTodoCards}
          </Button>
        </div>
      </dialog>
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
