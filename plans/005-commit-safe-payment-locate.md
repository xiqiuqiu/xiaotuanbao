# 005 — 保持账款定位渲染纯净

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: react-doctor/no-ref-current-in-render
- **Estimated scope**: 2 files, about 25 lines

## Problem

账款定位为了在一次性高亮清除后继续使用 100 条扩展请求，在 render 阶段写入 ref。React 并发渲染可能放弃本次 render，但 ref 写入不会回滚，导致未提交的定位状态永久影响后续请求。

    // apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts:69 — current
    // Latch expanded fetch for the rest of this mount once locate runs. Clearing the
    // one-shot highlight must not shrink pageSize (100→10) and refetch the same list.
    const locateExpandedLatchRef = useRef(false)
    if (locatingFinanceRow) {
      locateExpandedLatchRef.current = true
    }
    const useExpandedFetch =
      hasClientFilters || locatingFinanceRow || locateExpandedLatchRef.current

`resetFilters` 在用户事件中清空 latch 是合法且需要保留的：

    // apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts:235 — current
    locateExpandedLatchRef.current = false

## Target

React Doctor 对 `no-ref-current-in-render` 的 canonical 修复原则是：render 保持纯函数；将 ref 写入移到事件处理器或 effect。此处定位由 props 触发，不存在对应用户事件，因此将“提交后锁存”移入 effect；当前 render 仍由 `locatingFinanceRow` 立即选择 100 条，effect 只负责为后续 render 保存已提交状态。

    // apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts — target import
    import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

    // target
    // Latch expanded fetch for the rest of this mount once a locate render commits.
    // Clearing the one-shot highlight must not shrink pageSize (100→10) and refetch.
    const locateExpandedLatchRef = useRef(false)

    useEffect(() => {
      if (locatingFinanceRow) {
        locateExpandedLatchRef.current = true
      }
    }, [locatingFinanceRow])

    const useExpandedFetch =
      hasClientFilters || locatingFinanceRow || locateExpandedLatchRef.current
    const fetchPageSize = useExpandedFetch ? 100 : pageSize

以下现有事件写入必须保持原样：

    // resetFilters target: unchanged
    locateExpandedLatchRef.current = false

## Repo conventions to follow

- effect import 与 hook 排序沿用该文件现有 React named imports。
- 回归测试扩展 `apps/web/src/features/finance/components/PaymentScheduleWorkspace.locate.test.tsx:268` 已有的 “view-payable fetch count” seam；不要新建重复测试 harness。
- 保留 `apps/web/src/features/finance/hooks/usePaymentScheduleLocate.ts` 对高亮消费时机的所有权，不把 latch 逻辑移进去。

## Steps

1. 在 `usePaymentScheduleWorkspace.ts:1` 加入 `useEffect` import。
2. 在 `usePaymentScheduleWorkspace.ts:69-76` 删除 render 内的条件 ref 写入，按 Target 加入依赖仅为 `[locatingFinanceRow]` 的 effect。
3. 保留 `locatingFinanceRow` 在 `useExpandedFetch` 中的同步分支，确保首次定位 render 立即请求 `pageSize: 100`，不等待 effect。
4. 保留 `resetFilters` 中的事件写入，不改 queryKey、分页或高亮消费逻辑。
5. 在 `PaymentScheduleWorkspace.locate.test.tsx:268` 的现有测试中补强断言：首次调用为 `pageSize: 100`；计时器清除 highlight 并触发父组件 rerender 后调用次数仍为 1；测试卸载重挂后无 highlight 时恢复默认 `pageSize: 10`。
6. 检查 diff 仅包含上述 hook 与聚焦测试。

## Boundaries

- Do NOT 用 state 替换 latch；那会引入额外 render/queryKey 跳变。
- Do NOT 移除 latch 或改变“高亮清除后不二次请求”的既有产品行为。
- Do NOT 修改 `usePaymentScheduleLocate`、筛选、分页和查询服务。
- Do NOT 清除 `resetFilters` 的事件 ref 写入；事件写入符合 canonical 原则。
- Do NOT 添加依赖。
- STOP if the code has drifted from commit `b77379c`; report the drift instead of improvising.

## Verification

- **Mechanical**:
  - `npx react-doctor@latest --scope changed` 清除 `usePaymentScheduleWorkspace.ts` 的 `no-ref-current-in-render`，且分数不下降。
  - `pnpm --filter web typecheck`
  - `pnpm --filter web test -- PaymentScheduleWorkspace.locate.test.tsx`
- **Behavior check**: 从发团执行安排点击“查看应付”；确认首次只请求一次 `pageSize=100`，定位闪烁结束并清除 URL 高亮后没有第二次列表请求，重置筛选后普通分页仍回到每页 10 条。
- **Done when**: render 不再写 ref，定位首次请求和 latch 行为不变，聚焦测试、typecheck 与 React Doctor 均通过。
