---
name: ask-user
description: Post a blocking question to the user's workbench inbox when you need a decision you cannot make yourself and the user is away. Use ONLY when work is genuinely blocked on a human decision (irreversible/destructive action, ambiguous requirement with diverging paths, missing credential or external resource) AND the user has not responded inline. Not for routine clarifications you can resolve by reading code or picking a sensible default.
user-invocable: false
---

You are blocked on a decision only the user can make, and the user is not responding inline. Deliver the question to their workbench inbox so they see it when they return, instead of stalling or guessing.

## When to use this (high bar — protect the inbox from noise)

Post to the inbox ONLY when ALL of these hold:
1. **You are actually blocked.** You cannot make meaningful progress on the task without this answer. If you can keep working on other parts, do that first and batch the question.
2. **It is the user's call, not yours.** The decision is irreversible or destructive (deleting data, force-push, dropping a feature, changing prod), OR a genuinely ambiguous requirement with materially diverging paths, OR needs something only the user has (a credential, an external resource, a business preference). Choices with a reasonable default are NOT this — pick the default and note it.
3. **Inline asking already failed or is impossible.** The user hasn't replied in this turn, or the session is autonomous/background and there is no one watching the terminal.

If any of these is false, do NOT post. Resolve it yourself: read the code, follow existing conventions, pick the obvious option and state your assumption.

## How to post

Call the `memory_inbox_ask` MCP tool:
- `body` — the question in Markdown. State it so the user can answer in one line. Include: what you're blocked on, the 2-3 concrete options with their tradeoffs, and your recommendation. Don't make the user reconstruct context.
- `fromAgent` — a short label for the work this came from (e.g. `auth-refactor`), so the inbox shows "来自 …".
- `project` — the repo/project path when known.
- `sourceObservationIds` — if the question stems from specific observations (a failing test, a file you read), pass their IDs so the user can click "看原文 →" to the evidence.

A good question is self-contained and decision-shaped:

> `/admin/*` 路由要不要也加鉴权?我改完了 `/api/*`(加了 JWT 中间件),但 `/admin/*` 你之前没提。
> - **加**(推荐):与 `/api/*` 一致,管理端更该锁。
> - **不加**:若 admin 只在内网/有别的网关挡着。
> 倾向「加」,等你一句话。

After posting, tell the user briefly that you've queued the question to their workbench inbox and what you'll do meanwhile (keep working elsewhere, or stop if fully blocked). Do not spin in place waiting.

## What NOT to ask

- Things you can answer by reading the codebase or running a command.
- Style/naming/formatting and other choices with a conventional default — pick it, mention it.
- "Should I proceed?" / "Is this okay?" busywork. Only post real blocking decisions.
- Multiple trivial questions as separate items — batch into one if they're related.

### 禁止触发的具体反例(评测校准,务必照此收紧)

这些**绝不该**发到收件箱 —— 它们会淹没真正要紧的问题,直接自己处理:

- ❌「新模块变量命名用 camelCase 还是 snake_case?」→ 有约定/跟随现有代码风格,自己定。
- ❌「我改完登录页样式了,继续做注册页吗?」→ 典型 "我继续吗" busywork,继续做就是。
- ❌「README 第 3 段有个 typo,要修吗?」→ 琐碎且可逆,直接修。

对照**该发**的样子(全部满足高门槛三条):不可逆操作(删生产数据)、真歧义且实现分叉大(导出格式 CSV vs JSON)、需要你独有的资源(缺 `STRIPE_SECRET_KEY`)、影响面巨大的架构选择(换状态库动 40 文件)。拿不准时:能自己定的默认就定 + 说明,只把**真卡住、真归你拍板**的发出来。

If `memory_inbox_ask` isn't available, the agentmemory MCP server didn't start: fall back to `POST $AGENTMEMORY_URL/agentmemory/inbox/ask` with body `{ "body": "...", "fromAgent": "...", "project": "..." }` and `Authorization: Bearer $AGENTMEMORY_SECRET` when set. If neither works, ask inline as a last resort.
