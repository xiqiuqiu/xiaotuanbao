---
status: accepted
---

# 核销列表深链按业务编号走顶部筛选

从流水或收付款节点「查看核销」进入核销列表时，可分享状态与列表过滤一律使用业务编号（`transactionNo` / `scheduleNo`），经页面顶部筛选区灌入并查询；不使用实体 ID，不另开「当前筛选」临时条。用户可见 URL 只带一侧编号（二者互斥），不暴露 match mode；有 URL 编号时前端以 `*Match=exact`（大小写不敏感）调列表 API，手改任一编号即清掉 URL 并退回默认 `contains`。跳入时清空日期与其余筛选项；重置恢复默认日期并清空 URL。列表 API 删除 `transactionId` / `paymentScheduleId` 过滤；旧 ID 深链不再兼容。创建核销提交与单条详情仍可用实体 ID。

## Considered Options

- **实体 ID 深链 + 独立「当前筛选」Tag（旧实现）**：拒绝。与顶部「流水号 / 节点编号」双轨，重置清不掉深链，且把开发态 ID 暴露给用户可见 URL。
- **跳转解析成编号后只灌表单、URL 落地即消费**：拒绝。丢掉可分享与刷新还原。
- **URL 与全部筛选项双向同步**：拒绝。本决策只修深链与顶部筛选对齐；全量筛选项 URL 化另议。
- **编号筛选始终模糊 / 始终精确**：拒绝。深链需要实体锁定感（exact）；手输需要搜索（contains）。以「URL 是否仍带编号」区分来源，不在 URL 暴露 mode。
- **列表 API 保留 ID 过滤给内部/e2e**：拒绝。会诱使产品深链再次走 ID；测试改为按编号断言。
- **旧 `transactionId` / `paymentScheduleId` 链接一次性兼容转编号**：拒绝。第一版可接受书签失效，避免双读与路由层隐式转换。

## Consequences

- 路由 search 与跳转方（流水列表、应收/应付列表）改为传业务编号；`VerificationsWorkspace` 去掉 `initialTransactionId` / `initialPaymentScheduleId` 临时条。
- 列表查询 DTO 增加 `transactionNoMatch` / `scheduleNoMatch`（`exact` | `contains`，默认 `contains`）；精确比较大小写不敏感，与现网 `contains` 一致。
- 领域词汇见根目录 `CONTEXT.md`（Verification List Deep Link、Verify From Transaction、Payment Schedule List Actions）。
