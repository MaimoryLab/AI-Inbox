import { Bot, Code2, Globe2, TerminalSquare } from "lucide-react";
import { sourceLabel, textFor, type Locale } from "../i18n.js";
import { cn } from "../lib/utils.js";
import type { SessionRecord, SourceKind, SourceSummary, TodoCard } from "../types.js";
import type { SourceFilter } from "../view-model.js";

export const sourceLabels: Record<SourceKind, string> = {
  codex: "Codex",
  "claude-code": "Claude",
  browser: "Browser"
};

export function SourceIcon({ source }: { source?: SourceKind }) {
  const className = cn("h-4 w-4 shrink-0", source ? "text-neutral-500" : "text-neutral-400");
  if (source === "codex") return <TerminalSquare className={className} aria-hidden="true" />;
  if (source === "claude-code") return <Bot className={className} aria-hidden="true" />;
  if (source === "browser") return <Globe2 className={className} aria-hidden="true" />;
  return <Code2 className={className} aria-hidden="true" />;
}

export function originLabel(todo: TodoCard, locale: Locale): string {
  const text = textFor(locale);
  if (!todo.origin) return text.sourceUnavailable;
  const source = sourceLabel(todo.origin.source, locale);
  const project = todo.origin.projectTitle || source;
  const session = todo.origin.sessionTitle || text.temporarySession;
  return `${source} · ${project} › ${session}`;
}

export function originProjectLabel(todo: TodoCard, locale: Locale): string {
  const text = textFor(locale);
  if (!todo.origin) return text.sourceUnavailable;
  const source = sourceLabel(todo.origin.source, locale);
  const project = todo.origin.projectTitle || source;
  return `${source} · ${project}`;
}

export function originSessionLabel(todo: TodoCard, locale: Locale): string {
  return todo.origin?.sessionTitle || textFor(locale).temporarySession;
}

export function sourceCount(sources: SourceSummary[], filter: SourceFilter): number {
  if (filter === "all") return sources.reduce((sum, source) => sum + source.sessions, 0);
  return sources.find((source) => source.source === filter)?.sessions ?? 0;
}

export function sessionProjectLabel(session: SessionRecord, locale: Locale): string {
  if (session.source === "browser") {
    return session.path === "browser" ? textFor(locale).browserSessions : (readablePathSegment(session.path) ?? textFor(locale).browserSessions);
  }
  const projectPath = readableProjectPath(session.projectPath);
  if (projectPath) return projectPath;
  const parts = session.path.split("/").filter(Boolean);
  if (session.source === "claude-code") return readablePathSegment(parts.at(-2) ?? parts.at(-1)) ?? sourceLabel(session.source, locale);
  return readablePathSegment(parts.at(-3) ?? parts.at(-2) ?? parts.at(-1)) ?? sourceLabel(session.source, locale);
}

function readableProjectPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parts = value.split("/").filter(Boolean);
  return readablePathSegment(parts.at(-1));
}

function readablePathSegment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const segment = value.replace(/\.jsonl$/u, "").replace(/^-+|-+$/gu, "");
  const marker = "AI-TodoProject";
  const markerIndex = segment.indexOf(marker);
  if (markerIndex >= 0) {
    const suffix = segment.slice(markerIndex + marker.length).replace(/^-+/u, "");
    return suffix || marker;
  }
  if (!segment || /^\d+$/u.test(segment) || /^(Users|tmp|var|private|Volumes)(?:[-_]|$)/u.test(segment)) {
    return undefined;
  }
  return segment.replace(/[-_]+/gu, " ") || undefined;
}
