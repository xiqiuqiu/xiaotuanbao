---
status: accepted
---

# Departure 与 Finance 通过 Finance Facade 交互

Departure 到 Finance 的 seam 由 Finance 拥有：Finance module 内新增 `DepartureFinanceFacade`，作为 Departure 侧消费 Finance Generation、Departure Finance Snapshot、Source Order / Segment Resource finance state 的窄 interface。Facade 常规 public interface 先以 `organizationId + sourceOrderId/resourceId/departureId` 为主，不把 `Prisma.TransactionClient` 暴露给调用方；这是当前单体内的 in-process seam，Finance implementation 短期可以读取 Departure 表，不承诺可独立部署边界。

## Considered Options

- **保留 `DepartureFinanceBridgeService` 作为长期 module**：拒绝。它会让 Departure 继续成为理解 Payment Schedule、Verification、finance-touched 与 settled amount 的地方，只是把调用集中了一点。
- **由 Departure 组装完整 source facts snapshot 传给 Finance**：暂缓。它更接近未来独立服务或异步事件输入，但会让当前 interface 变宽，并迫使 Departure 知道 Finance Generation 需要哪些字段。
- **只 facade 生成动作，不 facade 读模型**：拒绝。否则 `DepartureReadModelService` 仍会直接读取 Payment Schedule / Verification implementation，seam 继续泄漏。

## Consequences

- `DepartureFinanceFacade` 是主要测试 surface；重点覆盖 snapshot、finance-touched、source amount mismatch、金额锁定、已关闭节点与部分/全部核销。
- 迁移顺序先从 `getDepartureFinanceSnapshot(organizationId, departureIds)` 开始，让 `DepartureReadModelService` 停止直接读取 Finance implementation；之后迁 Finance Generation，最后迁 Source Order / Segment Resource 的 finance state 派生。
- **迁移已完成（2026-08）**：Snapshot / Generation / 按实收结算 / Source Order 与资源 finance state 均由 Finance 拥有（Facade + `DepartureFinanceGenerationService` + `DepartureFinanceActualCollectionService`）；`DepartureFinanceBridgeService` 已删除；Finance module 不再 `forwardRef` 依赖 Departure module。
- `DepartureFinanceSnapshot` 只返回 Finance 拥有的原子财务事实：收付款节点的约定金额、已核销金额、节点数量与人工关闭状态，以及未作废流水的收入/支出总额与其中未核销部分；不返回中文 completion tag，也不读取客源单实际应收或行程段资源预计成本。
- Snapshot 是按发团汇总的窄聚合 interface，不向 Departure 暴露 Payment Schedule 明细。应收方向分开提供客源路径与其他应收聚合，使客源收款进度只消费客户补款、游客代收两类来源；应付方向按非作废节点提供确认金额、有效核销、开放未结清与已关闭未结清四个原子聚合，保证 `确认应付 = 已付 + 开放未付 + 已关闭未付`。节点数量、人工关闭数、作废数与账款结束状态亦以聚合值表达。
- Departure read model 负责将 Finance Snapshot 与 Departure 拥有的实际应收、预计成本组合为未收、尚未生成应收、尚未生成应付、其他应付、资源账款差异、未付、预估毛利和确认毛利等跨上下文指标，并生成发团概览展示标签。客源应收须满足 `实际应收 = 已收 + 已生成开放未收 + 已关闭未收 + 尚未生成应收`；未生成资源应付只属于预计成本提示，不进入确认应付、未付或付款进度。成本对账须满足 `确认应付 - 预计成本 = 其他应付 + 资源账款差异 - 尚未生成应付`，组成因素即使净额相抵也不得隐藏。现金净流入则由 Snapshot 中的未作废收入/支出流水总额相减，不复用概览已收/已付口径。
- 发团详情 API 以嵌套 `overviewStats` 承载概览专用口径，包含客源路径已收/未收、尚未生成应收、其他应收提示金额、已关闭未收、尚未生成应付、其他应付、资源账款差异、确认应付、已付/未付、开放未付、已关闭未付、确认毛利、有效收入流水、有效支出流水、现金净流入及未核销收支；既有平铺 `verified*` 和 `openUnsettled*` 字段保持原位与原语义。实际应收、预计成本和预估毛利继续复用既有发团字段，不在 `overviewStats` 重复。
- 收款/付款进度百分比不进入 `overviewStats` API；Web 使用已收、已付与对应分母实时派生。分母为零的「—」、百分比四舍五入和进度条视觉封顶属于展示规则，不由 Finance Snapshot 或 Departure read model 固化。
- Snapshot 与 Departure read model 不使用 `Math.max(..., 0)` 等方式掩盖守恒异常；API 返回原始有符号聚合与结构化 reconciliation anomalies。Web 保留真实负数或超过 100% 的文字结果、标红并解释差额，仅进度条视觉长度封顶。异常不阻止读取概览，但写操作继续由金额、核销与状态不变量约束。
