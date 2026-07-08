import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { displayAgentContextText, displayTurnAbortedText, isAgentContextText } from "../../../agent-context.js";
import { attachmentMarkdownText } from "../../../attachments.js";
import type { ObservationRecord } from "../types.js";

export function ObservationText({ observation, markdown }: { observation: ObservationRecord; markdown?: boolean }) {
  const text = sourceDisplayText(observation.text);
  const renderMarkdown = markdown ?? (observation.role === "assistant" || observation.role === "user" || isAgentContextText(observation.text));
  return <MarkdownText text={text} markdown={renderMarkdown} observationId={observation.id} />;
}

export function MarkdownText({ text, markdown, observationId }: { text: string; markdown?: boolean; observationId?: string }) {
  const displayText = sourceDisplayText(text);
  if (!markdown) return <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--app-ink)]">{displayText}</p>;
  const markdownText = observationId ? attachmentMarkdownText(displayText, observationId) : displayText;

  return (
    <div className="source-markdown break-words text-sm leading-6 text-[var(--app-ink)]">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          img: ({ alt, ...props }) => (
            <img
              {...props}
              alt={alt || "attachment"}
              className="max-h-80 max-w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] object-contain"
              loading="lazy"
            />
          )
        }}
      >
        {markdownText}
      </ReactMarkdown>
    </div>
  );
}

export function sourceDisplayText(text: string): string {
  return displayTurnAbortedText(displayAgentContextText(text));
}
