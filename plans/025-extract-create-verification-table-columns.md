# 025 — 提取核销候选表格列配置到 *-columns.tsx

- **Status**: TODO
- **Commit**: a712d4a
- **Severity**: MEDIUM
- **Category**: Maintainability & architecture
- **Rule**: Beyond the scan（no-giant-component；对齐仓库 `*-columns.tsx` 惯例）
- **Estimated scope**: 2 文件（新建 1、`CreateVerificationDrawer.tsx` 删减），行为保持型移动

## Problem

`CreateVerificationDrawer.tsx` 达 1152 行。虽已抽出 `useCreateVerificationDrawerState`（query/筛选/选择态），但**表格列构建**仍滞留在组件文件，违背仓库既有惯例——finance 域已有 `payment-schedule-table-columns.tsx`、`transaction-table-columns.tsx`、`verification-table-columns.tsx` 等 10 个 `*-columns.tsx`。

两处列构建（无外部副作用、纯函数）：

```104:106:apps/web/src/features/finance/components/CreateVerificationDrawer.tsx
function buildTransactionColumns(
  departureMap: Map<string, { departureNo: string; name: string }>,
): ColumnsType<FinanceTransactionSummary> {
```

```163:166:apps/web/src/features/finance/components/CreateVerificationDrawer.tsx
function buildScheduleColumns(
  departureMap: Map<string, { departureNo: string; name: string }>,
  isReceivable: boolean,
): ColumnsType<PaymentScheduleSummary> {
```

二者依赖同文件顶部的标签工具：`formatTransactionCounterpartyLabel`、`formatScheduleCounterpartyLabel`、`formatDepartureLabel`（其中 `formatDepartureLabel` 还被 `handleSubmit` 的跨团确认文案使用，`:994`）。

**团队代价：** 核销核心入口的任意「列/往来对象展示」调整都要在 1152 行大文件里定位，Review 面大；与其余 finance 列文件割裂。

> 本计划**只做**列构建（及其直接依赖的标签工具）的行为保持型外移，是最小、最低风险的一步。子区块（`VerificationBasicsSection`/selection sections/`VerificationPreview`）拆分、以及跨文件标签函数去重（`formatCounterpartyLabel`/`formatDepartureLabel` 在 5+ 处重复）**不在本计划范围**，另开计划。

## Target

新建 `apps/web/src/features/finance/components/create-verification-table-columns.tsx`，迁入两个 `build*Columns` 及其依赖的三个标签工具，导出被外部使用者需要的成员：

    // create-verification-table-columns.tsx（新文件，内容整体从 drawer 平移）
    import { Space, Tag, Typography } from 'antd'
    import type { ColumnsType } from 'antd/es/table'
    import type { FinanceTransactionSummary, PaymentScheduleSummary } from '@xiaotuanbao/shared'
    import {
      COUNTERPARTY_TYPE_LABELS,
      PAYMENT_CHANNEL_LABELS,
      TRANSACTION_DIRECTION_COLORS,
      TRANSACTION_DIRECTION_LABELS,
      catalogLabel,
      formatCents,
    } from '../catalog'

    export function formatDepartureLabel(/* 原实现平移 */) { ... }
    function formatTransactionCounterpartyLabel(/* 平移 */) { ... }
    function formatScheduleCounterpartyLabel(/* 平移 */) { ... }

    export function buildTransactionColumns(
      departureMap: Map<string, { departureNo: string; name: string }>,
    ): ColumnsType<FinanceTransactionSummary> { /* 原实现平移，:107-160 */ }

    export function buildScheduleColumns(
      departureMap: Map<string, { departureNo: string; name: string }>,
      isReceivable: boolean,
    ): ColumnsType<PaymentScheduleSummary> { /* 原实现平移，:167-213 */ }

`CreateVerificationDrawer.tsx` 删除这两个函数与三个标签工具的本地定义，改为 import：

    // CreateVerificationDrawer.tsx
    import {
      buildTransactionColumns,
      buildScheduleColumns,
      formatDepartureLabel,
    } from './create-verification-table-columns'

新文件不 import drawer，避免循环依赖。

## Repo conventions to follow

- 完全对齐既有 `*-columns.tsx`（如 `transaction-table-columns.tsx`、plan 011 的 `execution-resource-columns.tsx`）：纯 `build*Columns` 导出、从 `../catalog` 取标签与 `formatCents`。
- 保持列定义逐字不变（宽度、`align`、`render`、`isReceivable` 分支）——纯平移。
- 迁移后清理 drawer 中因移除而不再使用的 import（如仅列构建用到的 `Tag`、`ColumnsType`、`catalog` 项、`FinanceTransactionSummary` 类型等）；`typecheck` 会暴露遗漏。

## Steps

1. 新建 `create-verification-table-columns.tsx`，把 `:104-213` 的 `buildTransactionColumns`/`buildScheduleColumns` 与其依赖的 `formatDepartureLabel`/`formatTransactionCounterpartyLabel`/`formatScheduleCounterpartyLabel` 平移过去；`export` 两个 builder 与 `formatDepartureLabel`。
2. 在 `CreateVerificationDrawer.tsx` 删除上述本地定义，新增对应 import。
3. 确认 drawer 内 `buildTransactionColumns`/`buildScheduleColumns` 的调用（`:971-982` 的两个 `useMemo`）与 `handleSubmit` 的 `formatDepartureLabel`（`:994`）改用 import 版本。
4. 清理 drawer 中不再使用的 import，跑 `typecheck` 直到干净。
5. 复查 diff：新文件为纯平移、drawer 仅剩删减与 import 变化，无逻辑改动。

## Boundaries

- 不改列的任何视觉/渲染/宽度/排序。
- 不改 `useCreateVerificationDrawerState`、selection sections、preview、提交逻辑。
- 不做跨文件标签函数去重（另计划）。
- 不新增依赖。

## Verification

- **Mechanical**:
  - `cd apps/web && pnpm test -- CreateVerification` 全绿；`pnpm typecheck` 干净（确认无未用 import）。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**：打开核销抽屉（应收/应付各一次），两张候选表列头、金额、往来对象/发团、到期日（仅应收）显示与改动前一致；跨团核销确认弹窗文案（用 `formatDepartureLabel`）正常。
- **Done when**：列渲染与文案零差异、`CreateVerificationDrawer.tsx` 行数下降、测试/类型通过、分数不降。
