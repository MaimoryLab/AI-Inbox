# 规划文档归档与分类索引

本目录收纳**已交付/历史**的规划文档。但许多规划/交付文档仍被构建脚本(`scripts/check-delivery.mjs` 等)硬引用,**移动会断 `npm run check:delivery`**,故它们留在 `docs/` 原位——本文件给出**全量分类索引**,标注每份文档的归属与状态,让「散落」变「有序」而不破坏流水线。

## 一、已物理归档(在本目录)

| 文档 | 内容 | 状态 |
|---|---|---|
| [product-restructure-plan-cn.md](./product-restructure-plan-cn.md) | 三栏重构(总览/待办/证据)产品方案 = 线 A | ✅ 已交付(STEP-01–07 全合并),历史保留 |

## 二、仍在 `docs/` 原位(被 scripts 硬引用,勿移)

### 产品 / 方向
| 文档 | 内容 | 状态 |
|---|---|---|
| `dev/line-c-plan-cn.md` 计划位 → 实际 `docs/line-c-plan-cn.md` | 线 C:Agent→用户异步收件箱 | 🟡 待审阅(本轮新出) |

### 交付 / 发布(scripts 依赖,operational)
| 文档 | 内容 | 被谁引用 |
|---|---|---|
| `product-delivery-plan-cn.md` | 交付计划 | README、check-delivery.mjs |
| `project-delivery-guide-cn.md` | 项目交付说明 | check-delivery.mjs、check-maimorylab-branding.mjs |
| `release-gates-cn.md` | 发布门槛 | check-delivery.mjs(断言含特定 marker) |
| `demo-checklist-cn.md` | 演示检查清单 | 交付物料 |

### 外部测试闭环(scripts 依赖,operational)
| 文档 | 内容 | 被谁引用 |
|---|---|---|
| `external-test-loop-cn.md` | 外部测试闭环 | 交付物料 |
| `external-tester-guide-cn.md` | 外部试用指南 | check-delivery.mjs(testerGuideUrl 断言) |
| `external-feedback-template-cn.md` | 反馈模板 | check-delivery.mjs、check-viewer-delivery-runtime.mjs |
| `external-feedback-triage-cn.md` | 反馈分诊指南 | check-delivery.mjs |

### 浏览器插件(scripts 依赖,operational)
| 文档 | 内容 |
|---|---|
| `browser-extension-ai-validation-cn.md` / `-ai-site-test-cards-cn.md` | AI 站点验收记录/测试卡 |
| `browser-extension-privacy-cn.md` / `-en.md` | 隐私说明 |
| `browser-extension-store-listing-en.md` | 商店列表文案 |
| `browser-extension-mem0-reference-cn.md` | mem0 对照参考 |

### 开发环境文档(活跃)
见 [`../dev/README.md`](../dev/README.md):environment / design-lock / tooling-and-skills / workflow-review。

### 重构步骤看板(线 A 历史 + 模板)
见 [`../issues/README.md`](../issues/README.md):STEP-00–07 已全部交付;TEMPLATE.md 供新步骤复用。

## 归档原则

- **能移则移、会断则留**:仅当文档无代码依赖、且确属「已交付/superseded」才物理移入本目录;被 scripts 硬引用的 operational 文档留原位,只在此索引登记。
- **移动同步改链接**:物理移动时同步更新所有 doc 内引用(本轮改了 dev/README、workflow-review、design-lock 三处指向)。
- **历史文档加横幅**:归档文档顶部标注「已交付/历史」横幅 + 指向后继文档(如线 A 方案 → 线 C 方案 / issues 看板)。
