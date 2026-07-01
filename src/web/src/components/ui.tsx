import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../lib/utils.js";

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-medium leading-none transition disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px",
        size === "sm" ? "min-h-8 px-2.5 py-1.5" : "min-h-9 px-3 py-2",
        variant === "primary" && "border-[var(--app-accent)] bg-[var(--app-accent)] text-white hover:bg-[var(--app-accent-strong)]",
        variant === "secondary" && "border-[var(--app-border-strong)] bg-[var(--app-surface)] text-[var(--app-ink)] hover:bg-[var(--app-surface-muted)]",
        variant === "ghost" && "border-transparent bg-transparent text-[var(--app-muted)] hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-ink)]",
        variant === "danger" && "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
        className
      )}
      {...props}
    />
  );
}

export function IconButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const { label, className, ...rest } = props;
  return (
    <Button
      aria-label={label}
      title={label}
      variant="ghost"
      className={cn("h-9 w-9 px-0", className)}
      {...rest}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_1px_0_rgb(23_32_51_/_0.04)]", className)} {...props} />;
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]", className)} {...props} />;
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-2 py-0.5 text-xs font-medium leading-none text-[var(--app-muted)]", className)}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-10 min-w-0 rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-ink)] outline-none transition placeholder:text-[var(--app-subtle)] focus:border-[var(--app-accent)]", props.className)} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-20 min-w-0 rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-ink)] outline-none transition placeholder:text-[var(--app-subtle)] focus:border-[var(--app-accent)]", props.className)} {...props} />;
}

export function SectionTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-xs font-semibold uppercase tracking-normal text-[var(--app-subtle)]", className)} {...props} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-[var(--app-muted)]">
      {label}
      {children}
    </label>
  );
}

export function StatusCallout({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLParagraphElement> & {
  tone?: "neutral" | "danger";
}) {
  return (
    <p
      className={cn(
        "rounded-md border px-3 py-2 text-sm leading-6",
        tone === "neutral" && "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-muted)]",
        tone === "danger" && "border-red-200 bg-red-50 text-red-700",
        className
      )}
      {...props}
    />
  );
}

export function SegmentedFilter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex gap-1 overflow-x-auto rounded-lg bg-[var(--app-surface-muted)] p-1", className)} {...props} />;
}
