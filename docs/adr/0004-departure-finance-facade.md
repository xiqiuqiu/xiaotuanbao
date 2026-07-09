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
- `DepartureFinanceSnapshot` 返回结构化金额、节点数量与 closed 状态，不返回中文 completion tag；Departure read model 继续负责生成发团概览展示标签。
