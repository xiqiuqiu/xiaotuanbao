# 030 — 核销抽屉与流水并行预取收付节点

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 1 文件（`useCreateVerificationDrawerState.ts`）+ 必要时测试

## Problem

核销抽屉在选出流水后才启用 schedules 查询，但请求参数/queryKey **不含** `selectedTransactionId`——只按 direction + departure 拉全量再客户端筛选。这把本可与 transactions 并行的请求串成瀑布。

```100:118:apps/web/src/features/finance/hooks/useCreateVerificationDrawerState.ts
  const isReceivable = direction === 'receivable'

  const {
    data: schedulesResult,
    isLoading: schedulesLoading,
    isError: schedulesError,
  } = useQuery({
    queryKey: [
      isReceivable ? 'finance-receivables' : 'finance-payables',
      'create-verification',
      effectiveDepartureId,
    ],
    queryFn: () =>
      (isReceivable ? listReceivables : listPayables)({
        departureId: effectiveDepartureId,
        pageSize: 100,
      }),
    enabled: open && Boolean(direction) && Boolean(selectedTransactionId),
  })
```

transactions 查询已在 `open && Boolean(direction)` 时启用（同文件约 :90-98）。

## Target

让 schedules 与 transactions 同条件启用：

```tsx
// useCreateVerificationDrawerState.ts — target
enabled: open && Boolean(direction) && Boolean(effectiveDepartureId),
```

（若全局核销无 departure 时 `effectiveDepartureId` 可空，保持与 transactions 查询相同的 `enabled` 表达式，避免一边发一边不发。）

`filterCandidateSchedules` 已按 `selectedTransaction` 客户端过滤——预取不会改变候选语义，只是提前有数据。

可选：为 queryFn 传 `signal`（若 `listReceivables`/`listPayables` 已支持，对齐 finance 其它列表）。

## Repo conventions to follow

- queryKey 已在计划 018 精简过，**不要**把 `selectedTransactionId` 加回 key（那会变成每选一行打一次网）。
- 保持 `filterCandidateSchedules` 行为；参考 `CreateVerificationDrawer.cross-departure.test.tsx`。

## Steps

1. 修改 schedules `enabled`，与 transactions 对齐。
2. 跑核销相关 vitest；用 Network 确认打开抽屉并选好 direction 后，transactions 与 schedules 接近并行（不必等选中流水）。

## Boundaries

- Do NOT 改变候选过滤规则或默认选中逻辑（计划 021 等）。
- Do NOT 为预取扩大 `pageSize` 或去掉 `departureId` 约束。

## Verification

- **Mechanical**: typecheck；核销抽屉测试通过。
- **Behavior / Network**: 打开「新增核销」→ 选方向后，在未点选流水前即可看到 schedules 请求发出；选流水后候选列表立即可用（或仅本地 filter），无第二段等待瀑布。
- **Done when**: Network 不再呈现「先等流水列表成功 → 再打节点列表」的强制串行（在 direction/departure 已定时）。
