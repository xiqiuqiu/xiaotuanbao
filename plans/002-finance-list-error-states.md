# 002 — 为核心财务列表补齐错误态

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: custom/missing-query-error-state
- **Estimated scope**: 7 files, about 180 lines including focused tests

## Problem

三个高频财务列表只读取 `data` 和 `isLoading`。请求失败时 `data` 为 `undefined`，当前回退值把失败伪装成“0 条数据”，会让财务人员误判为没有账款、流水或核销记录。

    // apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts:79 — current
    const { data: schedulesResult, isLoading, isFetching } = useQuery({

    // apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts:316 — current return values
    isLoading,
    columns,
    tableItems,
    tableTotal,

    // apps/web/src/features/finance/components/PaymentScheduleWorkspace.tsx:82 — current
    <PaymentScheduleTable
      loading={isLoading}
      columns={columns}
      items={tableItems}
      page={page}
      pageSize={pageSize}
      total={tableTotal}

    // apps/web/src/features/finance/components/TransactionsWorkspace.tsx:64 — current
    const { data: transactionsResult, isLoading } = useQuery({

    // apps/web/src/features/finance/components/TransactionsWorkspace.tsx:211 — current
    <Card>
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={transactionsResult?.items ?? []}

    // apps/web/src/features/finance/components/VerificationsWorkspace.tsx:190 — current
    const { data: verificationsResult, isLoading } = useQuery({

    // apps/web/src/features/finance/components/VerificationsWorkspace.tsx:327 — current
    <VerificationTable
      loading={isLoading}
      columns={columns}
      items={verificationsResult?.items ?? []}
      page={page}
      pageSize={pageSize}
      total={verificationsResult?.total ?? 0}

## Target

这是仓库自定义审计项，没有 React Doctor canonical prompt。目标严格复用仓库现有的 `Alert + 重试` 查询错误态，不引入新抽象。筛选器保留可见；错误时用错误提示替换表格，重试成功后恢复表格。

    // apps/web/src/features/finance/hooks/usePaymentScheduleWorkspace.ts — target query result
    const {
      data: schedulesResult,
      isLoading,
      isFetching,
      isError,
      error,
      refetch,
    } = useQuery({
      // existing queryKey/queryFn/enabled remain unchanged
    })

    // target return additions; preserve all existing return fields
    isLoading,
    isError,
    error,
    refetch,
    columns,

    // apps/web/src/features/finance/components/PaymentScheduleWorkspace.tsx — target import
    import { Alert, Button } from 'antd'

    // target hook destructuring additions
    isLoading,
    isError,
    error,
    refetch,

    // target: replace only the unconditional PaymentScheduleTable block
    {isError ? (
      <Alert
        type="error"
        showIcon
        title={`${isReceivable ? '应收单' : '应付单'}加载失败`}
        description={error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'}
        action={
          <Button size="small" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    ) : (
      <PaymentScheduleTable
        loading={isLoading}
        columns={columns}
        items={tableItems}
        page={page}
        pageSize={pageSize}
        total={tableTotal}
        locateSourceOrderId={locateSourceOrderId}
        locateSegmentResourceId={locateSegmentResourceId}
        locateFlashActive={locateFlashActive}
        locateBg={locateBg}
        onPageChange={(nextPage, nextPageSize) => {
          setPage(nextPage)
          setPageSize(nextPageSize)
        }}
      />
    )}

    // apps/web/src/features/finance/components/TransactionsWorkspace.tsx — target import/query
    import { Alert, Button, Card, Table } from 'antd'

    const {
      data: transactionsResult,
      isLoading,
      isError,
      error,
      refetch,
    } = useQuery({
      // existing query options remain unchanged
    })

    // target: keep the Card; replace only its Table child with this branch
    {isError ? (
      <Alert
        type="error"
        showIcon
        title="流水列表加载失败"
        description={error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'}
        action={
          <Button size="small" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    ) : (
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={transactionsResult?.items ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          total: transactionsResult?.total ?? 0,
          showSizeChanger: true,
          showTotal: (count) => `共 ${count} 条`,
          onChange: (nextPage, nextPageSize) => {
            dispatchList({ type: 'setPage', value: nextPage })
            dispatchList({ type: 'setPageSize', value: nextPageSize })
          },
        }}
      />
    )}

    // apps/web/src/features/finance/components/VerificationsWorkspace.tsx — target import/query
    import { Alert, Button, Card, Form, Table } from 'antd'

    const {
      data: verificationsResult,
      isLoading,
      isError,
      error,
      refetch,
    } = useQuery({
      // existing query options remain unchanged
    })

    // target: branch at the existing VerificationTable call site
    {isError ? (
      <Card>
        <Alert
          type="error"
          showIcon
          title="核销列表加载失败"
          description={error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'}
          action={
            <Button size="small" onClick={() => void refetch()}>
              重试
            </Button>
          }
        />
      </Card>
    ) : (
      <VerificationTable
        loading={isLoading}
        columns={columns}
        items={verificationsResult?.items ?? []}
        page={page}
        pageSize={pageSize}
        total={verificationsResult?.total ?? 0}
        onPageChange={(nextPage, nextPageSize) => {
          dispatchList({ type: 'setPage', value: nextPage })
          dispatchList({ type: 'setPageSize', value: nextPageSize })
        }}
      />
    )}

## Repo conventions to follow

- 复用 `apps/web/src/features/departure/components/ExecutionTab.tsx:271` 的查询失败布局：`Alert type="error" showIcon`、明确标题、`Button size="small"` 调用 `void refetch()`。
- 错误详情格式复用 `apps/web/src/features/departure/components/DepartureOperationsSheetDrawer.tsx:63`：优先展示 `Error.message`，否则使用稳定中文兜底。
- 测试沿用 `apps/web/src/features/departure/components/DepartureOperationsSheetDrawer.test.tsx:23` 的 `QueryClient(retry: false)`、服务 mock 和 Testing Library 交互风格。
- 保留现有 Ant Design import 顺序、TanStack Query queryKey、筛选状态及分页 reducer。

## Steps

1. 在 `usePaymentScheduleWorkspace.ts:79` 暴露账款列表查询的 `isError`、`error`、`refetch`；不要改变 queryKey、查询参数、定位高亮或 Mutation。
2. 在 `PaymentScheduleWorkspace.tsx:1` 引入 `Alert`、`Button`，并在 `PaymentScheduleWorkspace.tsx:82` 用 Target 中的分支替换无条件表格；保留筛选器和全部弹窗。
3. 在 `TransactionsWorkspace.tsx:1,64,211` 按 Target 读取查询错误信息；失败时在原 Card 内显示错误和重试，不能渲染空 Table。
4. 在 `VerificationsWorkspace.tsx:1,190,327` 按 Target 读取查询错误信息；失败时显示错误 Card，成功或加载时仍走现有 `VerificationTable`。
5. 新增 `apps/web/src/features/finance/components/PaymentScheduleWorkspace.error.test.tsx`：mock `listDepartureReceivables` 首次 reject、第二次 resolve；断言出现“应收单加载失败”、不出现“共 0 条”，点击“重试”后出现返回的应收单号。
6. 新增 `apps/web/src/features/finance/components/TransactionsWorkspace.error.test.tsx`：以最小 router/query provider 渲染全局流水工作区，mock `listTransactions` reject 后断言错误标题且无空表格语义；重试 resolve 后断言流水号出现。
7. 新增 `apps/web/src/features/finance/components/VerificationsWorkspace.error.test.tsx`：mock `listVerifications` reject/resolve，断言错误标题、重试调用以及恢复后的核销单号。
8. 重新阅读 diff，删除任何格式化或顺手抽象产生的无关改动。

## Boundaries

- Do NOT 修改财务接口、queryKey、分页、筛选器、深链或 Mutation 行为。
- Do NOT 把三个页面抽成新的公共错误组件；本计划只补当前三个高风险列表的失败语义。
- Do NOT 用 toast 代替页面内错误态，也不要在错误时继续显示 `total=0` 的表格。
- Do NOT 改详情抽屉；详情错误态由计划 007 负责。
- Do NOT 添加依赖或修改公共组件 API。
- STOP if the code has drifted from commit `b77379c`; report the drift instead of improvising.

## Verification

- **Mechanical**:
  - `npx react-doctor@latest --scope changed` 不再报告这三个列表缺少错误态，且分数不下降。
  - `pnpm --filter web typecheck`
  - `pnpm --filter web test -- PaymentScheduleWorkspace.error.test.tsx TransactionsWorkspace.error.test.tsx VerificationsWorkspace.error.test.tsx`
  - `pnpm --filter web test`
- **Behavior check**: 在 `/finance/receivable`、`/finance/payable`、`/finance/transaction`、`/finance/verification` 分别让列表请求返回 500；确认筛选器仍可见、错误不会显示成“共 0 条”、错误信息明确且“重试”能恢复真实数据。发团详情内的账款/流水/核销 tab 也各检查一次。
- **Done when**: 三类列表请求失败均呈现内联错误态，重试成功恢复数据，失败不再伪装为空列表，目标测试、全量测试、typecheck 和 React Doctor 均通过。
