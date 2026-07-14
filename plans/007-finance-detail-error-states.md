# 007 — 为财务详情抽屉补齐错误态

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: MEDIUM
- **Category**: Bugs & correctness
- **Rule**: custom/missing-query-error-state
- **Estimated scope**: 4 files, about 110 lines including tests

## Problem

流水详情和核销详情查询只区分 loading/data。请求失败后 data 为空，三元表达式最终返回 `null`，用户看到的是有标题和关闭按钮、但正文完全空白的抽屉，无法判断是无数据还是网络失败，也没有重试入口。

    // apps/web/src/features/finance/components/TransactionDetailDrawer.tsx:67 — current
    const { data: transaction, isLoading } = useQuery({
      queryKey: ['finance-transaction', transactionId],
      queryFn: () => {
        if (!transactionId) {
          throw new Error('流水 ID 缺失')
        }
        return getTransaction(transactionId)
      },
      enabled: open && Boolean(transactionId),
    })

    // apps/web/src/features/finance/components/TransactionDetailDrawer.tsx:136 — current branch
    {isLoading ? (
      <Spin />
    ) : transaction ? (
      <>
        {/* details */}
      </>
    ) : null}

    // apps/web/src/features/finance/components/VerificationDetailDrawer.tsx:50 — current
    const { data: detail, isLoading } = useQuery({

    // apps/web/src/features/finance/components/VerificationDetailDrawer.tsx:78 — current branch
    {isLoading ? (
      <Spin />
    ) : detail ? (
      <>
        {/* details */}
      </>
    ) : null}

## Target

这是仓库自定义审计项，没有 React Doctor canonical prompt。目标复用现有 Ant Design 抽屉查询错误态：保留 loading 和成功正文，在二者之间加入 `Alert`；错误内容优先显示服务返回的 `Error.message`；提供调用 query `refetch()` 的重试按钮。

    // apps/web/src/features/finance/components/TransactionDetailDrawer.tsx — target import/query
    import { Alert, Button, Descriptions, Drawer, Empty, Space, Spin, Table, Tag, Typography } from 'antd'

    const {
      data: transaction,
      isLoading,
      isError,
      error,
      refetch,
    } = useQuery({
      queryKey: ['finance-transaction', transactionId],
      queryFn: () => {
        if (!transactionId) {
          throw new Error('流水 ID 缺失')
        }
        return getTransaction(transactionId)
      },
      enabled: open && Boolean(transactionId),
    })

    // target body branch; keep the existing successful fragment verbatim
    {isLoading ? (
      <Spin />
    ) : isError ? (
      <Alert
        type="error"
        showIcon
        title="流水详情加载失败"
        description={error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'}
        action={
          <Button size="small" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    ) : transaction ? (
      <>
        {/* existing transaction detail JSX unchanged */}
      </>
    ) : null}

    // apps/web/src/features/finance/components/VerificationDetailDrawer.tsx — target import/query
    import { Alert, Button, Descriptions, Drawer, Space, Spin, Tag, Typography } from 'antd'

    const {
      data: detail,
      isLoading,
      isError,
      error,
      refetch,
    } = useQuery({
      queryKey: ['finance-verification', verificationId],
      queryFn: () => {
        if (!verificationId) {
          throw new Error('核销 ID 缺失')
        }
        return getVerification(verificationId)
      },
      enabled: open && Boolean(verificationId),
    })

    // target body branch; keep the existing successful fragment verbatim
    {isLoading ? (
      <Spin />
    ) : isError ? (
      <Alert
        type="error"
        showIcon
        title="核销详情加载失败"
        description={error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'}
        action={
          <Button size="small" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    ) : detail ? (
      <>
        {/* existing verification detail JSX unchanged */}
      </>
    ) : null}

## Repo conventions to follow

- 复用 `apps/web/src/features/departure/components/DepartureOperationsSheetDrawer.tsx:63` 在 Drawer 内显示 `Alert` 和服务错误详情的模式。
- 重试按钮复用 `apps/web/src/features/departure/components/ExecutionResourcePane.tsx:333` 的 `Button size="small"` + `void refetch()` 模式。
- 测试 provider、失败重试和 Ant Design 配置沿用 `apps/web/src/features/departure/components/DepartureOperationsSheetDrawer.test.tsx:23`。
- 保持 Drawer 的 `destroyOnHidden`、footer、size、现有详情排版和格式化函数不变。

## Steps

1. 在 `TransactionDetailDrawer.tsx:1,67` 引入 `Alert` 并读取 `isError`、`error`、`refetch`。
2. 在 `TransactionDetailDrawer.tsx:136` 的 loading 与 data 分支之间插入 Target 中的流水错误态；不要改成功详情 JSX。
3. 在 `VerificationDetailDrawer.tsx:1,50` 引入 `Alert` 并读取 `isError`、`error`、`refetch`。
4. 在 `VerificationDetailDrawer.tsx:78` 的 loading 与 data 分支之间插入 Target 中的核销错误态；不要改成功详情 JSX。
5. 新增 `apps/web/src/features/finance/components/TransactionDetailDrawer.error.test.tsx`：使用 `QueryClient({ defaultOptions: { queries: { retry: false } } })`；mock `getTransaction` 首次 reject `new Error('流水不存在')`、重试 resolve；断言错误标题和 message 可见、点击“重试”后基础信息与流水号出现。
6. 新增 `apps/web/src/features/finance/components/VerificationDetailDrawer.error.test.tsx`：同样 mock `getVerification` reject/resolve；断言错误标题、服务错误、重试调用及成功详情恢复。
7. 两个测试都断言“关闭”按钮在错误时仍可操作并调用 `onClose`，避免错误分支破坏 Drawer 基础交互。
8. 重新阅读 diff，移除成功详情 JSX 的任何格式化 churn。

## Boundaries

- Do NOT 修改 service、queryKey、Drawer 公共 props 或关闭行为。
- Do NOT 把失败转为 `Empty`；失败必须与真正的无数据区分。
- Do NOT 用全局 toast 代替抽屉内错误态。
- Do NOT 重构详情字段、核销表格、catalog 或日期金额格式化。
- Do NOT 修改主列表；主列表错误态由计划 002 负责。
- Do NOT 添加依赖。
- STOP if the code has drifted from commit `b77379c`; report the drift instead of improvising.

## Verification

- **Mechanical**:
  - `npx react-doctor@latest --scope changed` 不再报告两个详情抽屉缺少错误态，且分数不下降。
  - `pnpm --filter web typecheck`
  - `pnpm --filter web test -- TransactionDetailDrawer.error.test.tsx VerificationDetailDrawer.error.test.tsx`
  - `pnpm --filter web test`
- **Behavior check**: 在流水列表和核销列表分别打开详情，让详情接口返回 500；确认抽屉正文显示明确错误和“重试”，footer“关闭”仍可用。恢复接口后点击重试，确认原详情内容完整出现且无需关闭重开抽屉。
- **Done when**: 两个详情失败都不再是空白抽屉，错误、重试、关闭均可操作，成功内容不变，聚焦/全量测试、typecheck 和 React Doctor 均通过。
