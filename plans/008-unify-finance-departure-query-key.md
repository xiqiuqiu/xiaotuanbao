# 008 — 统一财务发团选项缓存键

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: custom/duplicate-query-cache-key
- **Estimated scope**: 5 files, about 55 lines including tests

## Problem

同一个 `listFinanceDepartureOptions` endpoint 被三个消费者用三个 query key 缓存，页面切换会重复请求且无法共享结果。

    // apps/web/src/features/finance/components/PaymentScheduleFilters.tsx:44 — current
    const { data: departuresResult } = useQuery({
      queryKey: ['departures', 'finance-filter'],
      queryFn: listFinanceDepartureOptions,
      enabled: showDepartureFilter,
    })

    // apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts:133 — current
    const { data: departuresResult } = useQuery({
      queryKey: ['departures', 'finance-schedule-map'],
      queryFn: listFinanceDepartureOptions,
      enabled: !isDepartureScope,
    })

`TransactionFilters.tsx:53` 还使用 `['departures', 'transaction-filter']`。三者返回值、权限和请求参数完全相同。

## Target

建立单一导出常量并让三个消费者引用同一个数组对象/值：

    // apps/web/src/features/finance/queries/finance-query-keys.ts — target
    export const FINANCE_DEPARTURE_OPTIONS_QUERY_KEY = [
      'finance',
      'departure-options',
    ] as const

    // target in all three consumers
    const { data: departuresResult } = useQuery({
      queryKey: FINANCE_DEPARTURE_OPTIONS_QUERY_KEY,
      queryFn: listFinanceDepartureOptions,
      enabled: showDepartureFilter, // workspace 保留自己的 !isDepartureScope
    })

不要把 `['departure', lockedDepartureId, 'finance-schedule-map']` 并入此 key；它调用的是 `getDeparture`，数据形状不同。

## Repo conventions to follow

- finance 领域共享常量放在 `apps/web/src/features/finance/queries/`，不放进 service 层；service 只负责 HTTP。
- 保留各消费者自己的 `enabled`，避免隐藏筛选器时无条件抓取。
- 参考 `apps/web/src/features/departure/utils/invalidate-departure-detail-queries.test.ts` 对 query key/invalidation 的小型单元测试风格。

## Steps

1. 新建 `finance-query-keys.ts`，导出 Target 中的 readonly tuple。
2. 修改 `TransactionFilters.tsx`、`PaymentScheduleFilters.tsx`、`usePaymentScheduleWorkspace.ts` 的 imports 和 queryKey；不改 queryFn、enabled 或 option mapping。
3. 新建 `finance-query-keys.test.ts`：断言常量精确等于 `['finance', 'departure-options']`；使用同一个 QueryClient 连续 `fetchQuery` 两次并断言 mock queryFn 仅执行一次（设置足够的 `staleTime`，隔离“立即 stale”干扰）。
4. `rg "transaction-filter|finance-filter|finance-schedule-map" apps/web/src/features/finance`，只允许 locked departure detail 的 `finance-schedule-map` 残留。

## Boundaries

- 不合并 `getDeparture` 的详情缓存键，不改变 staleTime/gcTime/refetch 规则。
- 不移动或改写 `listFinanceDepartureOptions`，不引入 query key factory 框架。
- 不顺手统一无关 employees/partners query key。
- 若代码偏离 commit `b77379c`，停止并报告。

## Verification

- **Mechanical**:
  - `pnpm --filter @xiaotuanbao/web test -- finance-query-keys`
  - `pnpm --filter @xiaotuanbao/web typecheck && pnpm --filter @xiaotuanbao/web lint`
  - `npx react-doctor@latest --scope changed` 清除重复缓存键诊断且分数不下降。
- **Behavior check**: 清空 Query cache 后依次打开流水、应收、应付页面；Network 中 `/finance/departure-options` 只出现首次请求，三个发团 Select 内容一致。Profiler/Highlight updates 中，切页不应因第二份选项请求再刷新筛选器。
- **Done when**: 同 endpoint 只有一个共享 query key，详情 key 未误合并，测试与人工检查通过。
