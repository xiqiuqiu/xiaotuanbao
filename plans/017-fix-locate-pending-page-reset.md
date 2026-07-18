# 017 — 定位高亮结束后清空 pendingPage 而非强制第 1 页

- **Status**: DONE
- **Commit**: a712d4a
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan
- **Estimated scope**: 1 文件（`usePaymentScheduleLocate.ts`），1 行

## Problem

一次性行定位（「查看应收/应付」深链）在算出目标页并跳转后，flash（480ms）结束时把 `pendingPage` 置为 `1`，而不是清空（`null`）：

    // apps/web/src/features/finance/hooks/usePaymentScheduleLocate.ts:106 — current
    useEffect(() => {
      if (!locateFlashActive) {
        return
      }
      const clearFlashTimer = window.setTimeout(() => {
        setLocateFlashActive(false)
        setPendingPage(1)          // ← 应为 null
        onHighlightConsumed?.()
      }, LOCATE_FLASH_MS)
      ...

下游 workspace 在 render 阶段消费 `pendingPage`：

```251:253:apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts
  if (pendingPage != null && page !== pendingPage) {
    setPage(pendingPage)
  }
```

`pendingPage` 全程无处被重置为 `null`（hook 内只有 `:100` 设目标页、`:113` 设 1）。因此定位发生后：

1. 目标行在第 2 页及以后时，高亮约半秒后用户被**静默弹回第 1 页**、高亮消失；
2. 更严重：`pendingPage` 恒为 `1`，本次挂载内用户点第 2 页会立刻被 `setPage(1)` 拉回——**翻页被锁死在第 1 页**。

现有 locate 测试数据集都在第 1 页（`pageSize:10`、≤3 行），未覆盖此路径，故回归漏检。

**用户影响：** execution/客源单 →「查看应收/应付」是高频跳转（见 plan 005）。列表较长时必现弹回 + 翻页锁死。

## Target

    // target — apps/web/src/features/finance/hooks/usePaymentScheduleLocate.ts:113
    const clearFlashTimer = window.setTimeout(() => {
      setLocateFlashActive(false)
      setPendingPage(null)
      onHighlightConsumed?.()
    }, LOCATE_FLASH_MS)

`pendingPage=null` 后 `pendingPage != null` 为 false，workspace 不再强制 `setPage`，用户停留在定位到的目标页并可自由翻页。

## Repo conventions to follow

- `pendingPage` 类型已是 `number | null`（`useState<number | null>(null)`，`:74`），直接传 `null` 即可，无需改类型。
- 不动 render 阶段的定位派生逻辑（`:76-104`）。

## Steps

1. 在 `usePaymentScheduleLocate.ts:113` 把 `setPendingPage(1)` 改为 `setPendingPage(null)`。
2. 复查 diff，仅此一行。

## Boundaries

- 不改 workspace 的 `if (pendingPage != null ...)` 消费逻辑。
- 不改 flash 时长、`onHighlightConsumed` 语义、`locateExpandedLatchRef` latch。
- 不新增依赖。

## Verification

- **Mechanical**:
  - 新增/补充聚焦测试（建议）：在 `PaymentScheduleWorkspace.locate.test.tsx` 构造 >10 条、匹配行落在第 2 页的数据，`advanceTimersByTimeAsync(500)` 后断言表格仍在第 2 页、且点击第 2 页不被弹回。
  - `cd apps/web && pnpm test -- PaymentScheduleWorkspace.locate` 通过；`pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**：发团详情 → 客源单/执行资源点「查看应收/应付」，目标行落在第 2 页时：高亮结束后应**停留在第 2 页**并保留视图；随后手动点第 3 页应正常切换，不被拉回第 1 页。
- **Done when**：弹回与翻页锁死均消失，测试/类型通过，分数不降。
