const AGENT_CONTEXT_PREFIX = "[Agent Context]";
const TURN_ABORTED_PATTERN = /^\s*<turn_aborted>[\s\S]*<\/turn_aborted>\s*$/u;

export function markAgentContext(text: string): string {
  return text.startsWith(AGENT_CONTEXT_PREFIX) ? text : `${AGENT_CONTEXT_PREFIX}\n${text}`;
}

export function isAgentContextText(text: string): boolean {
  return text.trimStart().startsWith(AGENT_CONTEXT_PREFIX);
}

export function isTurnAbortedText(text: string): boolean {
  return TURN_ABORTED_PATTERN.test(text);
}

export function displayAgentContextText(text: string): string {
  return text.replace(/^\s*\[Agent Context\]\s*/u, "").trimStart();
}

export function displayTurnAbortedText(text: string): string {
  return isTurnAbortedText(text) ? "Turn interrupted by the user." : text;
}
