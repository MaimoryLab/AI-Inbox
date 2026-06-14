# 收件箱评测语料 — 评分说明

配套脚本:[`scripts/seed-inbox-eval.mjs`](../scripts/seed-inbox-eval.mjs)

用途:在真实工作台里灌入一组**代表性收件箱样例**,人工逐条判断 inbox 的**噪音率**与 **briefing 质量**,据此校准 `ask-user` / `organize-todos` 两个 skill 的触发判据措辞。

## 跑法

```bash
# 前置:本地 worker 在跑(REST :3111),viewer 可访问
node scripts/seed-inbox-eval.mjs --clear   # 清旧评测样例 + 重灌(--clear 只清评测前缀,不动真实 inbox)
node scripts/seed-inbox-eval.mjs           # 不清、直接追加
```

然后打开工作台 **待办页**(`#actions`),「待回应」区会出现 **9 条 question + 5 条 briefing**。

## 样例编码

每条的 `fromAgent` 前缀编码了**期望判定**(评分基准),审的时候可先遮住前缀凭直觉判断,再对答案:

| 前缀 | 含义 | 期望 |
|---|---|---|
| `[真信号]` | question 该发 | 确实受阻 + 属用户决策(不可逆 / 真歧义 / 需用户独有资源) |
| `[边界]` | question 模糊 | 有推荐默认但影响不小,见仁见智 |
| `[噪音]` | question 本不该发 | 有约定默认 / "我继续吗" busywork / 琐碎 —— **测假阳性** |
| `[好简报]` | briefing 合格 | 非 trivial + 自然停顿点 + 五秒可读 + 有料 |
| `[差简报]` | briefing 不合格 | 流水账 / 无料 / mid-flight —— **测质量下限** |

> `[噪音]` 与 `[差简报]` 是**故意灌入的对照**:真实 skill 判据若收得够紧,这些本不该被 Agent 发出来。它们在这里是为了让你直观看到「混进来会不会淹没真信号」。

## 评分口径

**噪音率** = (你认为不该出现却出现的 question 数)/(question 总数)。
- 本语料 question 总数 9,其中 `[噪音]` 3 条是对照下限。
- 理想:`[真信号]`(4)和 `[边界]`(2)都在,`[噪音]`(3)在真实使用里一条都不该被 Agent 真发。

**briefing 质量**:逐条判断「该不该进 inbox」。
- `[好简报]`(2)应保留;`[差简报]`(3)都不该进(流水账 / 无料 / mid-flight)。

## 审法建议

1. **先遮前缀扫一遍**:模拟真实场景,凭第一眼判断「这条该不该打扰我」。
2. **再对前缀**:直觉与基准分歧处,就是 skill 判据措辞要调的地方。
3. **试动作**:点真信号的「回应…」、噪音的「转待处理 / 知道了」,验证体验闭环。
4. **看 briefing 对比**:好 / 差简报并列时,差的是否一眼就显得碍眼。

## 首轮评测结论(2026-06-14)

- **噪音明显淹没真信号**:样本噪音率 3/9 ≈ 33%,但按 `createdAt` 倒序后**首屏前 3 条全是噪音**,真信号被压到后面 —— 真实使用里会让用户先产生「不值得看」的判断。→ skill 判据需更严(见 [`plugin/skills/ask-user/SKILL.md`](../plugin/skills/ask-user/SKILL.md) 禁止触发例子)。
- **最碍眼的差简报**:`[差简报] verbose-log`(典型流水账,会把 inbox 变 transcript)> `mid-flight`(没到停顿点)> `trivial`(最轻,但也只配会话末尾一句、不配进 inbox)。
- **已收口的产品问题**:inbox 搜索失效([PR#28](https://github.com/MaimoryLab/agentmemory-lab/pull/28))、inbox 区过长 → briefing 默认折叠([PR#29](https://github.com/MaimoryLab/agentmemory-lab/pull/29))。
- **待办**:Markdown 对 `/admin/*` 路径里 `*` 的 emphasis 误解析(P2);skill 禁止触发文案把上述噪音样例写进反例。
