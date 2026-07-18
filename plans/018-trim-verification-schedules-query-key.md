# 018 — 移除核销候选节点 queryKey 中冗余的 selectedTransactionId

- **Status**: DONE
- **Commit**: a712d4a
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan（unstable/over-scoped queryKey）
- **Estimated scope**: 1 文件（`useCreateVerificationDrawerState.ts`），去掉 1 行 key 项

## Problem

核销抽屉的候选收付款节点查询把 `selectedTransactionId` 放进 `queryKey`，但 `queryFn` **完全不使用**它（只用 `effectiveDepartureId` + 固定 `pageSize:100`）：

```106:119:apps/web/src/features/finance/hooks/useCreateVerificationDrawerState.ts
  const {
    data: schedulesResult,
    isLoading: schedulesLoading,
    isError: schedulesError,
  } = useQuery({
    queryKey: [
      isReceivable ? 'finance-receivables' : 'finance-payables',
      'create-verification',
      effectiveDepartureId,
      selectedTransactionId,
    ],
    queryFn: () =>
      (isReceivable ? listReceivables : listPayables)({
        departureId: effectiveDepartureId,
        pageSize: 100,
      }),
    enabled: open && Boolean(direction) && Boolean(selectedTransactionId),
  })
```

按 `selectedTransaction` 的候选过滤是**客户端**做的（`filterCandidateSchedules`，`:150-169`）。因此每选/换一条流水都会因 key 变化重新拉取最多 100 条收付款节点，纯属浪费。

**用户影响：** 核销抽屉是财务热路径；反复点选流水时重复大 payload 网络请求 + 表格重渲染。

## Target

    // target — apps/web/src/features/finance/hooks/useCreateVerificationDrawerState.ts:107
    queryKey: [
      isReceivable ? 'finance-receivables' : 'finance-payables',
      'create-verification',
      effectiveDepartureId,
    ],

`enabled` 仍保留 `Boolean(selectedTransactionId)`（首选流水后才拉列表），语义不变；只是选不同流水时命中同一缓存、不再 refetch。

## Repo conventions to follow

- 与同文件 transactions 查询一致：其 key 为 `['finance-transactions', 'create-verification', effectiveDepartureId]`（`:91`），不含选择态。本次改动即向该模式对齐。
- 不改 `enabled` 判定。

## Steps

1. 在 `useCreateVerificationDrawerState.ts:107-112` 的 `queryKey` 数组中删除 `selectedTransactionId` 这一项。
2. 确认 `selectedTransactionId` 仍被其它逻辑使用（`selectedTransaction` 派生、`enabled`），不要误删变量声明。
3. 复查 diff，仅动 queryKey。

## Boundaries

- 不改 `queryFn`、`enabled`、`pageSize`。
- 不改客户端过滤 `filterCandidateSchedules` 及其依赖。
- 不新增依赖。

## Verification

- **Mechanical**:
  - `cd apps/web && pnpm test -- CreateVerification` 现有测试通过；`pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**（性能，需 Network 面板）：打开核销抽屉、选方向 → 首次选流水触发 1 次收付款列表请求；此后在**同一发团**下切换不同流水，Network 里**不应**再出现 `create-verification` 收付款请求；候选节点仍随所选流水正确过滤。
- **Done when**：切换流水不再重复拉取，候选过滤正确，测试/类型通过，分数不降。
