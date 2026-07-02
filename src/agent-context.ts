const AGENT_CONTEXT_PREFIX = "[Agent Context]";

export function markAgentContext(text: string): string {
  return text.startsWith(AGENT_CONTEXT_PREFIX) ? text : `${AGENT_CONTEXT_PREFIX}\n${text}`;
}

export function isAgentContextText(text: string): boolean {
  return text.trimStart().startsWith(AGENT_CONTEXT_PREFIX);
}

export function displayAgentContextText(text: string): string {
  return text.replace(/^\s*\[Agent Context\]\s*/u, "").trimStart();
}
