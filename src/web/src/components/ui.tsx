import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../lib/utils.js";

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-blue-700 bg-blue-700 text-white hover:bg-blue-800",
        variant === "secondary" && "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
        variant === "ghost" && "border-transparent bg-transparent text-neutral-700 hover:bg-neutral-200/70",
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
  return <div className={cn("rounded-lg border border-neutral-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]", className)} {...props} />;
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700", className)}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-10 min-w-0 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-700", props.className)} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-20 min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700", props.className)} {...props} />;
}

export function SectionTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-xs font-semibold uppercase tracking-normal text-neutral-500", className)} {...props} />;
}
