# 003 — 合并财务搜索请求并取消过期查询

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: HIGH
- **Category**: Performance
- **Rule**: custom/network-request-per-keystroke
- **Estimated scope**: 9 files, about 170 lines including focused tests

## Problem

财务筛选器把输入框的每次 `onChange` 直接写入 TanStack Query 的 key。用户输入“上海”会依次请求“上”“上海”；当前 `queryFn` 也没有消费 TanStack Query 提供的 `AbortSignal`，旧请求即使已经过期仍会占用浏览器和 API 资源。

    // apps/web/src/features/finance/components/TransactionFilters.tsx:105 — current
    <Input.Search
      allowClear
      placeholder="往来对象"
      style={{ width: 160 }}
      value={partnerKeyword}
      onChange={(event) => onPartnerKeywordChange(event.target.value)}
      onSearch={(value) => onPartnerKeywordChange(value.trim())}
    />

同型输入还包括 `TransactionFilters.tsx:121`、`VerificationFilters.tsx:92,100,109` 与 `PaymentScheduleFilters.tsx:84`。其中付款节点的 `keyword` 是纯客户端筛选，不要人为延迟；只有 `counterpartyKeyword` 进入服务端查询。

    // apps/web/src/features/finance/components/TransactionsWorkspace.tsx:58 — current
    queryKey: [
      listQueryKey,
      lockedDepartureId,
      dateRange,
      direction,
      partnerKeyword,
      writeoffStatus,
      transactionNo,
      effectiveDepartureId,
      statusFilter,
      page,
      pageSize,
    ],
    queryFn: () => listTransactions({ /* ... */ }),

    // apps/web/src/services/finance.service.ts:177 — current
    export async function listTransactions(
      params: ListFinanceTransactionsParams,
    ): Promise<FinanceTransactionListResult> {
      return request.get<FinanceTransactionListResult>('/finance/transactions', { params })
    }

## Target

保持输入值逐字符即时更新，仅对进入 query key/params 的服务端搜索值使用 300ms trailing debounce；按 Enter 或点搜索图标仍只需等待同一 300ms 窗口，不另建第二套提交状态。新建共享 hook：

    // apps/web/src/hooks/useDebouncedValue.ts — target
    import { useEffect, useState } from 'react'

    export function useDebouncedValue<T>(value: T, delayMs = 300): T {
      const [debouncedValue, setDebouncedValue] = useState(value)

      useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedValue(value), delayMs)
        return () => window.clearTimeout(timer)
      }, [delayMs, value])

      return debouncedValue
    }

在三个工作区中，query key 与请求参数只使用去空格后的 debounced 值；表单仍使用现有即时 state：

    // apps/web/src/features/finance/components/TransactionsWorkspace.tsx — target excerpt
    const debouncedPartnerKeyword = useDebouncedValue(partnerKeyword.trim())
    const debouncedTransactionNo = useDebouncedValue(transactionNo.trim())

    const { data: transactionsResult, isLoading } = useQuery({
      queryKey: [
        listQueryKey,
        lockedDepartureId,
        dateRange,
        direction,
        debouncedPartnerKeyword,
        writeoffStatus,
        debouncedTransactionNo,
        effectiveDepartureId,
        statusFilter,
        page,
        pageSize,
      ],
      queryFn: ({ signal }) =>
        listTransactions(
          {
            dateStart: dateRange?.[0],
            dateEnd: dateRange?.[1],
            direction,
            partnerKeyword: debouncedPartnerKeyword || undefined,
            writeoffStatus,
            transactionNo: debouncedTransactionNo || undefined,
            departureId: effectiveDepartureId,
            status: statusFilter,
            page,
            pageSize,
          },
          signal,
        ),
    })

`VerificationsWorkspace` 对 `transactionNo`、`scheduleNo`、`departureKeyword` 使用同一 hook，并让 `listParams` 依赖 debounced 值。`usePaymentScheduleWorkspace` 仅对 `counterpartyKeyword.trim()` 使用它；本地 `keyword` 不 debounce。

所有被这些三个工作区调用的列表 service 接收可选 signal，并原样传给 Axios：

    // apps/web/src/services/finance.service.ts — target pattern
    export async function listTransactions(
      params: ListFinanceTransactionsParams,
      signal?: AbortSignal,
    ): Promise<FinanceTransactionListResult> {
      return request.get<FinanceTransactionListResult>('/finance/transactions', {
        params,
        signal,
      })
    }

同样修改 `listVerifications`、`listDepartureVerifications`、`listReceivables`、`listPayables`、`listDepartureReceivables`、`listDeparturePayables`。对应 queryFn 必须写成 `({ signal }) => ...` 并传递 signal。

## Repo conventions to follow

- `apps/web/src/features/finance/hooks/usePaymentScheduleLocate.ts:108` 是 timer 建立并在 effect cleanup 中 `window.clearTimeout` 的现有范例。
- `apps/web/src/lib/request/client.ts:72` 已允许 `AxiosRequestConfig`，因此 service 只需传 `{ params, signal }`，不要改 request client。
- `apps/web/src/features/finance/components/PaymentScheduleWorkspace.locate.test.tsx` 展示 QueryClient + Testing Library 的工作区测试装配方式。
- 输入状态、分页归一和现有 URL deep-link/lock 语义保持原处，不把 debounce 状态写入 reducer。

## Steps

1. 新建 `apps/web/src/hooks/useDebouncedValue.ts` 和 `useDebouncedValue.test.tsx`；用 fake timers 证明初值即时、299ms 不更新、300ms 更新、快速连续输入只提交最后值、卸载清理 timer。
2. 在 `TransactionsWorkspace.tsx`、`VerificationsWorkspace.tsx`、`usePaymentScheduleWorkspace.ts` 中按 Target 引入 hook，替换 query key 和请求 params；输入组件的 `value/onChange` 不变。
3. 在 `finance.service.ts` 为上述七个 list 方法增加 `signal?: AbortSignal`，传入 `request.get`；调用它们的三个 queryFn 消费 `({ signal })`。
4. 新建 `apps/web/src/features/finance/components/finance-search-debounce.test.tsx`（也可拆成现有工作区测试文件），mock service 后使用 fake timers：连续输入三个字符期间无新请求，推进 300ms 后恰好请求一次且 params 为最终值；随后输入新值并证明前一调用收到的 signal 变为 `aborted`。
5. 复核 reset、allowClear、deep-link lock 与页码归 1 行为；删除无关格式变化。

## Boundaries

- 不 debounce 日期、Select、付款节点的客户端 `keyword`，也不延迟输入框显示。
- 不改变 300ms 以外的业务语义、URL deep link、匹配模式或分页规则。
- 不加依赖，不改 API 协议，不全局修改 Axios interceptor。
- 不吞掉取消异常；让 TanStack Query/Axios 使用标准 AbortSignal 处理。
- 若代码已偏离 commit `b77379c`，立即停止并报告，不自行猜测合并。

## Verification

- **Mechanical**:
  - `pnpm --filter @xiaotuanbao/web test -- useDebouncedValue finance-search-debounce`
  - `pnpm --filter @xiaotuanbao/web typecheck`
  - `pnpm --filter @xiaotuanbao/web lint`
  - `pnpm --filter @xiaotuanbao/web test`
  - `npx react-doctor@latest --scope changed` 不再报告逐字符网络请求，且总分不下降。
- **Behavior check**: 在流水、核销、应收/应付页面打开 DevTools Network 与 React DevTools Profiler，快速输入 4–6 个字；输入框每个字符立即出现，300ms 后仅最终条件发出一个请求，再次输入时旧请求显示 canceled。记录前后请求数，Highlight updates 不应显示无关工作区额外闪烁。
- **Done when**: 六个服务端搜索字段均合并请求，过期请求可取消，客户端节点筛选仍即时，测试和全量检查通过。
