# 线 D 方案:收件箱跨设备投递(飞书推送)

> 状态:**草案 v1,待人工审阅**。前置:线 C(收件箱全栈 C1→C4)已交付合并(main `a308c8d`+)。lark-cli 与 27 个 lark-* skill 已装。
> 日期:2026-06-15 · 基线:`@agentmemory/agentmemory` v0.9.24 · 沟通信道:`lark-cli`(`/opt/homebrew/bin/lark-cli`)。
> 方法论沿用线 A/C 验证有效的工作流:一步一 PR、预测后回填、preview/实跑实证、文档零 CI。

## 进度看板(2026-06-15)

| STEP | 内容 | 状态 |
|---|---|---|
| **D1** | 投递原语后端:`mem::inbox-deliver` 函数 + 投递配置 + audit + 去重 | ⬜ 待开工 |
| **D2** | lark-cli 适配器:把 InboxItem 渲染成飞书消息(卡片/markdown)并发出 | ⬜ 待开工(依赖 D1) |
| **D3** | 挂接 inbox 写路径:ask/notify 后 fire-and-forget 触发投递 | ⬜ 待开工(依赖 D1/D2) |
| **D4** | 投递状态回写 + viewer 呈现(已推送/推送失败标记) | ⬜ 待开工(依赖 D3) |
| **D5**(可选) | 回执闭环:用户在飞书回复 → 写回 inbox-answer(依赖 lark-event 订阅) | ⬜ 远期,可不做 |

> **里程碑**:线 C 已让「Agent 写 → 落库 → 用户**打开工作台**才看到」。线 D 补上**跨设备主动触达**——Agent 抛出 question/briefing 后,飞书 bot 主动私聊推给用户,用户不必盯着工作台。这是线 C §0.5 第 5 点明确排后、留给线 D 的那一块。

---

## 0. 一句话

线 C 的收件箱是"拉"模型(用户主动开工作台看);线 D 加"推"模型(条目产生即推飞书)。**只做出口投递,不改收件箱语义本身**——inbox 仍是真相源,飞书是它的一个投递通道(送达面之一,与工作台并列)。

## 0.5 边界(开工前先锁,避免重蹈线 C 范围蔓延)

| # | 议题 | 草案立场(待你拍板) |
|---|---|---|
| 1 | 推什么 | **question + briefing 都推**,但分级:question(Agent 在等你回)走**加急/卡片**;briefing(知悉即可)走**普通 DM**,不加急。 |
| 2 | 推给谁 | 本轮**只推给单个用户**(收件箱本就是单用户语义)。目标 user 由配置 `AGENTMEMORY_LARK_USER_ID` 指定。不做群推、不做多人分发。 |
| 3 | 用什么身份 | **bot 身份(`--as bot`)**:只需 appId+appSecret、免 `auth login`、适合后台 daemon 无人值守。bot 私聊推给用户。(user 身份需交互式授权,不适合 daemon,排除) |
| 4 | 触发时机 | 条目**落库后** fire-and-forget 触发(不阻塞 inbox 写)。投递失败**不影响** inbox 落库——飞书只是额外通道,工作台始终能看到。 |
| 5 | 回执闭环 | 本轮**不做**(D5 远期)。用户在飞书看到推送后,仍回工作台操作(回应/知道了/转待处理)。"飞书内直接回复 → 写回 inbox" 依赖 lark-event 长订阅,复杂度高,单列 D5。 |
| 6 | 去重/幂等 | 每个 InboxItem **至多推一次**。用 `lark-cli` 的 idempotency key + 本地投递台账(KV `mem:delivery`)双保险,避免重启/重试重复打扰。 |
| 7 | 失败处理 | best-effort + 有限重试。投递失败记 audit + 在 viewer 标「推送失败」,但**绝不**因投递失败阻塞或回滚 inbox。 |
| 8 | 默认开关 | **默认关闭**(`AGENTMEMORY_LARK_DELIVERY=false`)。未配置 user-id/未开关时,inbox 行为与线 C 完全一致,零副作用。显式开启才推。 |

## 1. 项目 ↔ lark-cli 的沟通方式(核心)

调研结论:仓库现无任何投递层(grep `delivery/notify/webhook/lark/feishu/slack` 仅命中注释与 inbox 自身命名),线 D 是绿地新建。沟通有两条候选路径,**本方案选 A(lark-cli 子进程)为主**:

### 路径 A — `lark-cli` 子进程(选用)

项目后端通过 `child_process.execFile` 调 `lark-cli`,把 InboxItem 发成飞书消息。

- **先例**:`src/functions/branch-aware.ts:8-14` 已有 promisified `execFile` 封装(`{ cwd, timeout: 5000 }`)。线 D 复用同款模式。
- **为什么选它**:你已装好 lark-cli + 27 skill + 完成 `config init`,bot 身份免授权即用;lark-cli 封装了 token 刷新、加急、卡片、幂等键、风险门禁,项目侧不必自己管飞书 OpenAPI 与鉴权。
- **调用形态**(参数数组,绝不 `sh -c` 拼接,遵循 lark-shared 安全规则):
  ```
  execFile("lark-cli", [
    "im", "+messages-send",
    "--as", "bot",
    "--user-id", "<AGENTMEMORY_LARK_USER_ID>",
    "--msg-type", "interactive",      // question 用卡片;briefing 用 "text"/markdown
    "--idempotency-key", "<item.id>", // 幂等:同一 InboxItem 重发不重复
    "--json"
  ], { input: <message-json via stdin>, timeout: 8000 })
  ```
  > 数据(消息体 JSON)走 **stdin**,不走命令行参数——避免长 JSON 转义与 `unsafe file path`(lark-shared §安全规则)。
- **输出解析**:lark-cli `--json` 返回 `{ message_id, ... }`;失败时 exit≠0 + stderr JSON。需识别 **exit 10 = `confirmation_required`**(高风险写门禁),但 `im +messages-send` 非高风险,正常不触发——若触发则记失败、不静默加 `--yes`(lark-shared §exit 10 铁律)。

### 路径 B — Webhook `fetch`(备选,不在本轮)

直接 `fetch` 飞书自定义机器人 webhook。先例 `src/functions/mesh.ts:262` 的外呼 + SSRF 守卫(`mesh.ts:35`)。
- 优点:无 lark-cli 依赖、纯 HTTP。缺点:能力受限(无加急、卡片交互弱、需自管 webhook 签名)、且 webhook 机器人通常绑群而非私聊单用户。
- **结论**:本轮不用。若将来要去 lark-cli 依赖(类似线 B 的去 Docker 取向),B 作为退路保留。

### 身份与认证(bot 身份)

- `--as bot` → `tenant_access_token`,只需后台配好 appId+appSecret,**无需 `auth login`**(lark-shared §身份选择原则)。适合 daemon 无人值守。
- 前置:用户需在飞书开发者后台给 bot 开通 `im:message`(发消息)、`im:message.urgent`(应用内加急)等 scope,并把 bot 加入可见范围 / 与目标用户建立可私聊关系。**这一步是人工配置,计划文档需把 scope 清单和配置链接列清**(见 §6 前置清单)。
- 权限不足时 lark-cli 返回 `permission_violations` + `console_url`——项目侧投递失败时把这些透传进 audit/viewer,引导用户去后台补 scope。

## 2. 输出方式(InboxItem → 飞书消息)

按 kind 分级渲染,对齐线 C 的 question/briefing 二分:

### question(🔴 Agent 在等你回)→ 交互卡片 + 加急

- **消息类型**:`interactive`(飞书卡片),含标题「🔴 Agent 在等你回」、正文(item.body 的 Markdown)、来源(fromAgent)、以及一个**「去工作台回应 →」按钮**(链接到 viewer `#actions`,本轮不做卡片内直接回复=D5)。
- **加急**:发送后对该 message 调 `lark-cli im messages urgent_app`(应用内加急,需 `im:message.urgent` scope),确保时间敏感问题不被淹没。是否加急可由 `item.priority` 或配置 `AGENTMEMORY_LARK_URGENT_QUESTION` 控制。
- **降级**:若卡片能力不可用(scope 缺失),降级为 markdown 文本 DM,正文末尾附工作台链接。

### briefing(📋 知悉即可)→ 普通 markdown DM

- **消息类型**:`text`(markdown),不加急。标题「📋 Agent 整理」+ item.body + 「看详情 →」工作台链接。
- 与线 C 工作台里 briefing 默认折叠的低优先级定位一致——飞书侧也安静推送,不打扰。

### 消息体构造原则

- **正文 = item.body 原样**(已是 Markdown,Agent 写时遵循 ask-user/organize-todos skill 的格式)。飞书 markdown 子集与 viewer 的 renderMarkdownSafe 略有差异,但 body 本身是 Agent 产出的规范 Markdown,直接透传即可;路径类用反引号包裹(skill 已约定)。
- **附工作台深链**:每条消息都带回 viewer 的链接(`#actions`),让"飞书看到 → 一键回工作台操作"路径顺滑,弥补本轮不做飞书内回执。
- **不在消息里塞敏感数据**:body 由 Agent 控制;sourceObservationIds 等内部 id 不进飞书消息(隐私 + 无意义)。


## 3. 数据模型(投递台账,新增)

投递状态**不污染** InboxItem 主体——单独建投递台账,inbox 仍是真相源。

```ts
// src/state/schema.ts 新增 KV scope:delivery: "mem:delivery"(与 inbox 同级)
// src/types.ts 新增接口
interface DeliveryRecord {
  id: string;              // = InboxItem.id(一对一,天然去重键)
  channel: "lark";         // 本轮只有 lark;预留多通道
  status: "sent" | "failed" | "skipped";
  messageId?: string;      // lark message_id(om_xxx),回执/撤回用
  urgent?: boolean;        // question 是否加急成功
  error?: string;          // 失败原因(透传 lark-cli stderr 摘要 / permission_violations)
  attempts: number;        // 重试计数
  createdAt: string;
  deliveredAt?: string;
}
```

- 去重:投递前查 `kv.get(KV.delivery, item.id)`,已 `sent` 则跳过(`status:skipped` 不重记)。配合 lark-cli `--idempotency-key=item.id` 双保险。
- viewer 读这张表给卡片标「已推送 ✓ / 推送失败 ⚠」(D4)。

## 4. STEP 拆解(每步 = 一个 PR,薄切、可验证、可回滚)

> 合并顺序 D1 → D2 → D3 → D4 →(可选 D5)。D1/D2 可并行起草,但 D3 挂接前两者都要在。

### STEP-D1 — 投递原语后端(函数 + 配置 + 台账 + audit)
- **改动面**:
  - `src/config.ts`:`getLarkConfig()`(读 `AGENTMEMORY_LARK_USER_ID` / `AGENTMEMORY_LARK_URGENT_QUESTION`)+ `isLarkDeliveryEnabled()`(读 `AGENTMEMORY_LARK_DELIVERY === "true"`,默认 false)。仿 `config.ts:187` 的 `is*Enabled()` 范式。
  - `src/state/schema.ts` + `src/types.ts`:KV scope `mem:delivery` + `DeliveryRecord` 接口(KV 连带 2 处)。
  - `src/types.ts` `AuditEntry.operation`:加 `inbox_delivered` / `delivery_failed`(audit 连带 1 处)。
  - `src/functions/inbox-deliver.ts`(新):`mem::inbox-deliver`(入参 `{item}`)——查去重 → 调适配器(D2)→ 写 `DeliveryRecord` → `safeAudit`。注册于 `src/index.ts`(仿 `registerInboxFunction`,index.ts:314)。
  - `test/inbox-deliver.test.ts`(新):去重(已 sent 跳过)、配置门(未开/缺 user-id 直接 skipped)、台账写入、失败记录。**适配器(lark-cli 调用)在测试里 mock 掉**,不真发飞书。
- **结果预测**:build + test 绿;**不新增 MCP 工具/REST 端点**(投递是内部 fire-and-forget,无对外接口),故**不触发**一致性铁律的 8 处/3 处连带,只动 KV(2)+audit(1)。
- **风险**:低。纯后端、有开关、默认关。

### STEP-D2 — lark-cli 适配器(InboxItem → 飞书消息)
- **改动面**:
  - `src/functions/lark-adapter.ts`(新):`deliverViaLark(item, config)`——按 kind 构造消息 JSON、`execFile("lark-cli", [...], {input, timeout})`(仿 `branch-aware.ts:8`)、解析 `--json` 输出、question 成功后调加急、返回 `{messageId, urgent, error}`。
  - 渲染:question→`interactive` 卡片(标题+body+来源+「去工作台」按钮);briefing→`text` markdown。
  - 安全:参数数组形式、数据走 stdin、识别 exit 10 不静默 `--yes`、不打印密钥(lark-shared 全套铁律)。
- **结果预测**:单测覆盖消息体构造(给定 item → 期望 argv + stdin JSON 形状),**execFile 用 mock/注入**;真发飞书走手动实跑验证(见 §5)。
- **风险**:中。飞书消息体格式、卡片 schema、加急 scope 需实跑校准。这步最可能反复。

### STEP-D3 — 挂接 inbox 写路径(fire-and-forget)
- **改动面**:`src/functions/inbox.ts`。`mem::inbox-ask`(`:27` kv.set 后)与 `mem::inbox-notify`(`:50` 后)各加:
  ```ts
  if (isLarkDeliveryEnabled()) {
    try { sdk.triggerVoid("mem::inbox-deliver", { item }); }
    catch (e) { logger.warn("lark delivery dispatch failed", e); }
  }
  ```
  仿 `events.ts:51/66` 的 `triggerVoid` + try/catch-only-log 范式。**投递失败绝不冒泡到 inbox 写**。
- **结果预测**:`test/inbox.test.ts` 现有 9 例不受影响(默认关);加 1-2 例验「开启时触发 deliver、关闭时不触发」(mock triggerVoid)。
- **风险**:低。一处薄挂接,有开关保护。

### STEP-D4 — 投递状态回写 viewer
- **改动面**:`src/triggers/api.ts`(inbox-list 响应里 join DeliveryRecord,或新增 `GET /agentmemory/delivery`)+ `src/viewer/index.html`(卡片角标「已推送 ✓ / 推送失败 ⚠ + 原因」)。
- **结果预测**:REST 若新增端点则触发端点计数连带(3 处);viewer 加单测 + preview 实证。
- **风险**:低-中。看是否新增端点(影响一致性铁律)。

### STEP-D5(可选,远期)— 飞书内回执闭环
- 用 `lark-event consume`(lark-event skill)长订阅 bot 收到的消息,把用户在飞书的回复写回 `mem::inbox-answer`。**复杂度高**(长驻订阅进程、消息→inbox 项映射、鉴权),且与"回工作台操作"路径重叠。**默认不做**,除非你明确要"飞书内闭环"。

## 5. 验证(沿用线 A/C 配方)

- 每步 `npm run pre-pr`(自检 + build + test)。
- D1/D2 单测把 `execFile` mock 掉,**不在 CI 里真发飞书**(CI 无 lark 凭证、会泄密/不稳定)。
- **真发飞书走手动实跑**(本地、一次性):
  ```bash
  # 开关 + 配置就绪后,本地造一条 question 触发投递,人工确认手机收到推送
  AGENTMEMORY_LARK_DELIVERY=true AGENTMEMORY_LARK_USER_ID=<ou_xxx> \
    curl -X POST localhost:3111/agentmemory/inbox/ask -d '{"body":"线D投递实测","fromAgent":"line-d-test"}'
  # 预期:手机飞书收到 bot 私聊卡片 + 加急;viewer 卡片标「已推送 ✓」
  ```
- 投递台账可直接查:`curl localhost:3111/agentmemory/delivery`(若 D4 加了端点)或 viewer 角标。

## 6. 前置清单(人工配置,开工 D2 前必须就绪)

这些是**用户侧一次性配置**,计划落地前需你确认/操作:

1. **lark-cli config init 已完成**(你已装好 + 27 skill,确认 `lark-cli config init` 跑过、bot appId/appSecret 配好)。
2. **bot scope**(飞书开发者后台开通,见 lark-im §权限表):
   - `im:message`(发消息,必需)
   - `im:message.urgent`(应用内加急,question 加急用;不开则降级为不加急)
   - 失败时 lark-cli 回 `console_url`,照它去后台补。
3. **bot 可私聊目标用户**:bot 加入可见范围,且与目标用户能建立 P2P 会话。
4. **目标用户 open_id**(`ou_xxx`):用 `lark-cli contact +search-user --query "<你的名字>"`(lark-contact skill)查到,填进 `AGENTMEMORY_LARK_USER_ID`。
5. **配置写入** `~/.agentmemory/.env`(config.ts 的 file-env 层自动加载):
   ```
   AGENTMEMORY_LARK_DELIVERY=true
   AGENTMEMORY_LARK_USER_ID=ou_xxxxxxxx
   AGENTMEMORY_LARK_URGENT_QUESTION=true
   ```

> 在这些就绪前,D1(纯后端 + 默认关)可以先做、先合,不依赖飞书配置。

## 7. 一致性铁律连带(参照 AGENTS.md)

- **D1**:不新增 MCP 工具/REST 端点 → **不触发** 8 处/3 处连带。只动 KV scope(schema+types,2 处)+ AuditEntry.operation(types,1 处)。
- **D4**:若新增 `GET /agentmemory/delivery` 端点 → 触发 REST 连带 3 处(api.ts + index.ts 计数 + README)。若只在 inbox-list 里 join 则不新增端点、零连带。**倾向后者**(不新增端点)。
- 版本号:线 D 合并时若 bump version,按 7 处连带走(package.json / version.ts / types.ts / export-import.ts / 对应 test / plugin.json ×2)。
- 每步推前 `npm run check:consistency-local`。

## 8. 待人工审阅 / 拍板的点

1. **§0.5 边界整体**:8 条边界(推什么/推给谁/身份/时机/回执/去重/失败/开关)是否认可?尤其:
   - 第 1 条:question + briefing **都推**,还是**只推 question**(briefing 知悉即可、也许不必跨设备打扰)?
   - 第 5 条:回执闭环(D5)本轮**不做**、用户回工作台操作——认可吗?还是你要"飞书内直接回复就闭环"?
2. **沟通方式选 A(lark-cli 子进程)**:认可用 lark-cli 而非自建 webhook?(A 富能力但引入 lark-cli 运行时依赖;B 纯 HTTP 但能力弱)
3. **投递范围**:本轮只推**单用户私聊**。未来要不要群推 / 多设备?(影响数据模型是否要 `to[]`)
4. **加急策略**:question 默认 `urgent_app`(应用内加急)。要不要更激进(`urgent_phone` 电话加急)或更克制(完全不加急、只普通 DM)?
5. **前置清单(§6)**:你来确认 bot scope / open_id / 配置是否就绪,D2 实跑前需要。

---

## 附:本目录文件

- `README.md`(本文件)— 线 D 总方案。
- 后续可加:`lark-cli-contract.md`(lark-cli 调用参数/输出契约冻结)、`delivery-wire.md`(DeliveryRecord + REST 形状),按需在开工对应 STEP 时补,避免一次写太多空中楼阁。
