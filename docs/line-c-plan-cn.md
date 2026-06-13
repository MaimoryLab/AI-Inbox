# 线 C 方案:Agent→用户异步收件箱(待回应 / 已完成)

> 状态:**草案 v1,待人工审阅**。产出形态为方案文档,本轮**不改代码**。
> 日期:2026-06-13 · 基线:`@agentmemory/agentmemory` v0.9.24 · 前置:线 A(三栏)已交付。
> 方法论沿用线 A 验证有效的工作流(见 `dev/workflow-review-cn.md`):一步一 PR、预测后回填、preview 实证、文档零 CI。

---

## 0. 一句话

线 A 把工作台内的形态立好了(待办栏含「待回应」空壳 STEP-06)。线 C 补上它背后**真正缺的后端语义**——让 Agent 能把「我问了你、在等你回」这件事真实地推进收件箱,用户能在工作台看到、回应、消解。**本轮拍板:只做后端语义 + viewer 接真数据,飞书投递出口排后;已完成简报只展示已有 done,不做自动识别。**

## 0.5 审阅决议(2026-06-13 第一轮审阅落实)

| # | 议题 | 决议 |
|---|---|---|
| 1 | 新建 inbox vs 扩展 signals | ✅ **认可新建**独立 inbox 原语 |
| 2 | 三动作流转(回应/转待处理/看原文) | ✅ **流转正确**,按 §3.1 实现 |
| 3 | Agent 接入点(原 C5,旁路) | ⭐ **升级为核心**:让 **Agent 主动发送+整理待办**,整理后的结果**直接通知用户**(本轮「通知」= 写入工作台收件箱作为送达面,用户打开即见;主动推送见下条)。原 C5「可选旁路」改为 **C1.5 必做**,见 §4。 |
| 4 | 优先级判定 | ⏸️ **本轮不处理**:`priority` 字段保留为可选,Agent 可填可不填;前端不做启发式排序,按 `createdAt` 倒序即可。优先级算法单列后续。 |
| 5 | 飞书投递 | ⛔ **本轮不做**:Agent→用户的「通知」本轮止于工作台收件箱(本地、打开即见)。跨设备主动推送(飞书/lark/openclaw、桌面 Notification)单列后续线 D。 |

> **第 3 与第 5 的边界澄清**(避免误解):第 3 点「直接通知用户」在本轮**指 Agent 把整理好的待办/问题写进工作台收件箱,用户在工作台看到**——这是「送达到一个用户必看的统一入口」,不是手机推送。真正的跨设备主动推送依赖通道(飞书),按第 5 点排后。本轮先把「Agent 主动写、用户工作台收」这条**本地闭环**打通。

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
- ✅ **Agent 主动发送+整理待办**(核心):Agent 在会话中把问题/整理后的待办写进收件箱;整理结果直接送达工作台收件箱(用户必看入口)。配套 `ask-user`/整理引导 skill + AGENTS.md 引导。
- ✅ viewer 把 STEP-06 空壳接上真实 inbox 数据。
- ✅ 「已完成」区只读现有 `action.status:done`,**不**加自动识别抽取器。
- ⏸️ **优先级判定**:本轮不处理;`priority` 保留可选字段,前端按 `createdAt` 倒序,不做启发式。算法单列后续。
- ⛔ **飞书/lark/openclaw 投递出口 + 桌面通知**:本轮**不做**,单列后续线 D(跨设备主动推送)。本轮「通知」止于工作台收件箱本地闭环。

### 1.4 为什么新建 inbox 而非扩展 signals(关键决策)
`signals`(`src/functions/signals.ts`)是 **agent↔agent** 消息原语:读取强制要 `agentId`、无「未答/已答」状态、type 里没有「问题」语义。STEP-06 已论证「接 signals 语义不对、会误导」。扩展它要塞 question 类型 + answered 状态 + 去 agentId 的用户读路径,反而污染原有 agent 间语义、动 `test/signals.test.ts` 一堆守卫。**新建独立 `inbox` 原语更干净**:语义专一(Agent→用户问答)、不碰 signals、守卫独立。

<!-- PLACEHOLDER_REST -->

## 2. 数据模型(新 inbox 原语)

```ts
// src/types.ts 新增
interface InboxItem {
  id: string;                 // inbox_<ts>_<rand>
  kind: "question" | "briefing";  // 问题(需回应) / 整理通知(知悉即可)
  body: string;               // 正文(Markdown,复用 renderMarkdownSafe)。question=问题,briefing=整理后的待办通知
  status: "awaiting" | "answered" | "dismissed";  // 核心:未答/已答(或已读)/已消解
  priority?: "high" | "normal" | "low";  // 本轮不处理算法,字段保留;Agent 可填可不填
  fromAgent?: string;         // 哪个 Agent/会话抛的(展示「来自」用)
  project?: string;           // 关联项目
  sourceObservationIds?: string[];  // 复用线 A 跳证据机制(STEP-03 的 resolveObsSession)
  sourceSessionId?: string;
  answer?: string;            // 用户回应正文(question 被 answered 时)
  createdAt: string;
  answeredAt?: string;
  expiresAt?: string;         // 可选 TTL
}
```

设计要点:
- `kind` 区分两用途:`question`(Agent 抛问题、需用户回应)与 `briefing`(Agent **主动整理**后的待办通知,知悉即可、可一键已读)。两者都进同一收件箱,前端分区呈现。
- `status` 三态是核心——「待回应」区只显示 `awaiting`;question 回应后转 `answered`、briefing 点「知道了」转 `answered`(已读)归档;「转待处理」= `dismissed` 并新建一条 action(转给现有线 A 待处理流)。
- `priority` 本轮**不参与排序**(算法排后),前端按 `createdAt` 倒序;字段保留供 Agent 选填、后续线接算法。
- `sourceObservationIds` 刻意与 Action 同名,**直接复用 STEP-03 的 `resolveObsSession` + 「看原文 →」**,零新增跳转逻辑。
- 不含 `to` 字段:inbox 天然是「Agent→当前用户」,无需 agentId(这正是与 signals 的本质区别)。

## 3. 用户体验(线框,与线 A 视觉一致)

### 3.1 待办栏顶部「待回应」区(把 STEP-06 空壳接真)
```text
┌─────────────────────────────────────────────────────────┐
│ ● 待回应 (2)                          Agent 在等你回复     │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 🔴 /admin/* 路由要不要也加鉴权?         来自 auth 重构 │   │  ← kind=question
│ │    "我改完了 /api/*,但 /admin/* 你之前没说…"  看原文→ │   │
│ │    [ 回应… ]  [ 转待处理 ]  [ 知道了/消解 ]            │   │
│ ├───────────────────────────────────────────────────┤   │
│ │ 🔴 这两个测试是删还是修?              来自 测试清理     │   │  ← kind=question
│ │    [ 回应… ]  [ 转待处理 ]  [ 知道了/消解 ]            │   │
│ └───────────────────────────────────────────────────┘   │
│ ● Agent 整理 (1)                      知悉即可,可一键已读  │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 📋 今天我跟进了 3 件:补了分页/修了登录测试/…   看原文→ │   │  ← kind=briefing
│ │    [ 知道了 ]  [ 转待处理 ]                            │   │  (Agent 主动整理后推送)
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```
- 两类卡:`question`(🔴 Agent 在等你回)与 `briefing`(📋 Agent 主动整理后推的通知,知悉即可)。前端按 kind 分子区呈现,均按 `createdAt` 倒序(本轮不按 priority)。
- 空态(无 awaiting):保留 STEP-06 的诚实空态文案,但去掉「尚未接通后端」那句(已接通)。
- 「回应…」(question)展开行内输入框,提交 → `answer` 入库、状态转 `answered`、卡片淡出归档。
- 「知道了」(briefing,或 question 无需回时)→ `inbox-answer` 空 answer,标已读归档。
- 「转待处理」→ inbox 项 `dismissed` + 新建一条 action(标题取 `body`),落入线 A 待处理区。
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

> 合并顺序 C1 → C1.5 → C2 → C3 → C4;C4 可与 C3 并行。建议顺序:先后端语义(C1)绿、接入点(C1.5)到位,再逐步接前端。

### STEP-C1 — inbox 后端原语(MCP 工具 + REST + KV)
- **改动面**:
  - `src/types.ts`:加 `InboxItem` 接口(含 `kind: question|briefing`)。
  - `src/state/schema.ts`:加 KV scope `inbox = "mem:inbox"`(AGENTS.md KV 连带:schema + types,2 处)。
  - `src/functions/inbox.ts`(新):`mem::inbox-ask`(Agent 抛问题,kind=question)/`mem::inbox-notify`(Agent 推整理后的待办通知,kind=briefing)/`mem::inbox-list`(列 awaiting,**无需 agentId**,可按 kind 过滤)/`mem::inbox-answer`(回应/已读,转 answered)/`mem::inbox-dismiss`。
  - `src/triggers/api.ts`:对应 REST 端点 `/agentmemory/inbox*`(REST 连带:api + index 计数 + README,3 处;端点数 131→+N)。
  - `src/mcp/tools-registry.ts` + `src/mcp/server.ts`:`memory_inbox_ask`/`memory_inbox_notify` 等 MCP 工具(MCP 连带:8 处全套/每工具,见 §5)。
  - `src/index.ts`:function 注册 + 端点计数日志。
  - 审计:`src/types.ts` `AuditEntry.operation` 加 `inbox_ask`/`inbox_notify`/`inbox_answer`(audit 连带,1 处)。
  - `test/inbox.test.ts`(新):ask/notify/list/answer/dismiss + 状态机 + 「list 不要 agentId」守卫 + kind 过滤。
- **结果预测**:build 通过;`npm test` 维持绿 + 新增 inbox 用例;`consistency.test` 因新增 MCP 工具/REST 端点会要求同步计数——**必须按 §5 清单全改,否则计数断言红**。
- **风险**:一致性铁律是本步最大风险(改 8+3 处 + KV2 + audit1)。先跑 `npm run check:consistency-local` 秒级自检,再 build/test。

### STEP-C1.5 — Agent 主动发送+整理的接入点(⭐ 核心,原 C5 升级)
- **为什么必做**:这是「收件箱有没有数据」的产品闭环命门。没有 Agent 主动往里写,inbox 永远空、线 C 价值无从兑现。审阅已拍板把它从旁路提为核心。
- **改动面**:
  - `plugin/skills/ask-user/SKILL.md`(新):引导 Agent「需要用户拍板/回应时,调 `memory_inbox_ask`」。
  - `plugin/skills/organize-todos/SKILL.md`(新):引导 Agent「会话告一段落时,**主动整理**本次产生的待办/进展,调 `memory_inbox_notify` 推一条整理通知给用户」。
  - `AGENTS.md` / `plugin/plugin.json`:把这两个 skill 纳入 skill 计数与说明(注意 skill 数 12→14,但 skill 计数不被 consistency.test 锁,仍建议同步 AGENTS.md Current Stats)。
  - (可选)hook 探索:会话结束 hook 自动触发整理通知——本步先不做自动,先靠 skill 引导 Agent 主动调,避免误触发。
- **结果预测**:纯文档/skill,零 CI 成本(`plugin/**` 非 paths-ignore 的需确认;若触发 CI 则 build+test 应不受影响)。
- **风险**:产品风险而非技术风险——skill 措辞要让 Agent 在「真该问/真该汇报」时才写,避免 inbox 被噪音淹没。审阅时重点看 skill 的触发判据措辞。

### STEP-C2 — viewer「待回应/通知」区接真数据
- **改动面**:仅 `src/viewer/index.html`。`renderAwaitingReplySection()`(STEP-06 占位)改为 `loadInbox()` 拉 `/agentmemory/inbox?status=awaiting` → 按 `kind` 分呈现(question 卡 + briefing 卡);空态去掉「尚未接通」。复用 `renderMarkdownSafe` 渲染 `body`;按 `createdAt` 倒序(不按 priority)。
- **结果预测**:build 通过;新增 viewer 渲染单测(参考 STEP-06 的 viewer-session-id 用例);preview 实证两种卡片渲染。
- **风险**:demo 数据需造 inbox 项(本地 API 直接 ask/notify 几条)。

### STEP-C3 — 动作:回应 / 知道了 / 转待处理 / 看原文
- **改动面**:`src/viewer/index.html`。question 卡:「回应」行内输入 → `inbox-answer`;briefing 卡:「知道了」→ `inbox-answer`(空 answer,标已读)。两者通用:「转待处理」→ `inbox-dismiss` + `action-create`;「看原文」复用 STEP-03 `jumpToEvidence`。
- **结果预测**:build + 单测(动作分发);preview 实证回应/已读后卡片归档、转待处理后落入待处理区。
- **风险**:`inbox-dismiss` + `action-create` 两步要原子感(失败回滚提示),前端串行调用。

### STEP-C4 — 「已完成」区(只读 done,可与 C3 并行)
- **改动面**:`src/viewer/index.html`。新增折叠区,筛 `state.actions.items` 里 `status==="done"` 且当天 `updatedAt`。
- **结果预测**:build + 单测;零后端改动;preview 实证折叠/展开。
- **风险**:极低。纯前端筛现有数据。

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
C1(后端 inbox 原语) → C1.5(Agent 接入点 skill,⭐核心) → C2(viewer 接真) → C3(动作)
                                                       → C4(已完成只读 done,可与 C3 并行)
```
C1.5 紧跟 C1:原语一就绪就让 Agent 能往里写,避免「前端接好了却没数据」。

## 8. 待人工审阅 / 拍板的点

### 已在第一轮审阅落实(见 §0.5)
- ✅ 1 认可新建 inbox · ✅ 2 三动作流转正确 · ⭐ 3 Agent 主动发送+整理升级为核心(C1.5)· ⏸️ 4 优先级本轮不处理 · ⛔ 5 飞书本轮不做。

### 仍需你确认
1. **§0.5 第 3/5 边界澄清**:本轮「Agent 直接通知用户」= 写入**工作台收件箱**(本地、打开即见),**不含**手机/桌面主动推送(那依赖飞书,排后线 D)。这个理解对吗?——若你期望本轮就有「真·推送到手机」,那第 5 点要重新讨论(会显著扩大范围)。
2. **§4 C1.5 skill 触发判据**:`ask-user`(何时该问)与 `organize-todos`(何时该主动整理汇报)的措辞,要让 Agent 在「真该问/真该报」时才写,避免收件箱被噪音淹没。这是产品体验成败关键,建议你过一眼 skill 文案(开工时一并出)。
3. **briefing 自动触发**:`organize-todos` 本轮靠 skill 引导 Agent **主动**调,不做会话结束 hook 自动触发(避免误触)。认可先手动引导、自动化排后?
4. **范围**:本轮只出本规划文档待审(已确认),审阅通过后按 C1→C1.5→C2→C3→C4 开工。


