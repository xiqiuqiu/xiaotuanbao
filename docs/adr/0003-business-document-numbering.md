---
status: accepted
---

# 业务编号规则：组织前缀、序列表与财务编号族

各 Organization 的核心业务对象（发团、收付款节点、流水、核销）需有系统唯一、业务可读的编号。编号在生成后不可变更；Organization 创建时必填 **组织业务前缀**（2–4 位大写英文字母，全系统唯一），作为所有编号的组织标识。未设置前缀的 Organization 不得创建发团或财务单据。前缀仅在 Organization 创建时设定，组织管理页只读展示。

编号统一由后端在创建时自动分配，不提供手动录入或事后修改。发团编号按 **创建时刻**（Asia/Shanghai）的年月递增；收付款节点与核销按创建年月递增；流水按创建日期递增。发团号不嵌入财务编号——财务对象通过 `departureId` 关联发团，UI 并列展示。

## 编号格式

| 业务对象 | 格式 | 示例 |
|---|---|---|
| 发团（Departure） | `{prefix}{yyyyMM}{4位流水}` | `XTB2026070001` |
| 应收收付款节点 | `AR{prefix}{yyyyMM}{6位流水}` | `ARXTB202607000001` |
| 应付收付款节点 | `AP{prefix}{yyyyMM}{6位流水}` | `APXTB202607000001` |
| 收支流水 | `TX{prefix}{yyyyMMdd}{6位流水}` | `TXXTB20260708000001` |
| 核销 | `CL{prefix}{yyyyMM}{6位流水}` | `CLXTB202607000001` |

业务编号不作为数据库主键（主键仍用 cuid）；编号字段加 `(organization_id, *_no)` 唯一索引。

## 序列表

并发下通过 `document_sequences(organization_id, document_type, period_key, last_sequence)` 在事务内递增分配流水号，替代 `count()` 或 `findFirst + orderBy` 推算。`period_key` 为 `yyyyMM`（发团、AR、AP、CL）或 `yyyyMMdd`（TX）；`document_type` 为 `departure | ar | ap | tx | cl`。

## 曾考虑的替代方案

- **发团编号锚定出团日期年月** — 6 月底为 8 月团建草稿会得到 `XTB202608xxxx`，与「编号表示建档时间、生成后不变」不一致；拒绝。
- **财务编号嵌入发团号** — 流水可无 `departureId`（组织级资金进出），嵌入会破坏规则一致性且编号过长；拒绝，改由外键 + UI 展示团号。
- **应收/应付/核销按日递增** — 可行，但编号更长且偏离按月对账习惯；拒绝，仅流水按日。
- **流水前缀 TR、核销前缀 VR** — 与 AR/AP 财务编号族不统一；改为 `TX` / `CL`。
- **唯一索引 + 重试** — 实现轻量但高并发下体验差；拒绝，采用序列表。
- **迁移旧演示数据** — 第一版未上线，旧 `DT*` / 无组织前缀格式直接重置，不共存。

## 后果

- Organization 创建流程（含 seed、测试 helper、未来 Platform Admin 开户）必须写入 `businessPrefix`。
- 复制发团视为新建，团号按复制当天（上海时区）年月分配，不复用源团号。
- 需替换现有 `generate-*-no` 工具函数及 finance/departure service 中的分配逻辑；E2E 断言与演示 seed 一并更新。
- 详细字段校验与前端交互见 `ider/业务编号规则设计说明.md`；领域词汇见根目录 `CONTEXT.md`（Organization Business Prefix）。
