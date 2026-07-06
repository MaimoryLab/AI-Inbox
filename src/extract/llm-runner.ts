import type { AppConfig, AppSecrets } from "../config.js";
import type { ExistingCardForLlm, LlmExtractResult, LlmExtractorContext, LlmTaskChain, LlmTaskChainNode, LlmTodoCandidate, ObservationForOrganize } from "../todos/service.js";

const TODO_EXTRACTION_PROMPT = `
You extract actionable AI-Inbox cards from cleaned user/assistant transcripts.

Input JSON has three sections:
- intentBlocks: user-visible requests. Titles, descriptions, dedupeKey, quote, and currentNode.sourceObservationId must primarily use intentBlocks.
- progressBlocks: recent Agent progress. metadata.completionSummary, metadata.nextStep, and metadata.sourceObservationId should primarily use progressBlocks.
- taskChains: grouped single-session task flows linking one user intent to recent Agent progress.
- existingCards: currently open cards from the same session, if any. Reuse the same user goal instead of creating a similar new card.

Return only JSON:
{"taskChains":[{"chainId":"...","title":"...","summary":"...","status":"in_progress","completedNodes":[{"title":"...","summary":"...","owner":"agent","status":"completed","observationId":"..."}],"currentNode":{"title":"...","description":"...","nodeTitle":"...","owner":"agent","nextStep":"...","metadata":{"completionState":"...","completionSummary":"...","nextStep":"...","sourceObservationId":"..."},"confidence":0.9,"sourceObservationId":"...","quote":"...","dedupeKey":"..."}}]}

Rules:
- Use taskChains as the primary unit. Each chain is single-session only and represents one user task flow.
- Output one current unresolved node per unfinished chain, not every user intent.
- Put resolved prior work in completedNodes. Do not create a currentNode for fully completed chains.
- currentNode.title is the Inbox card title: summarize the nearby user's core ask, requirement, or task focus from intentBlocks so the user remembers the real problem.
- Titles must be a user-recognizable goal from intentBlocks and taskChains[].userIntent, not Agent progress narration or the Agent's next step.
- currentNode.nodeTitle is optional but should name the actual current unresolved node/action when it differs from the user's core ask.
- metadata.completionSummary is a concise summary of what the agent already completed, attempted, blocked on, or left pending from progressBlocks. Agent progress must not become the card subject.
- metadata.nextStep is only for an obvious remaining user-relevant next action from progressBlocks.
- Prefer currentNode.sourceObservationId and quote from the user observation that states the core ask. Use metadata.sourceObservationId for the Agent progress observation.
- Create todos only for unresolved, actionable work: next actions, follow-ups, failed validation, blockers, or work still in progress.
- A card must be user-visible, still open, and currently valid. Do not create a todo when the remaining step is just Agent execution.
- If currentNode.owner is "agent" and the nextStep is something the Agent can complete on its own, such as running tests, building, verifying, restarting, submitting, committing, scanning, refreshing, organizing, checking status, or reading logs, omit the currentNode unless it explicitly needs user confirmation, user input, user approval, or user review.
- Reject completed results, status reports, confirmations, health checks, shell/tool logs, command payloads, and process chores.
- Titles must read like mature todo app cards: short verb + object + outcome. Do not use transcript fragments.
- Put long branch names, paths, URLs, commit hashes, package names, and session ids in description, not title.
- Description is one concise sentence with the user scenario and unresolved gap or blocker. Do not start with "I will", "我会", "现在", or "接下来".
- quote must be an exact source text span from sourceObservationId.
- dedupeKey must be a short stable slug of the user's core ask and object. Do not use current status, current node names, raw JSON, paths, logs, call ids, or trace fragments.
- If a task matches an existingCards item, output the updated version of that same user goal. Do not invent a new title/dedupeKey just because Agent progress changed.

Good examples:
- "后续需要修复 CI 失败，并重新跑测试。" -> title "修复 CI 失败并重新跑测试"
- "clone the AI-Inbox repo into the subdirectory" -> title "Clone the AI-Inbox repository into the subdirectory"
- "read README and dependency config before migration" -> title "Read README and dependency configuration"
- "fix the dark mode button contrast" -> title "Fix dark mode button contrast"
- "push branch codex/current-feature to remote" -> title "推送当前工作分支到远程仓库"; keep the branch in description
- "修正目录显示文字（去掉重复编号）并更新页码缓存后重渲染" -> same intent as a single card

Negative examples:
- "重启服务并验证构建", "提交当前更改", "做最后一次状态确认", "health check passed", "Viewer URL works", "Bash(git status) process exited 0" -> no todos
`.trim();

export function createLlmRunner(
  config: AppConfig["llm"],
  secrets: AppSecrets
): (observations: ObservationForOrganize[], context?: LlmExtractorContext) => Promise<LlmExtractResult> {
  return async (observations, context) => {
    if (!config.enabled) {
      return { ok: false, warning: "llm_config_missing", reason: "llm_disabled", retryable: false };
    }
    if (!secrets.llmApiKey) {
      return { ok: false, warning: "llm_config_missing", reason: "api_key_missing", retryable: false };
    }
    const visibleObservations = observations.filter((observation) =>
      observation.role === "user" || observation.role === "assistant"
    );
    const taskChains = buildTaskChains(visibleObservations);
    const byId = new Map(visibleObservations.map((observation) => [observation.id, observation]));
    const intentBlocks = taskChains
      .map((chain) => blockFor(byId.get(String(chain.userObservationId))))
      .filter((block): block is NonNullable<typeof block> => !!block);
    const progressBlocks = taskChains
      .map((chain) => blockFor(byId.get(String(chain.latestStatusObservationId))))
      .filter((block): block is NonNullable<typeof block> => !!block);
    if (intentBlocks.length === 0 && progressBlocks.length === 0) return { ok: true, todos: [] };

    try {
      return await requestTodos(config, secrets.llmApiKey, JSON.stringify({
        intentBlocks,
        progressBlocks,
        taskChains,
        existingCards: existingCardsForPrompt(context?.existingCards ?? [])
      }));
    } catch (error) {
      const reason = (error as Error).message;
      if (reason === "timeout") return { ok: false, warning: "llm_timeout", reason, retryable: true };
      if (reason === "invalid_json" || reason === "invalid_schema") {
        return { ok: false, warning: "llm_output_invalid", reason, retryable: true };
      }
      return {
        ok: false,
        warning: "llm_provider_failed",
        reason: providerFailureReason(reason),
        retryable: true
      };
    }
  };
}

function blockFor(observation: ObservationForOrganize | undefined) {
  if (!observation) return null;
  return {
    sourceObservationId: observation.id,
    sessionId: observation.sessionId,
    timestamp: observation.createdAt,
    source: observation.source,
    role: observation.role,
    text: observation.text
  };
}

function existingCardsForPrompt(cards: ExistingCardForLlm[]): Array<Record<string, unknown>> {
  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    description: card.description,
    completionState: card.metadata.completionState,
    completionSummary: card.metadata.completionSummary,
    nextStep: card.metadata.nextStep
  }));
}

function buildTaskChains(observations: ObservationForOrganize[]): Array<Record<string, unknown>> {
  const bySession = new Map<string, ObservationForOrganize[]>();
  for (const observation of observations) {
    const group = bySession.get(observation.sessionId) ?? [];
    group.push(observation);
    bySession.set(observation.sessionId, group);
  }
  const chains: Array<Record<string, unknown>> = [];
  for (const [sessionId, group] of bySession) {
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let activeChain: {
      user: ObservationForOrganize;
      replies: ObservationForOrganize[];
      continuationIds: string[];
    } | null = null;
    const flush = () => {
      if (!activeChain) return;
      const latestReply = latestStatusObservation(activeChain.replies);
      const allText = [activeChain.user.text, ...activeChain.replies.map((reply) => reply.text)].join(" ");
      chains.push({
        chainId: `${sessionId}:${activeChain.user.id}`,
        sessionId,
        userObservationId: activeChain.user.id,
        userIntent: activeChain.user.text,
        assistantObservationIds: activeChain.replies.map((reply) => reply.id),
        latestAssistantObservationId: latestReply?.id,
        latestAssistantReply: latestReply?.text ?? "",
        latestStatusObservationId: latestReply?.id,
        latestStatus: latestReply?.text ?? "",
        latestAgentProgress: latestReply?.text ?? "",
        completionState: inferCompletionState(allText),
        completionSummary: latestReply?.text ?? "",
        nextStep: inferNextStep(latestReply?.text ?? activeChain.user.text),
        observationIds: [
          activeChain.user.id,
          ...activeChain.replies.map((reply) => reply.id),
          ...activeChain.continuationIds
        ],
        dedupeKey: simpleDedupeKey(activeChain.user.text),
        source: activeChain.user.source,
        timestamp: activeChain.user.createdAt
      });
      activeChain = null;
    };
    for (const current of group) {
      if (current.role === "user") {
        if (activeChain && isLowInformationUserTurn(current.text)) {
          activeChain.continuationIds.push(current.id);
          continue;
        }
        flush();
        activeChain = { user: current, replies: [], continuationIds: [] };
        continue;
      }
      if (current.role === "assistant" && activeChain) activeChain.replies.push(current);
    }
    flush();
  }
  return chains;
}

function latestStatusObservation(replies: ObservationForOrganize[]): ObservationForOrganize | undefined {
  for (let index = replies.length - 1; index >= 0; index--) {
    if (hasProgressSignal(replies[index].text)) return replies[index];
  }
  return replies.at(-1);
}

async function requestTodos(config: AppConfig["llm"], apiKey: string, userContent: string): Promise<LlmExtractResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(chatCompletionsUrl(config.endpoint), {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        reasoning_effort: config.thinkingDepth,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: TODO_EXTRACTION_PROMPT },
          { role: "user", content: userContent }
        ]
      }),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`http_${response.status}`);
    return parseChatCompletionResponse(text);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("timeout");
    if (isKnownRunnerError((error as Error).message)) throw error;
    throw new Error("network_error");
  } finally {
    clearTimeout(timer);
  }
}

function chatCompletionsUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/u, "")}/chat/completions`;
}

function parseChatCompletionResponse(text: string): LlmExtractResult {
  const body = parseJsonRecord(text);
  const direct = parseTodoEnvelope(body);
  if (direct) return direct;

  const content = (((body.choices as unknown[])?.[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.content;
  if (typeof content !== "string") throw new Error("invalid_schema");
  const envelope = parseJsonRecord(stripJsonFence(content));
  const todos = parseTodoEnvelope(envelope);
  if (!todos) throw new Error("invalid_schema");
  return todos;
}

function parseJsonRecord(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_schema");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as Error).message === "invalid_schema") throw error;
    throw new Error("invalid_json");
  }
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return match?.[1] ?? trimmed;
}

function parseTodoEnvelope(envelope: Record<string, unknown>): LlmExtractResult | null {
  if (!Array.isArray(envelope.todos) && !Array.isArray(envelope.taskChains)) return null;
  const todos: LlmTodoCandidate[] = [];
  for (const item of Array.isArray(envelope.todos) ? envelope.todos : []) {
    const todo = parseTodoCandidate(item);
    if (!todo) return null;
    todos.push(todo);
  }
  const taskChains: LlmTaskChain[] = [];
  for (const item of Array.isArray(envelope.taskChains) ? envelope.taskChains : []) {
    const chain = parseTaskChain(item);
    if (!chain) return null;
    taskChains.push(chain);
  }
  return { ok: true, todos, taskChains };
}

function parseTodoCandidate(value: unknown): LlmTodoCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.title !== "string" ||
    typeof record.description !== "string" ||
    typeof record.confidence !== "number" ||
    typeof record.sourceObservationId !== "string" ||
    typeof record.quote !== "string" ||
    typeof record.dedupeKey !== "string"
  ) return null;
  return {
    title: record.title,
    description: record.description,
    metadata: parseTodoMetadata(record.metadata),
    confidence: record.confidence,
    sourceObservationId: record.sourceObservationId,
    quote: record.quote,
    dedupeKey: record.dedupeKey
  };
}

function parseTaskChain(value: unknown): LlmTaskChain | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string") return null;
  const currentNode = record.currentNode === undefined ? undefined : parseCurrentNode(record.currentNode);
  if (record.currentNode !== undefined && !currentNode) return null;
  const completedNodes: LlmTaskChainNode[] = [];
  for (const node of Array.isArray(record.completedNodes) ? record.completedNodes : []) {
    const parsed = parseTaskChainNode(node);
    if (!parsed) return null;
    completedNodes.push(parsed);
  }
  return {
    chainId: stringValue(record.chainId),
    userObservationId: stringValue(record.userObservationId),
    title: record.title,
    summary: stringValue(record.summary),
    status: stringValue(record.status),
    completedNodes,
    currentNode
  };
}

function parseCurrentNode(value: unknown): LlmTaskChain["currentNode"] | undefined {
  const todo = parseTodoCandidate(value);
  if (!todo || !value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    ...todo,
    nodeTitle: stringValue(record.nodeTitle),
    owner: ownerValue(record.owner),
    nextStep: stringValue(record.nextStep)
  };
}

function parseTaskChainNode(value: unknown): LlmTaskChainNode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string") return null;
  return {
    title: record.title,
    summary: stringValue(record.summary),
    owner: ownerValue(record.owner),
    status: nodeStatusValue(record.status),
    nextStep: stringValue(record.nextStep),
    observationId: stringValue(record.observationId),
    createdAt: stringValue(record.createdAt)
  };
}

function ownerValue(value: unknown): "agent" | "user" {
  return value === "user" ? "user" : "agent";
}

function nodeStatusValue(value: unknown): "completed" | "superseded" | "blocked" | "current" {
  if (value === "superseded" || value === "blocked" || value === "current") return value;
  return "completed";
}

function parseTodoMetadata(value: unknown): LlmTodoCandidate["metadata"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    completionState: stringValue(record.completionState),
    completionSummary: stringValue(record.completionSummary),
    nextStep: stringValue(record.nextStep),
    sourceObservationId: stringValue(record.sourceObservationId)
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function providerFailureReason(reason: string): string {
  if (/^http_\d{3}$/u.test(reason)) return reason;
  if (reason === "network_error") return reason;
  return "unknown_provider_error";
}

function isKnownRunnerError(reason: string): boolean {
  return reason === "timeout" ||
    reason === "invalid_json" ||
    reason === "invalid_schema" ||
    reason === "network_error" ||
    /^http_\d{3}$/u.test(reason);
}

function isLowInformationUserTurn(text: string): boolean {
  return /^(?:继续|重试|再来一次|继续推进|继续吧|retry|continue|go on|again)$/iu.test(text.trim());
}

function hasProgressSignal(text: string): boolean {
  return /(?:已完成|已通过|done|completed|fixed|resolved|blocked|阻塞|失败|failed|error|timeout|无法|不能|剩余|remaining|下一步|next|todo|需要|will|待)/iu.test(text);
}

function inferCompletionState(text: string): "completed" | "blocked" | "in_progress" | "unknown" {
  if (/(?:已完成|已通过|done|completed|fixed|resolved)/iu.test(text)) return "completed";
  if (/(?:blocked|阻塞|失败|failed|error|timeout|无法|不能)/iu.test(text)) return "blocked";
  if (/(?:剩余|remaining|下一步|next|todo|需要|will|待)/iu.test(text)) return "in_progress";
  return "unknown";
}

function inferNextStep(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const match = normalized.match(/(?:remaining|下一步|后续|还需要|需要|仍需|still remaining)[:：]?\s*([^。.!?]+[。.!?]?)/iu);
  return (match?.[1] ?? normalized).trim();
}

function simpleDedupeKey(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[`"'“”‘’]/gu, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/giu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized.slice(0, 80) || "todo-chain";
}
