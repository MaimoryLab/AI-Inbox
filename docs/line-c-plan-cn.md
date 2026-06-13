# 线 C 方案:Agent→用户异步收件箱(待回应 / 已完成)

> 状态:**草案 v1,待人工审阅**。产出形态为方案文档,本轮**不改代码**。
> 日期:2026-06-13 · 基线:`@agentmemory/agentmemory` v0.9.24 · 前置:线 A(三栏)已交付。
> 方法论沿用线 A 验证有效的工作流(见 `dev/workflow-review-cn.md`):一步一 PR、预测后回填、preview 实证、文档零 CI。

---

## 0. 一句话

线 A 把工作台内的形态立好了(待办栏含「待回应」空壳 STEP-06)。线 C 补上它背后**真正缺的后端语义**——让 Agent 能把「我问了你、在等你回」这件事真实地推进收件箱,用户能在工作台看到、回应、消解。**本轮拍板:只做后端语义 + viewer 接真数据,飞书投递出口排后;已完成简报只展示已有 done,不做自动识别。**

## 1. 需求明确(先对齐再开工)

### 1.1 真实痛点(用户视角,个人重度 Agent 用户)
线 A 所有能力都在「工作台内被动查看」。但用户最在意的一类——**Agent 运行中抛出、时间敏感、Agent 在那头等着的问题**——目前**完全没有后端语义**。STEP-06 已诚实地把 viewer 分区做成空壳,等的就是本线。

### 1.2 三类收件箱条目(来自会议,线 A 已确认)
| 类型 | 性质 | 用户动作 | 本轮 |
|---|---|---|---|
| 🔴 待回应 | Agent 抛问题、在等你、时间敏感 | 回一句 / 转待处理 / 看原文 | ✅ **本轮做后端语义 + 接线** |
| 🟡 待处理 | 欠着的事(= 现有 action) | 已在线 A 跑通 | 不动 |
| 🟢 已完成 | 汇报性质、知悉即可 | 自动归档 | ⚠️ **仅展示已有 `action.status:done`,不自动识别** |

### 1.3 本轮边界(拍板结论)
- ✅ 新建 **inbox 原语**(独立 KV scope,非改 signals)承载「待回应」。
- ✅ viewer 把 STEP-06 空壳接上真实 inbox 数据。
- ✅ 「已完成」区只读现有 `action.status:done`,**不**加自动识别抽取器。
- ⛔ **飞书/lark/openclaw 投递出口**:本轮**不做**(涉外部网络+凭证,与本地优先有张力),单列后续线。
- ⛔ **桌面通知(Notification API)**:本轮**不做**,排后。

### 1.4 为什么新建 inbox 而非扩展 signals(关键决策)
`signals`(`src/functions/signals.ts`)是 **agent↔agent** 消息原语:读取强制要 `agentId`、无「未答/已答」状态、type 里没有「问题」语义。STEP-06 已论证「接 signals 语义不对、会误导」。扩展它要塞 question 类型 + answered 状态 + 去 agentId 的用户读路径,反而污染原有 agent 间语义、动 `test/signals.test.ts` 一堆守卫。**新建独立 `inbox` 原语更干净**:语义专一(Agent→用户问答)、不碰 signals、守卫独立。

<!-- PLACEHOLDER_REST -->

## 2. 数据模型(新 inbox 原语)

```ts
// src/types.ts 新增
interface InboxItem {
  id: string;                 // inbox_<ts>_<rand>
  question: string;           // Agent 抛给用户的问题正文(Markdown,复用 renderMarkdownSafe)
  status: "awaiting" | "answered" | "dismissed";  // 核心:未答/已答/已消解
  priority?: "high" | "normal" | "low";           // 时间敏感度,启发式或 Agent 指定
  fromAgent?: string;         // 哪个 Agent/会话抛的(展示「来自」用)
  project?: string;           // 关联项目
  sourceObservationIds?: string[];  // 复用线 A 跳证据机制(STEP-03 的 resolveObsSession)
  sourceSessionId?: string;
  answer?: string;            // 用户回应正文(answered 时)
  createdAt: string;
  answeredAt?: string;
  expiresAt?: string;         // 可选 TTL
}
```

设计要点:
- `status` 三态是核心——「待回应」区只显示 `awaiting`;回应后转 `answered` 归档;「转待处理」= `dismissed` 并新建一条 action(转给现有线 A 待处理流)。
- `sourceObservationIds` 刻意与 Action 同名,**直接复用 STEP-03 的 `resolveObsSession` + 「看原文 →」**,零新增跳转逻辑。
- 不含 `to` 字段:inbox 天然是「Agent→当前用户」,无需 agentId(这正是与 signals 的本质区别)。

## 3. 用户体验(线框,与线 A 视觉一致)

### 3.1 待办栏顶部「待回应」区(把 STEP-06 空壳接真)
```text
┌─────────────────────────────────────────────────────────┐
│ ● 待回应 (2)                          Agent 在等你回复     │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 🔴 /admin/* 路由要不要也加鉴权?         来自 auth 重构 │   │
│ │    "我改完了 /api/*,但 /admin/* 你之前没说…"  看原文→ │   │
│ │    [ 回应… ]  [ 转待处理 ]  [ 知道了/消解 ]            │   │
│ ├───────────────────────────────────────────────────┤   │
│ │ 🔴 这两个测试是删还是修?              来自 测试清理     │   │
│ │    [ 回应… ]  [ 转待处理 ]  [ 知道了/消解 ]            │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```
- 空态(无 awaiting):保留 STEP-06 的诚实空态文案,但去掉「尚未接通后端」那句(已接通)。
- 「回应…」展开行内输入框,提交 → `answer` 入库、状态转 `answered`、卡片淡出归档。
- 「转待处理」→ inbox 项 `dismissed` + 新建一条 action(标题取 question),落入线 A 待处理区。
- 「看原文 →」复用 STEP-03 跳证据。

### 3.2 「已完成」区(只读 done,折叠)
```text
🟢 已完成  今天完成了 N 件 ▾        (默认折叠,点开列 status:done 的 action)
```
- 数据源:现有 `GET /agentmemory/actions` 里 `status==="done"` 的项,按 `updatedAt` 当天过滤。
- **不**自动识别,**不**新增抽取器——纯前端筛现有数据。

### 3.3 分区顺序(顶→底)
待回应(awaiting,Agent 在等)→ 待确认(候选)→ 待处理(active/pending)→ 已完成(done,折叠)。

## 4. STEP 拆解(每步 = 一个 PR,薄切、可验证、可回滚)

> 合并顺序 C1 → C2 → C3 → C4;C5 可与 C4 并行。建议顺序:先后端语义(C1)绿,再逐步接前端。

### STEP-C1 — inbox 后端原语(MCP 工具 + REST + KV)
- **改动面**:
  - `src/types.ts`:加 `InboxItem` 接口。
  - `src/state/schema.ts`:加 KV scope `inbox = "mem:inbox"`(AGENTS.md KV 连带:schema + types,2 处)。
  - `src/functions/inbox.ts`(新):`mem::inbox-ask`(Agent 抛问题)/`mem::inbox-list`(列 awaiting,**无需 agentId**)/`mem::inbox-answer`(回应,转 answered)/`mem::inbox-dismiss`。
  - `src/triggers/api.ts`:对应 REST 端点 `/agentmemory/inbox*`(REST 连带:api + index 计数 + README,3 处;端点数 131→+N)。
  - `src/mcp/tools-registry.ts` + `src/mcp/server.ts`:`memory_inbox_ask` 等 MCP 工具(MCP 连带:8 处全套,见 §5)。
  - `src/index.ts`:function 注册 + 端点计数日志。
  - 审计:`src/types.ts` `AuditEntry.operation` 加 `inbox_ask`/`inbox_answer`(audit 连带,1 处)。
  - `test/inbox.test.ts`(新):ask/list/answer/dismiss + 状态机 + 「list 不要 agentId」守卫。
- **结果预测**:build 通过;`npm test` 维持绿 + 新增 inbox 用例;`consistency.test` 因新增 MCP 工具/REST 端点会要求同步计数——**必须按 §5 清单全改,否则计数断言红**。
- **风险**:一致性铁律是本步最大风险(改 8+3 处 + KV2 + audit1)。先跑 `npm run check:consistency-local` 秒级自检,再 build/test。

### STEP-C2 — viewer「待回应」区接真数据
- **改动面**:仅 `src/viewer/index.html`。`renderAwaitingReplySection()`(STEP-06 占位)改为 `loadInbox()` 拉 `/agentmemory/inbox?status=awaiting` → 渲染真卡片;空态去掉「尚未接通」。复用 `renderMarkdownSafe` 渲染 question。
- **结果预测**:build 通过;新增 viewer 渲染单测(参考 STEP-06 的 viewer-session-id 用例);preview 实证卡片渲染。
- **风险**:demo 数据需造 inbox 项(本地 API 直接 ask 几条)。

### STEP-C3 — 回应 / 转待处理 / 看原文 三动作
- **改动面**:`src/viewer/index.html`。「回应」行内输入 → `POST inbox-answer`;「转待处理」→ `inbox-dismiss` + `action-create`;「看原文」复用 STEP-03 `jumpToEvidence`(inbox 项的 `sourceObservationIds`)。
- **结果预测**:build + 单测(动作分发);preview 实证回应后卡片归档、转待处理后落入待处理区。
- **风险**:`inbox-dismiss` + `action-create` 两步要原子感(失败回滚提示),前端串行调用。

### STEP-C4 — 「已完成」区(只读 done)
- **改动面**:`src/viewer/index.html`。新增折叠区,筛 `state.actions.items` 里 `status==="done"` 且当天 `updatedAt`。
- **结果预测**:build + 单测;零后端改动;preview 实证折叠/展开。
- **风险**:极低。纯前端筛现有数据。

### STEP-C5 —(可选,可并行)Agent 抛问题的接入点
- **改动面**:文档/plugin skill——让 Agent 知道「要问用户时调 `memory_inbox_ask`」。可加一个 `plugin/skills/ask-user/SKILL.md`。
- **结果预测**:纯文档/skill,零 CI。
- **风险**:无。但这是「inbox 有没有人往里写」的关键——没有 Agent 调 ask,收件箱永远空。**审阅时重点确认这条的产品闭环**。

## 5. 一致性铁律连带清单(C1 必守,见 `dev/` 记忆)

新增 MCP 工具(每个工具 8 处)+ REST 端点(3 处)+ KV scope(2 处)+ audit op(1 处):

- [ ] `src/mcp/tools-registry.ts`(定义 + getAllTools)
- [ ] `src/mcp/server.ts`(handler case)
- [ ] `src/triggers/api.ts`(REST 孪生)
- [ ] `src/index.ts`(function 注册 + 端点计数日志,131→新值)
- [ ] `test/mcp-standalone.test.ts`(工具计数断言)
- [ ] `README.md`(MCP 工具数 + REST 端点数,consistency.test 锁定)
- [ ] `AGENTS.md`(REST 端点数 "N REST endpoints")
- [ ] `plugin/.claude-plugin/plugin.json` + `plugin/plugin.json`(工具计数)
- [ ] `src/state/schema.ts` + `src/types.ts`(KV scope)
- [ ] `src/types.ts` `AuditEntry.operation`(audit op)
- [ ] 推前跑 `npm run check:consistency-local`(秒级)→ `npm run pre-pr`

## 6. 验证(沿用线 A 配方)
- 每步 `npm run pre-pr`(自检 + build + test)。
- viewer 改动用 preview 实证(`scripts/viewer-preview-proxy.cjs` + launch.json viewer-proxy):造几条 inbox → 截图/inspect/console-error。
- C1 后端用 `curl localhost:3111/agentmemory/inbox*` 验 wire shape。

## 7. 依赖图
```text
C1(后端 inbox 原语) → C2(viewer 接真) → C3(三动作)
                                      → C4(已完成只读 done,可与 C3 并行)
C5(Agent 接入点/skill) 旁路,任意时点,但决定收件箱是否有数据
```

## 8. 待人工审阅 / 拍板的点
1. **§1.4 新建 inbox vs 扩展 signals**:认可新建独立原语?
2. **§3.1 三动作语义**:「转待处理」= dismiss inbox + 新建 action,这个流转对不对?
3. **§4 STEP-C5(产品闭环关键)**:Agent 怎么知道该往 inbox 写问题?要不要本轮就出 `ask-user` skill + 在 AGENTS.md/plugin 文档里引导?**否则收件箱可能一直空**——这是线 C 价值能否兑现的命门。
4. **优先级判定**:`priority` 谁定?Agent 调 ask 时指定,还是前端启发式?(线 A 会议提过优先级判定是难点,不接大模型)
5. **飞书投递**:确认本轮不做、单列后续线(线 D?)?
6. **范围**:本轮只出本规划文档待审(已确认),审阅通过后再按 C1→C5 开工。

