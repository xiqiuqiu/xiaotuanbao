# PRD：发团详情导航与执行安排布局（方案 D）

**状态**：已定稿（原型验证 2026-07-30；Issue [#237](https://github.com/xiqiuqiu/xiaotuanbao/issues/237)）  
**Menu Key**：`/departure`（发团详情：导航 + 执行安排）  
**域词汇**：见根目录 [CONTEXT.md](../../CONTEXT.md)（重点：Departure、Execution Arrangement、Itinerary Segment、Departure Resource、Segment Resource、Execution Crew、Cost Total、Pending Payable Generation）  
**决议来源**：布局原型 A/B/C/D（PR [#236](https://github.com/xiqiuqiu/xiaotuanbao/pull/236)，分支 `cursor/departure-detail-layout-prototype-c893`）；用户确认 **D 款可落地**。相关能力背景见 [departure-daily-execution-crew-ground-income.zh-CN.md](./departure-daily-execution-crew-ground-income.zh-CN.md)、ADR-0034。  
**原型指针（primary source）**：免登录沙盒 `/prototype/departure-detail-layout?tab=execution&variant=D`；启动 `pnpm prototype:departure-detail-layout`。

---

## Problem Statement

发团详情里业务/财务 Tab 与执行安排的「发团级资源 / 按日资源」叠在一起时，计调很难一眼看清整团成本，也很难在「全程费用」与「按日酒店门票」之间切换而不丢上下文。左侧任务轨 + 纵向行程段列表在多日线路下占宽、扫读成本高；顶栏信息与执行区汇总口径也不统一，生成应付进度与金额缺口要跳多处才能拼齐。

## Solution

按已验证的 **方案 D（混搭）** 改造发团详情工作区（**替换现网详情布局，不保留 A/B/C 切换**）：

1. **导航**：顶栏横向 Tabs（业务 | 财务仅细分隔，无分组标题），URL `?tab=` 同步不变。  
2. **执行安排纵向编排**：整团成本条 → 发团级资源折叠区 → 按日横向日程轴 → 当日资源明细。  
3. **页头**：团基础信息一行；执行班组（司机 / 导游 / 车牌 / 电话）单独一行，文案不加「名称」。  
4. **汇总口径**：块级与整团均展示「资源 N 项｜资源金额｜尚未生成应付（金额 + 待生成项数）」，与现网资源头一致；操作列保留「生成应付 / 查看应付 / 作废应付」全文。

落地后删除开发期 `?variant=` 与独立原型沙盒（或仅 DEV 保留至拆票完成）。

---

## Testing Seam（建议确认）

**单一主 seam：发团详情工作区布局编排（Departure detail workspace layout orchestration）。**

在现有发团详情 Tab 路由与执行安排数据编排之上，只改 **呈现与工作区组成**；CRUD、应付生成、段选择 URL（`?segmentId=`）仍走既有编排，不新开平行工作台。

| 子面 | 落点（既有模块优先） | 说明 |
|---|---|---|
| 顶栏 Tabs | 发团详情导航 | 替换左侧任务轨 / 移动端 Select，保留 Tab 可见性与 URL 同步 |
| 执行区堆叠 | 执行安排工作区组成 | 成本条 + 发团级折叠壳 + 横向日程轴 + 当日明细 |
| 发团级表 | 既有发团级资源面板 | 折叠只包壳，不重写抽屉/生成逻辑；补齐与按日一致的批量生成应付（若现网仅按日有） |
| 日程轴 | 既有行程段列表面板的呈现替换 | 仍消费段列表与选中回调；多日段映射到轴上展示（日期区间/名称），不发明第二套段模型 |
| 当日明细 | 既有段资源面板 | 头区汇总与批量/添加入口保留 |
| 整团成本条 | 执行工作区内新建只读汇总呈现 | 客户端聚合发团级列表 + 各段资源金额/未生成缺口；不强制新 API |
| 页头班组 | 既有发团头卡片 | 司机/导游/车牌已有字段；联系电话无正式字段前显示「-」或不传 |

> 若实现时希望把「联系电话正式字段」拆为第二 seam，须产品同意；默认本 spec **不**改供应商/发团 API。

---

## User Stories

1. As a 计调, I want 发团详情用顶栏 Tabs 切换概览/客源/执行/财务等页, so that 不必在窄侧栏里找入口。  
2. As a 计调, I want 业务与财务 Tabs 只用细分隔而不显示「业务执行/财务处理」大分组标题, so that 一排扫读更干净。  
3. As a 计调, I want 切换 Tab 时 URL 的 `tab` 同步, so that 刷新与分享链接仍落在同一页。  
4. As a 计调, I want 执行安排顶部一眼看到整团成本合计, so that 发团级与按日拆开录入时仍有总账感。  
5. As a 计调, I want 成本条同时看到发团级金额、按日金额与尚未生成应付金额, so that 知道钱在哪、缺口多大。  
6. As a 计调, I want 尚未生成应付旁看到「N 项待生成」, so that 知道还要处理几条资源。  
7. As a 计调, I want 发团级资源默认在折叠区、可展开看全表, so that 按日工作时不被全程表占满屏。  
8. As a 计调, I want 发团级折叠头看到资源项数、资源金额与尚未生成应付, so that 收起时仍能判断要不要展开。  
9. As a 计调, I want 在发团级对未生成项批量生成应付, so that 不必逐行点「生成应付」。  
10. As a 计调, I want 按日资源用横向日程轴浏览 D1…Dn, so that 多日线路横向扫读比左侧长列表更快。  
11. As a 计调, I want 日程卡显示日期、行程段名称、资源项数与生成进度环, so that 哪天有缺口一眼可见。  
12. As a 计调, I want 有待检查资源的天在卡上打「待检查」, so that 优先核对。  
13. As a 计调, I want 选中某天后下方只显示该日资源表, so that 录入酒店/门票不与发团级表抢视线。  
14. As a 计调, I want 当日明细头看到短标题（如 Dx + 日期 + 名称）与编辑入口, so that 改行程段名称不必回轴上找。  
15. As a 计调, I want 当日明细头汇总「资源 N 项｜资源金额｜尚未生成应付」, so that 与现网资源安排头一致。  
16. As a 计调, I want 当日也能批量生成应付并添加资源, so that 操作与现网段资源区能力对齐。  
17. As a 计调, I want 在轴上添加一天 / 删除一天（有资源时确认）, so that 手工调团期骨架。  
18. As a 计调, I want 资源操作列显示「编辑 / 生成应付 / 查看应付 / 作废应付」全文, so that 不与「查看资源」混淆。  
19. As a 计调, I want 页头看到司机、导游、车牌、电话, so that 执行班组信息可查而不必进编辑抽屉。  
20. As a 计调, I want 页头班组标签为「司机／导游／车牌／电话」而不加「名称」, so that 文案更短。  
21. As a 财务, I want 只读进入详情时仍能用顶栏进应付等相关 Tab, so that 权限模型与现网一致（无写权限则无编辑/作废等）。  
22. As a 计调, I want 小屏上顶栏 Tabs 与执行区可换行/横滑而不丢主操作, so that 平板上仍能干活。  
23. As a 开发, I want 落地后去掉生产路径对布局原型 `variant` 的依赖, so that 主站不再挂 throwaway 切换器。

---

## Implementation Decisions

1. **选定方案 D**：导航取原方案 A 的顶栏 Tabs；执行取原方案 B 的「发团级折叠 + 横向日程轴 + 当日明细」。不把 A/B/C/D 切换器带进生产。  
2. **主 seam 只改编排呈现**：执行区数据加载、段 CRUD、资源抽屉、应付生成/作废/查看仍复用现有执行安排编排；布局层重新组合既有发团级面板与段资源面板。  
3. **整团成本条为只读聚合**：成本合计 = 发团级资源金额合计 + 各行程段资源金额合计（或等价客户端聚合）；尚未生成应付金额/项数按「未生成且金额&gt;0」的资源行统计，与现网段汇总工具同一口径。不为此阻塞新后端聚合接口。  
4. **发团级折叠**：折叠头承载标题 + 金额汇总；展开后为既有发团级资源表。批量生成应付与「添加」放在折叠头操作区（与原型一致）。  
5. **横向日程轴**：选中态驱动既有 `segmentId` URL/状态；卡面信息对齐现网段卡已有字段（名称、日期、资源数、应付生成进度、待检查）。生产行程段若为日期区间，轴上展示与现网一致的日期/名称映射，不引入原型专用 `dayIndex` 持久化模型。  
6. **操作文案**：生成应付 / 查看应付 / 作废应付不可省略为「生成／查看／作废」。  
7. **页头班组**：展示司机、导游、车牌；联系电话在发团详情无正式字段前固定为「-」（或仅有演示数据的原型路径传值）。不在本 spec 扩展供应商档案或发团 API。  
8. **原型处置**：实现合并后移除（或 DEV-only 直至拆票完成）独立沙盒路由、PrototypeSwitcher 与 `?variant=` 挂载；PR #236 分支保留作 primary source 指针。  
9. **设计约束**：遵循根目录 `DESIGN.md`（中性工作面、少套卡片、蓝仅用于操作/选中）；成本条用均分指标格避免中间大留白；页头班组用简洁点分/标签行，避免半宽灰盒造成空洞。

### 原型中可对照的汇总形状（非生产依赖）

来自布局原型的整团成本聚合意图（只读呈现）：

```ts
// from prototype ExecutionCostStrip — decision shape only
{
  totalCents: departureAmount + segmentAmount,
  totalCount: departureCount + segmentCount,
  departure: { resourceAmountCents, resourceCount },
  segment: { resourceAmountCents, resourceCount },
  ungeneratedCents,
  ungeneratedCount, // subtitle: `${n} 项待生成` | `已齐`
}
```

---

## Testing Decisions

- **测外部行为，不测实现细节**：以用户可见文案、URL、汇总数字、选中天与表数据是否一致为准；不锁定 CSS class 名或折叠内部 DOM 结构。  
- **主测模块**：发团详情导航（顶栏切换与分组呈现）、执行安排工作区布局（成本条 / 折叠 / 轴 / 当日区组成）、行程段选择与 URL 同步、资源汇总与批量生成入口可见性、发团头班组字段。  
- **Prior art**：现有发团详情导航测试、执行安排 layout / url-sync / create-select 测试、段资源 summary/actions 测试、段资源金额汇总工具测试、发团头时间与班组测试、响应式/motion CSS 测试。成本条优先在执行工作区集成测「给定资源夹具 → 合计与待生成项数」，工具函数单测可复用段汇总口径。  
- **权限**：财务只读夹具下仍见查看/生成应付规则与现网一致（无 departure:write 时隐藏编辑/作废等）。

---

## Out of Scope

- 重新设计概览财务大盘或客源/应收/应付各 Tab 内部信息架构。  
- 新增独立「行程日报」实体或第二种执行工作台。  
- 为执行班组「联系电话」新增发团/供应商 API 字段（本迭代仅展示位）。  
- 段级多班组轮换、供应商档案维护车牌/驾驶员。  
- 将 throwaway 原型组件直接当生产依赖引用。  
- 方案 A/B/C 的生产并存切换。

---

## Further Notes

- 产品已口头确认「D 款还可以」；本 PRD 冻结布局决策，供 `/to-tickets` 拆票。  
- 与「按日执行 / 班组 / 增收」能力 PRD 正交：本 spec **不**重做那些业务能力，只改详情壳与执行区信息架构。  
- 建议拆票顺序（供后续 `/to-tickets`）：① 顶栏导航；② 执行区堆叠 + 成本条 + 发团级折叠；③ 横向日程轴替换纵列表；④ 页头班组文案/层次收尾；⑤ 拆除原型挂载。  
- **Seam 待人类一眼确认**：上表「单一主 seam + 子面落点」是否可接受；若要把「发团级批量生成应付」或「联系电话字段」剔出主票，请在挂 Issue 时注明。
