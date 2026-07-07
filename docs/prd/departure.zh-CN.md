# PRD：发团管理（Epic）

**状态**：已定案（Grilling 2026-07-07 + ADR-0002；架构拍板 2026-07-07 PM）  
**Menu Key**：`/departure`（常用路线无独立 Menu Key，嵌在建团与详情流程）  
**域词汇**：见根目录 [CONTEXT.md](../../CONTEXT.md)  
**架构决议**：[docs/adr/0002-departure-domain-model.md](../adr/0002-departure-domain-model.md)  
**产品设计稿**：`ider/` 下 6 份文档（团单列表、新建、详情页头部、客源管理、行程段管理、资源安排）  
**财务脊柱参考**：dijieshe `product/docs/finance-handover-spec.zh-CN.md`（三层模型、finance-touched、核销规则）

---

## Problem Statement

地接社计调的日常核心是 **发团**——围绕一次出团活动收客、规划行程、安排资源（含拼出）、跟进收付款。当前小团宝 `/departure` 仅为占位页；Partner / Supplier 名录已落地，但缺少运营容器、客源单、行程段、资源行及财务生成链路。计调无法在系统内完成「选常用路线建团 → 录客源 → 切段配资源 → 显式生成应收应付 → 核销结清 → 关闭发团」的闭环，也无法在列表层看到出团进度与财务摘要。

---

## Solution

交付 **发团（Departure）** 完整 Epic：常用路线快照、发团 CRUD 与状态机、客源单（收入侧结算单元）、行程段与统一资源行（含拼出）、Finance 基座（收付款节点 / 流水 / 核销）、显式财务生成与跟进、发团级 Read Model 汇总。发团是运营容器，不是财务结算单元——应收从客源单生成，应付从段内资源生成，头部概览为跨子单元只读汇总。

实现按纵向切片交付（见 Further Notes），但本 PRD 描述 **完整 Epic 目标态**。

---

## User Stories

### 发团列表与生命周期

1. 作为计调，我希望在发团列表看到团号、团名、路线、发团类型、出团日期、出团进度、发团状态、人数与财务摘要，以便快速掌握所有在跟团的概况。
2. 作为计调，我希望按团号/团名、路线、发团类型、出团日期范围、出团进度、发团状态、负责人、发客客户筛选发团，以便定位目标团。
3. 作为计调，我希望列表展示完成情况小标签（客源/行程/资源/应收/应付），以便一眼看出资料缺口。
4. 作为计调，我希望出团进度（未开始/进行中/已结束）由日期自动派生，以便与时间轴对齐且不必手动维护。
5. 作为计调，我希望手动将发团从「编辑中」切到「待结算」，以便标记进入收付款跟进阶段。
6. 作为计调，我希望系统在收付款节点全部结清或关闭后提示「已结清」，以便确认可归档。
7. 作为计调，我希望手动「关闭发团」后整团只读，以便归档历史团。
8. 作为计调，我希望发团类型（独立团/拼团）仅作展示标签且可筛选，以便识别成团方式而不被规则约束。
9. 作为计调，我希望复制已有发团快速建团（不含客源与财务），以便复用结构与资源草稿。
10. 作为企业管理员，我希望与计调一样管理发团全流程。

### 新建发团与常用路线

11. 作为计调，我希望新建发团时先选择常用路线，以便从惯发线路快速起步。
12. 作为计调，我希望选路线后勾选复制行程段、资源配置、参考价格，且客源与应收应付不可复制，以便高效建团又避免财务污染。
13. 作为计调，我希望选路线建团后与模板脱钩，以便后续改模板不影响已建发团。
14. 作为计调，我希望手动输入路线建团（不选模板），以便应对临时线路。
15. 作为计调，我希望团名默认按路线名 + 出团日期生成、团号默认自动生成且均可改，以便减少录入。
16. 作为计调，我希望选择路线后结束日期按默认天数自动计算，以便对齐团期。
17. 作为计调，我希望在发团详情将当前结构「保存为常用路线」，以便沉淀可复用模板。
18. 作为计调，我希望保存常用路线时不含客源、收付款节点与流水，以便模板只存结构与参考价。

### 发团详情与概览

19. 作为计调，我希望发团详情页顶部展示经营概览（人数、原始/实际应收、应付、毛利、已收未收/已付未付），以便不进入子 Tab 也能掌握财务态势。
20. 作为计调，我希望顶部概览为只读 Read Model，写入入口在客源/资源/财务 Tab，以便职责清晰。
21. 作为计调，我希望详情 Tab 包含概览、客源管理、行程段、资源安排、应收管理、应付管理、核销记录，以便在一个工作区内完成运营与财务跟进。
22. 作为计调，我希望在概览 Tab 编辑发团基础信息与切换发团状态，以便维护团期元数据。

### 客源单（收入侧）

23. 作为计调，我希望在发团内添加客源单，记录发客 Partner、人数、团款、优惠与收款拆分，以便表达每家合作方输送的客人。
24. 作为计调，我希望客源单名称自动生成（客户名 + 出团日期 + 发客），以便不必手填标题。
25. 作为计调，我希望录入原始团款单价与人数后自动算原始应收、优惠后结算金额，以便减少算术错误。
26. 作为计调，我希望选择收款方式（全部我方代收 / 客户已收 + 我方代收 / 客户结算），以便表达钱款拆分。
27. 作为计调，我希望保存客源单 **不会** 自动生成应收，以便先确认事实再触发财务。
28. 作为计调，我希望点击「生成应收」按路径创建收付款节点：客户已收 > 0 → 客户补款（Partner）；我方代收 > 0 → 游客代收（游客档案），以便往来对象与跟进责任正确。
29. 作为计调，我希望金额为 0 的应收路径不建节点，以便不产生无效账款。
30. 作为计调，我希望维护客源单客人名单（姓名、手机、性别、备注），以便留存游客明细。
31. 作为计调，我希望用名单数量「同步人数」回填客人人数，以便保持一致。
32. 作为计调，我希望未生成应收的客源单可删除，已生成应收的不可直接删除，以便保护财务追溯。
33. 作为计调，我希望已 finance-touched 的应收不因源事实金额变更而静默修改，而显示来源差异警示，以便财务与 OP 分工明确。
34. 作为计调，我希望地接全收后需付合作方的款项第一版在应付管理手动录入，不在客源单自动生成，以便符合当前业务习惯。

### 行程段（成本锚点）

35. 作为计调，我希望按日期与目的地切分行程段（如喀纳斯段 7/1–7/3），以便按段规划成本。
36. 作为计调，我希望行程段日期必须在发团日期范围内，以便团期一致。
37. 作为计调，我希望适用人数默认取发团总人数且可改，以便段级成本分摊准确。
38. 作为计调，我希望从行程段列表一键进入资源安排并锁定当前段，以便资源不会误挂到其他段。
39. 作为计调，我希望模板带入的行程段显示「模板带入」标签，以便识别来源。
40. 作为计调，我希望段内无资源或未生成应付时可删除行程段，有资源时不可删，以便保护已录入成本。
41. 作为计调，我希望 **不设** 段级执行方式互斥——同一段可同时有自营资源与拼出，以便符合实际计调习惯。

### 资源安排（统一资源行）

42. 作为计调，我希望在行程段下添加资源行（用车、酒店、导游、门票、餐、拼出、其他），以便录入所有成本。
43. 作为计调，我希望拼出种类关联 Partner（承接方），其他种类关联 Supplier，以便对手方正确。
44. 作为计调，我希望一段内可有多条资源且种类可混合，以便表达复杂安排。
45. 作为计调，我希望保存资源 **不会** 自动生成应付，以便显式确认后再触发。
46. 作为计调，我希望点击「生成应付」为单条资源创建一条应付节点，以便一条资源对应一条账款。
47. 作为计调，我希望资源金额、种类、对手方、备注在第一版足够表达成本，使用日期/数量/单价写入备注，以便轻量上线。
48. 作为计调，我希望未生成应付的资源可编辑/删除，已生成应付或已付款的受 finance-touched 规则约束，以便保护已处理账款。
49. 作为计调，我希望资源安排 Tab 锁定段后不可切换段，须回行程段列表重进，以便避免误操作。

### 财务基座与操作

50. 作为财务，我希望在全局应收管理查看与登记收款、关联流水、关闭应收，以便跟进所有团的收入。
51. 作为财务，我希望在全局应付管理登记付款、关联流水、关闭应付，以便跟进所有团的支出。
52. 作为财务，我希望在财务流水登记实际收支并在核销管理完成流水 ↔ 账款分配，以便结清状态权威来自核销层。
53. 作为财务，我希望全局列表可按发团 scope 筛选，以便聚焦单团账款。
54. 作为计调，我希望在发团详情应收/应付/核销 Tab **只读查看** 当前发团范围的账款与核销（复用 Finance Workspace），以便在团内上下文跟进而无需进入全局财务菜单。
55. 作为 OP，我希望触发生成应收/应付后，未 finance-touched 的节点可随源事实金额同步，以便减少重复录入。
56. 作为 OP，我希望关联流水时往来对象必须匹配，以便避免错配核销。
57. 作为老板，我希望在发团列表与详情看到待收/待付与预估毛利，以便经营判断（待收待付不计入实际毛利，与生产一致）。

### 权限与隔离

58. 作为财务，我不应看到发团管理菜单，且调用发团运营 API 应被拒绝；我通过全局财务菜单操作。
59. 作为计调，我不应访问全局财务菜单（与现有 Role 定义一致），但在发团详情内可查看团内财务记录、手动触发生成应收/应付；登记收付与核销须由财务在全局菜单完成。
60. 作为企业管理员，我希望拥有发团与全局财务的全部菜单，以便兜底处理。
61. 作为开发者，我希望所有业务 API 从 JWT 解析 organizationId，不接受客户端传入，以便多租户隔离。

### 数据完整性

62. 作为开发者，我希望金额一律整数分（cents）、币种 CNY，以便与财务脊柱一致。
63. 作为开发者，我希望收付款节点编号遵循 AR/AP/TR 规则，以便与生产习惯一致。
64. 作为开发者，我希望 Partner/Supplier 选择器在新业务中排除已归档与停用档案，以便目录 lifecycle 生效。

---

## Implementation Decisions

### 模块边界（Bounded Contexts）

| 上下文 | 职责 | NestJS 模块 |
| ------ | ---- | ----------- |
| **Departure** | 发团、常用路线（Route Template）、客源单、行程段、段内资源、Read Model 汇总 | `departure` |
| **Finance** | 收付款节点、流水、核销、状态推导、finance-touched | `finance` |
| **Directory**（已有） | Partner / Supplier 名录引用 | 已有 `partner`、`supplier` |

**RouteTemplate 合入 Departure 模块**（已定案）：常用路线无独立 Menu Key、无独立 NestJS 模块。`RouteTemplateService` 作为 `departure` 模块内部服务；表独立（`route_templates` + 子表），HTTP 路由可挂 `/route-templates` 或嵌在 `/departures` 建团流程，但 **代码归属 `departure` 模块**。

**上下文关系**：

```text
RouteTemplate（departure 内）──copy-on-create──► Departure 实例
Directory (Partner/Supplier) ──引用──► Departure
Departure.SourceOrder ──[显式]──► Finance.Receivable
Departure.SegmentResource ──[显式]──► Finance.Payable
Finance ──派生──► Departure Read Model（待收/待付/结清态）
```

### 财务脊柱策略

**决策：领域逻辑移植 + 技术栈重写**（非整库 copy，非从零发明规则）。

- **移植语义**：三层模型（`payment_schedules` / `transactions` / `finance_verification`）、`deriveScheduleState` 优先级、`finance-touched` 判定、来源差异警示、关联流水往来对象匹配（ADR-0007）、P2.1 双写核销、编号规则（AR/AP/TR）。
- **重写实现**：NestJS Module + Prisma schema + Ant Design 前端；不引入 Drizzle/Hono 代码。
- **适配发团模型**：应收来源改为 **客源单**（非 Project 团款组成）；应付来源改为 **段内资源行**（非 Day 确认批量、非独立拼出实体）。不实现 `day_confirmed`、`quote_confirmation` 类 source_type。
- **Phase 3 义务双层模型**（ADR-0018/0019）**不在本 Epic**；当前 `payment_schedules` 兼计划与账期语义。

### 测试接缝（最高层优先）

| 优先级 | 接缝 | 覆盖 |
| ------ | ---- | ---- |
| **主** | Finance HTTP E2E（`/api/finance/*` 或等价路径） | 节点 CRUD、登记收付、核销、finance-touched、编号 |
| **主** | Departure HTTP E2E（`/api/departures/*`） | 建团、状态、客源/段/资源 CRUD、生成触发、权限 |
| **次** | Route Template HTTP E2E | 模板 CRUD、copy-on-create 脱钩 |
| **次** | 前端关键页 smoke / 组件测试 | 列表列、抽屉校验、Tab 切换 |

现有 Partner/Supplier E2E 在目录选择器 enforce 变更后须仍通过。

### 权限

| Role | `/departure` 及详情 | 全局 `/finance/*` | 发团详情内财务 Tab |
| ---- | ------------------- | ------------------- | ------------------ |
| 企业管理员 | 可访问、可编辑 | 可访问 | 可查看、触发生成、登记收付/核销 |
| 计调 | 可访问、可编辑 | **不可** | **可查看** 当前团应收/应付/核销记录；**可手动触发生成应收/应付**；**不可** 登记收付、关联流水、核销 |
| 财务 | **不可** | 可访问 | **不可** 通过发团菜单进入；从全局财务页按发团筛选 |

**已定案：计调在团内看账 + 触发生成，登记走全局财务。** 计调日常在发团详情跟进账款状态并确认源事实后触发生成；实际资金登记（登记收款/付款、关联流水、核销、关闭节点）由财务或企业管理员在全局财务菜单完成。本 Epic **不** 扩展计调对 `/finance/*` Menu Key 的访问。

**后端 enforcement（两层 Menu Key）**：

| 能力 | Menu Key | 典型路径 |
| ---- | -------- | -------- |
| 发团运营 + 团内财务只读 + 触发生成 | `/departure` | `GET /departures/:id/receivables`（只读）、`POST .../generate-receivables`、`POST .../generate-payable` |
| 全局财务 mutation | `/finance/receivable` 等 | `POST /finance/receivables/:id/confirm-collection`、`link-transaction`、核销 CRUD |

Departure 接口 `@RequireMenu('/departure')`；Finance mutation 接口 `@RequireMenu` 对应各 `/finance/*` 叶子路由；详情子路由不单独设 Menu Key。计调调用全局 Finance mutation API → **403**。

### 路由与导航

| 路径 | 说明 |
| ---- | ---- |
| `/departure` | 发团列表 + 新建抽屉 |
| `/departure/$departureId` | 详情页（Tab）；query `tab` 切换 |
| `/departure/$departureId?tab=overview` | 概览 |
| `/departure/$departureId?tab=sourceOrders` | 客源管理 |
| `/departure/$departureId?tab=segments` | 行程段 |
| `/departure/$departureId?tab=resources&segmentId=` | 资源安排（锁定段） |
| `/departure/$departureId?tab=receivables` | 应收（Finance scope） |
| `/departure/$departureId?tab=payables` | 应付 |
| `/departure/$departureId?tab=verifications` | 核销记录 |

列表交互：名称/团号 Link → 详情；操作列：查看、编辑、复制、关闭。

### 发团状态机

```text
editing（编辑中）──[OP 手动]──► pending_settlement（待结算）
pending_settlement ──[系统：全部节点 settled/cancelled]──►提示──► settled（已结清）
settled / pending_settlement / editing ──[OP 手动]──► closed（已关闭，只读）
```

- `departureProgress`（未开始/进行中/已结束）：由 `startDate`/`endDate` 与业务日（Asia/Shanghai）派生，不落库或落库为 computed。
- `departureType`：`independent` 独立团 | `combined` 拼团；纯标签，不校验客源单数量。

### 发团核心字段

| 字段 | API | 必填 | 说明 |
| ---- | --- | ---- | ---- |
| 团号 | `departureNo` | 是 | 默认自动生成，可改；org 内唯一 |
| 团名 | `name` | 是 | 默认路线名 + 出团日期 |
| 路线名称 | `routeName` | 是 | 实例快照，非活引用 |
| 路线来源 | `routeSource` | 系统 | `template` / `manual` / `copy` |
| 来源模板 ID | `sourceTemplateId` | 否 | 仅追溯，不活引用 |
| 发团类型 | `departureType` | 是 | 默认 `combined` |
| 出团日期 | `startDate` | 是 | 日期 |
| 结束日期 | `endDate` | 是 | ≥ startDate |
| 团期天数 | `dayCount` | 自动 | end − start + 1 |
| 负责人 | `ownerUserId` | 是 | User FK |
| 发团状态 | `status` | 系统 | 见状态机 |
| 备注 | `notes` | 否 | |

列表 Read Model 字段（API 聚合或 list query 返回）：`totalGuests`、`sourceOrderCount`、`segmentCount`、`resourceCount`、`completionTags`、`plannedReceivableCents`、`plannedPayableCents`、`estimatedMarginCents`、`collectedCents`、`uncollectedCents`、`paidCents`、`unpaidCents`。

### 常用路线（Route Template）

独立表 `route_templates` + 子表 `route_template_segments`、`route_template_resources`（结构与发团段/资源平行，无客源/财务 FK）。

**copy-on-create 规则**（勾选项默认全选除禁用项）：

| 复制 | 默认 |
| ---- | ---- |
| 行程段结构 | ✓ |
| 资源配置草稿（含拼出种类） | ✓ |
| 参考价格 | ✓ |
| 客源 | ✗ 禁用 |
| 收付款节点 | ✗ 禁用 |

复制完成后 `departure.sourceTemplateId` 仅作追溯；后续改模板 **不** 影响已建发团。

**保存为常用路线**（从发团详情）：反向快照段与资源；同样禁用客源/财务。

API 建议：`GET/POST /route-templates`、`GET/PATCH /route-templates/:id`；建团 `POST /departures` body 含 `templateId` + copy flags。

### 客源单（Source Order）

表 `source_orders` + `source_order_guests`（客人名单）。

| 字段 | API | 说明 |
| ---- | --- | ---- |
| 显示名 | `displayName` | 自动生成，规则见 ider |
| 客户 | `partnerId` | 发客 Partner；选择器排除 archived/disabled |
| 客人人数 | `guestCount` | ≥ 1 |
| 原始团款单价 | `unitPriceCents` | 分 |
| 原始应收 | `grossReceivableCents` | 计算 |
| 优惠方式 | `discountType` | `none` / `lump_sum` |
| 优惠金额 | `discountCents` | |
| 结算金额 | `netReceivableCents` | gross − discount |
| 收款方式 | `collectionMode` | `guest_only` / `split` / `partner_settled` |
| 客户已收 | `partnerCollectedCents` | |
| 我方代收 | `guestCollectCents` | net − partnerCollected |
| 结算说明 | `settlementNotes` | 可选 |
| 备注 | `notes` | |
| 应收状态 | `receivableStatus` | 派生：未生成/待收/部分/已收齐 |

**生成应收** `POST /source-orders/:id/generate-receivables`：

| 路径 | 条件 | schedule 标题 | 往来对象 | source_type |
| ---- | ---- | ------------- | -------- | ----------- |
| 客户补款 | partnerCollectedCents > 0 | 客户补款 | Partner | `source_order_customer_settlement` |
| 游客代收 | guestCollectCents > 0 | 游客代收 | Guest 档案 | `source_order_guest_collection` |

同一客源单每条路径 **最多一条活跃来源应收**；regenerate 策略：未 touched 可 sync 金额；touched 仅警示。

游客档案：第一版 embedded 字段（名称/人数/电话）在客源单或独立 `guest_profiles` 表；无独立 CRUD 菜单。

### 行程段（Itinerary Segment）

表 `itinerary_segments`：`departureId`、`name`、`startDate`、`endDate`、`dayCount`、`destination`、`applicableGuestCount`、`notes`、`fromTemplate` boolean。

校验：日期 ⊆ 发团日期；end ≥ start；applicableGuestCount ≥ 1。

删除：段内 **无** 资源行，或资源均未生成应付。

### 段内资源（Segment Resource）

表 `segment_resources`：`segmentId`、`resourceKind`、`counterpartyType`（partner|supplier）、`partnerId?`、`supplierId?`、`title`、`amountCents`、`notes`。

**resourceKind 枚举**：`transport`、`hotel`、`guide`、`ticket`、`meal`、`outsource`（拼出）、`other`。

| resourceKind | 对手方 |
| ------------ | ------ |
| `outsource` | Partner（承接方） |
| 其他 | Supplier |

**生成应付** `POST /segment-resources/:id/generate-payable`：一条资源 → 一条 `direction=payable` 节点；source_type = `segment_resource`；对手方快照到 schedule。

### Finance 数据模型要点（Prisma）

**payment_schedules**（摘要）：

- `organizationId`、`departureId`（scope）、`direction`（receivable|payable）
- `scheduleNo`、`title`、`amountCents`、`dueDate`
- `counterpartyType`（partner|supplier|guest|manual）、`counterpartyId?`、`counterpartyName?`
- `sourceType`、`sourceId`（客源单或资源行）
- `status` 派生字段或 cache；`cancelledAt`、`cancelReason`
- finance-touched 标记（字段或派生）

**transactions**：`transactionNo`、`direction`、`amountCents`、`transactionDate`、`counterparty*`、作废标记。

**finance_verification**：M:N 分配；`verificationNo`；NORMAL / CANCELLED；权威 settled 来源。

Departure / SourceOrder / SegmentResource 表预留 `paymentSchedule` 关联或仅通过 source 追溯，**不在源表存结清态**。

### finance-touched 与编辑规则

与 finance-handover-spec §5.3 / §6 对齐，源改为客源单/资源行：

**Receivable finance-touched**（任一）：

1. `settledAmountCents > 0`（NORMAL 核销 SUM）
2. 财务修改过金额/往来/到期日
3. 已关闭

**Payable finance-touched**：对称规则。

| 变更 | 未 touched | 已 touched |
| ---- | ---------- | ---------- |
| 改源事实金额 | 同步 schedule 金额 | 不改金额，**来源差异警示** |
| 改备注/非金额字段 | 允许 | 允许 |

发团 `closed`：全部只读。发团 `settled`：行程段/资源只读（或仅备注，与 ider 对齐为只读）。

### API 结构（摘要）

基础路径 `/api`；JWT + Menu Permission。

**Departure**

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/departures` | 列表 + 筛选 + Read Model 摘要 |
| POST | `/departures` | 创建（含 template copy） |
| GET | `/departures/:id` | 详情 + 概览 Read Model |
| PATCH | `/departures/:id` | 更新基础信息 |
| POST | `/departures/:id/transition` | 状态切换（body: `targetStatus`） |
| POST | `/departures/:id/close` | 关闭 |
| POST | `/departures/:id/copy` | 复制建团 |

**嵌套资源**（均可挂 `departureId` 前缀 REST）：

- `/departures/:id/source-orders` CRUD + `generate-receivables`
- `/departures/:id/segments` CRUD
- `/departures/:id/segments/:segmentId/resources` CRUD + `generate-payable`
- `/departures/:id/guests` 或通过 source-order 子资源

**Finance**（全局 mutation + 发团 scope 只读）

| 方法 | 路径 | Menu Key | 说明 |
| ---- | ---- | -------- | ---- |
| GET | `/departures/:id/receivables` | `/departure` | 发团 scope 应收（只读；计调可访问） |
| GET | `/departures/:id/payables` | `/departure` | 发团 scope 应付（只读） |
| GET | `/departures/:id/verifications` | `/departure` | 发团 scope 核销（只读） |
| GET | `/finance/receivables?departureId=` | `/finance/receivable` | 全局应收列表（财务） |
| GET | `/finance/payables?departureId=` | `/finance/payable` | 全局应付列表 |
| POST | `/finance/receivables/:id/confirm-collection` | `/finance/receivable` | 登记收款 |
| POST | `/finance/payables/:id/confirm-payment` | `/finance/payable` | 登记付款 |
| POST | `/finance/receivables/:id/link-transaction` | `/finance/receivable` | 关联流水 |
| POST | `/finance/payment-schedules/:id/cancel` | 对应 direction | 关闭节点 |
| GET/POST | `/finance/transactions` | `/finance/transactions` | 流水 |
| GET/POST | `/finance/verifications` | `/finance/verification` | 核销 |

具体路径命名 implement 时可与现有 placeholder 路由对齐；**权限语义**以上表为准——发团详情 Tab 走 `/departures/:id/*` 只读端点，全局页走 `/finance/*` mutation 端点。

### 前端结构（建议）

```text
apps/web/src/features/departure/
  pages/DeparturesPage.tsx
  pages/DepartureDetailPage.tsx
  components/DepartureOverview.tsx
  components/SourceOrderDrawer.tsx
  components/SegmentDrawer.tsx
  components/ResourceDrawer.tsx
  services/route-template.service.ts          # 常用路线 API，归属 departure feature
  ...
apps/web/src/features/finance/
  components/PaymentScheduleWorkspace.tsx   # 发团详情 + 全局页复用
  pages/ReceivablesPage.tsx
  ...
packages/shared/src/enums/departure*.ts
packages/shared/src/enums/finance*.ts
```

`PaymentScheduleWorkspace` 通过 `scope` 区分模式：`departure`（计调：只读 + 触发生成）vs `global`（财务：完整 mutation）。

列表 UI 对齐 Partner/Supplier（Ant Design Table + Drawer + TanStack Query）。

### 编号与金额

- 金额：**整数分**；展示层格式化为元。
- 币种：**CNY** 固定。
- 业务日：**Asia/Shanghai** 日期粒度。
- 节点编号：`ARyyyyMMdd####` / `APyyyyMMdd####`；流水 `TRyyyyMMdd####`。

### 与生产（dijieshe）差异摘要

| 项 | 生产 Project 模型 | 小团宝 Departure Epic |
| -- | ----------------- | --------------------- |
| 收入源事实 | 项目级团款组成 + 团款确认 | 客源单 + 生成应收 |
| 成本源事实 | Day 工作台 + Day 确认批量 | 行程段 + 单条资源生成应付 |
| 拼出 | 独立拼出记录 | resourceKind = 拼出 |
| 行程单元 | Day | Itinerary Segment |
| 常用路线 | 部分 | Route Template copy-on-create |
| 发团详情 Tab | 部分落地 | 本 Epic 目标态 |

---

## Testing Decisions

### 什么是好测试

只测 **对外可观察行为**：HTTP 状态码、响应体字段与枚举、权限 403、状态机非法转换 400、金额校验、finance-touched 下编辑拒绝、生成触发幂等与 source 追溯、列表 Read Model 计数、copy-on-create 不含财务 FK。不断言 service 内部调用顺序或 Prisma query 次数。

### 主测试接缝

**1. Finance HTTP E2E**（先于或与 Departure 并行落地 E0）

- 创建 receivable/payable；金额 > 0 校验
- 登记收付 + 核销双写；settled 派生正确
- finance-touched 后 PATCH 源金额 → schedule 不变 + 警示 flag
- 关联流水 counterparty mismatch → 拒绝
- 关闭节点不可恢复
- 财务角色可访问全局 finance mutation；计调角色 POST `/finance/*` mutation → 403
- 计调角色 GET `/departures/:id/receivables` → 200；POST generate-receivables / generate-payable → 200

**2. Departure HTTP E2E**

- 计调 CRUD 发团；财务 GET `/departures` → 403
- 状态转换：editing → pending_settlement；closed 后 PATCH → 409
- 模板建团：段/资源复制；无 source_order / payment_schedule
- 客源单：收款拆分校验；generate-receivables 双路径；0 金额不建节点
- 资源：拼出必 Partner；generate-payable 一条一节点
- 删除保护：有 schedule 的客源/资源不可删
- 列表 completionTags 与 summary 字段

### Prior art

- `apps/api/test/supplier.e2e-spec.ts`、`partner.e2e-spec.ts` — 权限、归档、CRUD 模式
- dijieshe `product/src/ui/App.test.tsx` — 财务闭环场景（语义参考，非直接移植）

### 非阻塞次要测试

- 前端：`DepartureDetailPage` Tab 渲染、抽屉校验 message
- Read Model 单元测试：deriveScheduleState、departureProgress 日期边界

---

## Out of Scope

| 非目标 | 说明 |
| ------ | ---- |
| 变更记录 Tab | ider 未展开；后续 Epic |
| 发团详情「流水/毛利」独立 Tab | 合并到概览 Read Model + 全局流水；不做 Project 式 tab=transactions |
| Dashboard 节点跟进 / 近期待到期 | 依赖发团 + Finance 落地后的工作台 Epic |
| Day 级行程工作台 | 模型为 Segment，非 Day |
| Day 确认资源批量应付 | 改为单资源 generate-payable |
| 客源单自动生成 Partner 应付（地接全收后付合作方） | 手动应付 |
| 批量生成应付 / 按供应商分组应付 | 后续版本 |
| 资源独立字段：使用日期、数量、单价、计价方式 | 写备注 |
| 客源状态、批量操作、批量导出 | ider 第一版不做 |
| 行程段日历、拖拽排序、每日详细行程 | 后续 |
| 财务导出、批量核销、自动匹配 | finance-handover-spec §13 |
| Phase 3 义务双层模型 / 锁团自动生成 | ADR-0018/0019 |
| 常用路线独立菜单 | 嵌在建团/详情流程 |
| 计调访问全局 `/finance/*` 菜单或 mutation API | 已定案：计调仅在发团详情内只读 + 触发生成 |
| Platform Admin、多币种、跨 org 核销 | 不在 V1 |
| Partner/Supplier 详情「往来账款」「合作团单」真实业务 | 仍占位 |

---

## Further Notes

### Epic 纵向切片（供 `/to-issues`）

```text
E0  Finance Foundation（payment_schedules / transactions / verification 基座）
E1  Departure Skeleton（列表 / 新建 / 详情框架 / 状态机）
E2  RouteTemplate（`departure` 模块内；常用路线 CRUD + 建团复制）
E3  SourceOrder（客源单 CRUD + 客人名单）
E4  ItinerarySegment + SegmentResource（行程段 + 统一资源含拼出）
E5  Finance Generation（客源应收双路径 + 资源应付 + finance-touched）
E6  Finance Operations（发团详情 Finance Tab + 全局应收/应付/流水/核销页）
E7  Closure（结清判定 / 列表标签 / Read Model 完善）
```

E0 可与 E1 并行，但 Departure / SourceOrder / SegmentResource schema 须 **预留** `departureId` 与 finance source 链接字段。每个 issue 独立 session `/implement`，传入本 PRD + 单条 issue。

### Issue Tracker

Issue tracker 已配置：GitHub Issues（`docs/agents/issue-tracker.md`）。PRD 正文见 `docs/prd/departure.zh-CN.md`；执行 `/to-issues` 时将 Epic 切片发布为 GitHub Issues 并打 `ready-for-agent` 标签。

### 权威来源优先级

1. `CONTEXT.md` + ADR-0002  
2. `ider/` 设计稿  
3. finance-handover-spec（财务规则，适配 Departure 源）  
4. 已落地 Partner/Supplier 模式（路由、Drawer、E2E）  
5. dijieshe 生产 ADR-0025/0026（布局参考）

### UI 用语

- 产品界面统一 **发团**，不用「团单」  
- 名录 CRUD 用 **合作伙伴**；客源单 Tab 内 UI 可称 **客户**  
- 出团进度 vs 发团状态：前者日期派生，后者业务阶段  

---

## 验收清单

- [ ] 计调/企业管理员可访问 `/departure`；财务不可见且 API 403
- [ ] 列表列、筛选、完成情况标签、Read Model 财务摘要符合 ider
- [ ] 新建：选模板 copy 段/资源/参考价；不 copy 客源/财务；脱钩
- [ ] 保存为常用路线：反向快照，禁用客源/财务
- [ ] 发团状态机与出团进度派生正确；关闭后只读
- [ ] 客源单：收款拆分、自动命名、生成应收双路径、0 元不建节点
- [ ] 客人名单与同步人数
- [ ] 行程段：日期校验、模板带入标签、资源安排深链
- [ ] 资源：拼出→Partner、其他→Supplier；单条 generate-payable
- [ ] 保存客源/资源 **不** 自动生成节点；显式触发
- [ ] finance-touched 与来源差异警示符合 finance-handover-spec
- [ ] 全局财务四页可用；发团详情 Finance Tab scope 正确
- [ ] 计调：团内应收/应付/核销 Tab 只读可见；可触发生成应收/应付；全局 `/finance/*` mutation → 403
- [ ] 财务：全局财务可操作；发团运营 API → 403
- [ ] RouteTemplate 代码归属 `departure` 模块（无独立 NestJS 模块）
- [ ] 金额分、cents API、CNY；编号 AR/AP/TR
- [ ] Partner/Supplier 选择器 exclude archived/disabled
- [ ] Finance E2E + Departure E2E 覆盖核心路径
- [ ] Partner/Supplier 现有 E2E 仍通过
