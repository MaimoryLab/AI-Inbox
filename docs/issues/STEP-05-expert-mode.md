# STEP-05：专家模式开关（收纳被砍视图）

- 线:A（前端三栏）
- 状态:✅ 单测+浏览器实证绿,待开 PR
- 依赖:STEP-01
- 对应 PR:`Claude/expert-mode`

> ⚠️ 来自 STEP-01 的输入:STEP-01 删除了 `tab-extra`/`tab-extra-toggle`/`tab-group-label` 的 DOM，但保留了 `switchTab`(~4883) 与事件委托(~8507) 中对它们的**死引用**（有守卫、不崩溃）和 `advancedTabs` 局部变量。本步实现专家模式折叠分组时，应**复用或清理**这套逻辑，而不是再造一套。被隐藏视图的 11 个 `.tab-bar button[data-tab=X] .tab-icon` CSS 图标定义（~205 行起）也由 STEP-01 保留，本步放回 tab 时直接复用。

## 目标（一句话）

加一个专家模式开关（设置项或 `?expert=1`），开启后在导航末尾恢复被砍/被隐藏的视图（记忆、Skill、graph、profile、audit、replay、crystals），保住后端资产不丢。

## 改动面

- 文件:`src/viewer/index.html`（专家开关状态 + 条件性把这些 tab 加回 `TAB_IDS` / 放开 `TAB_REDIRECTS`；持久化到 localStorage 或 query）。
- 不动:这些视图的渲染函数（本就在文件里，本步只是放行入口）。
- AGENTS 连带项:无。

## 结果预测（执行前填）

- 构建:通过。
- 测试:维持 0 失败；新增 1 个「专家模式切换 tab 集合」测试。
- 行为:默认三栏干净；开专家模式后进阶分组出现，原 6 隐藏视图可达。
- 风险:被隐藏视图的渲染函数久未走通，放行后可能首次暴露既有运行时错误（数据格式漂移）。需逐个点验，必要时标注「实验性」。

## 验证命令

```bash
npm run build
npm test -- --run test/viewer-graph-cooldown.test.ts
# 手动:开关专家模式，逐个点开 graph/profile/audit/replay/crystals 看是否报错
```

## 回滚

revert 单 PR；专家入口消失，主三栏不受影响。

## 实际反馈（执行后由你回填）

- 构建:✅ `npm run build` 通过。
- 测试:✅ `npm test` **127 文件 / 1352 用例全绿,0 回归**。新增 `test/viewer-expert-mode.test.ts` 5 用例(默认关→折回主三栏且无进阶组、`?expert=1` 放行隐藏 tab、localStorage 开渲染 9 个进阶按钮、`?expert=0` 覆盖 localStorage、renderExpertTabs 幂等不重复)。
- 浏览器实证:`preview_eval` + `preview_inspect` 实跑——开启后 `#tab-expert-group` 渲染 9 个标签(记忆/经验/图谱/时间线/实时/档案/审计/回放/结晶),逐个 `switchTab` 到 9 个隐藏视图**均不抛错**、console 无 error;关闭后进阶组被移除(getElementById 返回 null)。
- 实际改动（仅 `src/viewer/index.html`）:
  1. 新增 `EXPERT_TABS`(9 项 id+label)、`expertModeEnabled()`(读 `?expert=1/0` 优先,否则 localStorage `viewer_expert_mode`)、`setExpertMode()`。
  2. `normalizeTab`:专家模式开 + tab 属 EXPERT_TABS → 放行;否则维持 TAB_REDIRECTS 折回。**TAB_IDS/TAB_REDIRECTS 常量未改**(默认行为零变化)。
  3. `renderExpertTabs()`:幂等渲染进阶按钮组到 `.tab-main`;`toggleExpertMode()`:翻转+重渲染,关闭时若停在隐藏视图则折回 dashboard。
  4. 导航 `.tab-side-meta` 加「专家」开关按钮(`#expert-toggle`,`aria-pressed`);tab-bar 点击委托新增 `#expert-toggle` 分支。
  5. boot 处调 `renderExpertTabs()`。
- **清理(STEP-01 遗留死代码)**:删除 `switchTab` 里对已不存在的 `tab-extra`/`tab-extra-toggle` DOM 的死引用块、未用的 `advancedTabs` 局部变量;tab-bar 点击委托里移除旧 `#tab-extra-toggle` 分支(整段替换为 `#expert-toggle`)。
- 与预测的差异:
  - 预测「放行隐藏视图可能首次暴露既有运行时错误」——**实测 9 个视图 switchTab 均不抛错、无 console error**,数据格式未漂移。比预期顺利。
  - 一处源码健壮性修复:`renderExpertTabs` 移除旧组时加 `existing.parentNode` 判空(原 `existing.parentNode.removeChild` 在 parentNode 缺失时会炸),顺带让 STEP-03/04 等共用沙箱测试的 boot 期 `renderExpertTabs()` 不受影响。
- 下一步影响(下游待更新清单):
  - 无对 STEP-06 的代码影响。
  - 被收纳视图里若展示 Agent 文本,可复用 STEP-04 的 `renderMarkdownSafe`(目前未接,各视图维持原渲染)。
