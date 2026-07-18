# 020 — 收付款列表节点关键字筛选加防抖

- **Status**: TODO
- **Commit**: a712d4a
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 1 文件（`usePaymentScheduleWorkspace.ts`），约 3 处替换

## Problem

收付款工作区的「搜索节点编号/标题」`keyword` 属客户端筛选，但**未防抖**：它进入 `hasClientFilters`，第一个字符即把 `useExpandedFetch` 从 false 翻为 true，将服务端 `pageSize` 从 10 拉到 100 触发**网络 refetch**：

```114:135:apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts
  const hasClientFilters = Boolean(
    keyword.trim() ||
    (statusFilter && statusFilter !== 'voided') ||
    dueDateRange,
  )
  ...
  const useExpandedFetch =
    hasClientFilters || locatingFinanceRow || locateExpandedLatchRef.current
  const fetchPageSize = useExpandedFetch ? 100 : pageSize
```

`keyword` 还直接驱动客户端过滤：

```286:295:apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts
  const filteredItems = useMemo(
    () =>
      applyPaymentScheduleClientFilters(
        schedulesResult?.items ?? [],
        keyword,
        statusFilter,
        dueDateRange,
      ),
    [schedulesResult?.items, keyword, statusFilter, dueDateRange],
  )
```

同文件的 `counterpartyKeyword` 已用 `useDebouncedValue`（`:113`），`keyword` 是唯一未防抖的文本筛选。逐键都会重跑客户端过滤 + 触发/维持扩展抓取。

**用户影响：** 全局/发团/Partner 收付款均为重表格页；输入节点编号/标题的第一个字符即切换抓取策略（10→100 行），后续每键继续重算过滤与表格 diff。

## Target

新增 `keyword` 的防抖派生值，并在**筛选/抓取判定/客户端过滤/定位**处改用防抖值；输入框仍用原始 `keyword`（受控回显不变，输入框在 `PaymentScheduleFilters` 中读 `keyword`）。

    // target — apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts
    const trimmedCounterpartyKeyword = useDebouncedValue(counterpartyKeyword.trim())
    const debouncedKeyword = useDebouncedValue(keyword.trim())   // 新增

    const hasClientFilters = Boolean(
      debouncedKeyword ||                                        // was: keyword.trim()
      (statusFilter && statusFilter !== 'voided') ||
      dueDateRange,
    )

    // filteredItems useMemo
    const filteredItems = useMemo(
      () =>
        applyPaymentScheduleClientFilters(
          schedulesResult?.items ?? [],
          debouncedKeyword,                                      // was: keyword
          statusFilter,
          dueDateRange,
        ),
      [schedulesResult?.items, debouncedKeyword, statusFilter, dueDateRange],
    )

同时把传入 `usePaymentScheduleLocate({ ... keyword, ... })`（`:244`）的 `keyword` 改为 `debouncedKeyword`，保证定位用的客户端过滤与列表一致。

## Repo conventions to follow

- 直接复用现有 `useDebouncedValue`（同文件已 import 并用于 counterparty）。默认防抖时长与 counterparty 一致（不额外传参，除非现有调用有传）。
- 输入框仍读原始 `keyword`（`PaymentScheduleFilters` 的 `value={keyword}`），保证输入无延迟回显。
- 保持 `setPage(1)` 等分页重置逻辑：确认关键字变化仍会重置到第 1 页（若原逻辑依赖 `keyword`，改为依赖 `debouncedKeyword` 的 effect 或在 onKeywordChange 里 setPage(1)）。

## Steps

1. 在 `usePaymentScheduleWorkspace.ts:113` 附近新增 `const debouncedKeyword = useDebouncedValue(keyword.trim())`。
2. `:115` 把 `keyword.trim()` 改为 `debouncedKeyword`。
3. `:290` `filteredItems` 的 `applyPaymentScheduleClientFilters(..., keyword, ...)` 改为 `debouncedKeyword`，并把 useMemo 依赖 `keyword` 改为 `debouncedKeyword`。
4. `:244` 传给 `usePaymentScheduleLocate` 的 `keyword` 改为 `debouncedKeyword`。
5. 全文件检索其余 `keyword`（非 `counterpartyKeyword`、非输入回显）用于筛选/抓取判定处，一并替换为 `debouncedKeyword`；`setKeyword` setter 与传给 Filters 的 `keyword` 保持原样。
6. 复查 diff，确认输入回显、分页重置、定位过滤一致。

## Boundaries

- 不改 `useDebouncedValue` 实现，不改防抖时长约定。
- 不改服务端查询的 counterparty debounce 与 queryKey。
- 不改 `PaymentScheduleFilters` 的输入受控值。
- 不新增依赖。

## Verification

- **Mechanical**:
  - 现有 `PaymentScheduleWorkspace.*.test.tsx`（含防抖/定位/分页）通过；`cd apps/web && pnpm test -- PaymentScheduleWorkspace` 与 `pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**（性能，需 Network 面板 + 快速连打字）：在收付款列表连续快速输入节点编号，Network **不应**每键触发 10→100 的 refetch，仅在停顿（防抖窗口）后触发一次；输入框回显仍逐键即时；过滤结果、分页、定位高亮均正确。用 Profiler 确认逐键不再让整表重算。
- **Done when**：逐键不再抖动抓取/重算，回显与结果正确，测试/类型通过，分数不降。
