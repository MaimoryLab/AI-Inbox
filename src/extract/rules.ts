import { createHash } from "node:crypto";

export interface RuleCandidate {
  title: string;
  description: string;
}

const INTENT_PATTERN = /\b(todo|fix|add|implement|create|update|please|need|needs)\b|需要|修复|添加|实现/i;

export function extractRuleCandidate(text: string): RuleCandidate | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || !INTENT_PATTERN.test(normalized)) return null;

  const title = normalized
    .replace(/^please\s+/i, "")
    .replace(/^(todo|need|needs):?\s*/i, "")
    .slice(0, 100)
    .trim();

  return {
    title,
    description: normalized
  };
}

export function stableId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\0")).digest("hex");
}
