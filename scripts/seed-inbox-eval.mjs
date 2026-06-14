#!/usr/bin/env node
// 收件箱评测语料 —— 真实代表性样例,供网页端逐条判断「噪音率」与「briefing 质量」。
//
// 每条的 fromAgent 前缀编码了「期望判定」(评分基准):
//   [真信号]  question 该发:确实受阻 + 属用户决策(不可逆/真歧义/需用户独有资源)
//   [边界]    question 模糊:有推荐默认但影响不小,见仁见智
//   [噪音]    question 本不该发:有约定默认 / "我继续吗" busywork / 琐碎 —— 测假阳性
//   [好简报]  briefing 合格:非trivial + 自然停顿点 + 五秒可读 + 有料
//   [差简报]  briefing 不合格:流水账 / 无料 / mid-flight —— 测质量下限
//
// 用法:node scripts/seed-inbox-eval.mjs [--clear]
//   --clear  先把现有「评测前缀」的 awaiting 项 dismiss 清空,再灌样例
//            (只清 fromAgent 以 [真信号]/[边界]/[噪音]/[好简报]/[差简报] 开头的,
//             绝不动用户真实 inbox 条目)
//
// 评分:网页端打开待办页,逐条看「该不该出现在这里」。
//   噪音率 = (你认为不该发却出现的 question 数) / (question 总数)
//   理想:[真信号][边界] 都在、[噪音] 一条都不该被 Agent 真发(此处为对照故意灌入)

const BASE = process.env.AGENTMEMORY_URL || "http://localhost:3111";
const SECRET = process.env.AGENTMEMORY_SECRET || "";

const QUESTIONS = [
  {
    from: "[真信号] db-cleanup",
    body: "要不要删生产库里这 3 张孤儿表?\n已确认 6 个月无读写、无外键引用、无代码 grep 命中。\n- **删**:回收 ~40GB,但不可逆。\n- **留**:再观察一个月。\n倾向删,但这是不可逆操作,等你一句话。",
    obs: ["obs_db_orphan_scan"],
  },
  {
    from: "[真信号] export-fmt",
    body: "导出功能的格式你要哪种?两条路实现差异大、难中途换:\n- **CSV**:Excel 直接开,但丢嵌套结构。\n- **JSON**:保真,但非技术用户打不开。\n你之前没提,先等你定再动手。",
  },
  {
    from: "[真信号] stripe-key",
    body: "支付联调缺 `STRIPE_SECRET_KEY`,仓库里和密钥库里都没有。\n这只有你那边有——发我一个 test 模式的 key 我就能接着联调,否则这块卡住。",
  },
  {
    from: "[真信号] state-refactor",
    body: "购物车状态管理要从 Redux 换 Zustand 吗?\n现在的 bug 根因是 Redux 中间件时序,换掉能根治,但**影响 ~40 个文件**、改动面大。\n- **换**(推荐):根治 + 后续更简单。\n- **打补丁**:风险低但治标。\n影响面大,先问你。",
    obs: ["obs_redux_timing_bug"],
  },
  {
    from: "[边界] admin-auth",
    body: "`/admin/*` 路由要不要也加鉴权?我改完了 `/api/*`(加了 JWT 中间件),`/admin/*` 你之前没提。\n- **加**(推荐):与 `/api/*` 一致,管理端更该锁。\n- **不加**:若 admin 只在内网/有别的网关挡着。\n倾向加,等你一句话。",
  },
  {
    from: "[边界] test-timeout",
    body: "集成测试默认超时设多少?当前 5s 已让 2 个慢测偶发 flaky。\n- **提到 10s**:压住 flaky,但掩盖真慢。\n- **留 5s + 标记慢测单独跑**:更干净但要改 CI。\n有默认(5s),但 flaky 影响你看红绿,顺手问下。",
  },
  {
    from: "[噪音] naming-style",
    body: "新模块的变量命名用 camelCase 还是 snake_case?",
  },
  {
    from: "[噪音] proceed-check",
    body: "我改完登录页的样式了,继续做下一个任务(注册页)吗?",
  },
  {
    from: "[噪音] readme-typo",
    body: "README 第 3 段有个 typo(「instal」少了个 l),要修吗?",
  },
];

const BRIEFINGS = [
  {
    from: "[好简报] line-c-c3",
    body: "今天跟进了线 C 的收件箱动作(C3):\n- ✅ **完成**:回应/知道了/转待处理/看原文四个动作,[PR#24] 已合并。\n- ⏳ **还欠着**:C4 已完成区还没动。\n- ⚠️ **需你定**:转待处理的标题截断到 120 字,够不够开 PR 时帮看一眼。",
    obs: ["obs_pr24_merged"],
  },
  {
    from: "[好简报] auth-batch",
    body: "鉴权批量加固告一段落:\n- ✅ 6 个 `/api/*` 端点全加了 JWT 中间件 + 字段白名单。\n- ✅ 补了 9 例端到端测试,CI 绿。\n- ⏳ `/admin/*` 待你拍板后再动(已单独问你)。",
  },
  {
    from: "[差简报] verbose-log",
    body: "我先打开了 src/auth.ts,然后看了 middleware.ts,接着搜了 grep JWT,发现 3 处引用,然后逐个改,改第一个时遇到类型报错,查了文档,修好后跑测试,测试报了另一个错,又改了 import,再跑就过了,然后我提交了,接着开始看下一个文件……(此条故意冗长复述全程,测「流水账」该不该进收件箱)",
  },
  {
    from: "[差简报] trivial",
    body: "跑了下测试,过了。",
  },
  {
    from: "[差简报] mid-flight",
    body: "正在改第 3 个文件,还有 2 个没改完,稍后继续。",
  },
];

async function post(path, body) {
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
  const res = await fetch(`${BASE}/agentmemory${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function get(path) {
  const headers = {};
  if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
  const res = await fetch(`${BASE}/agentmemory${path}`, { headers });
  return res.json().catch(() => ({}));
}

// 评测前缀:--clear 只清 fromAgent 以这些标记开头的项,绝不动用户真实 inbox。
const EVAL_PREFIXES = ["[真信号]", "[边界]", "[噪音]", "[好简报]", "[差简报]"];
function isEvalItem(item) {
  const from = (item && item.fromAgent) || "";
  return EVAL_PREFIXES.some((p) => from.startsWith(p));
}

async function clearAwaiting() {
  const r = await get("/inbox?status=awaiting&limit=200");
  const items = ((r && r.items) || []).filter(isEvalItem);
  for (const it of items) await post("/inbox/dismiss", { id: it.id });
  return items.length;
}

async function main() {
  if (process.argv.includes("--clear")) {
    const n = await clearAwaiting();
    console.log(`cleared ${n} eval-prefixed awaiting item(s)`);
  }
  let q = 0, b = 0;
  for (const item of QUESTIONS) {
    const r = await post("/inbox/ask", {
      body: item.body,
      fromAgent: item.from,
      project: "/repo/agentmemory",
      sourceObservationIds: item.obs,
    });
    if (r.status === 201) q++;
    else console.error("ask failed:", item.from, r.status, r.json);
  }
  for (const item of BRIEFINGS) {
    const r = await post("/inbox/notify", {
      body: item.body,
      fromAgent: item.from,
      project: "/repo/agentmemory",
      sourceObservationIds: item.obs,
    });
    if (r.status === 201) b++;
    else console.error("notify failed:", item.from, r.status, r.json);
  }
  console.log(`seeded ${q} questions + ${b} briefings (total ${q + b})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
