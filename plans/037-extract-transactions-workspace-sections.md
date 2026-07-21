# 037 — 拆分 TransactionsWorkspace 巨型组件

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 2–3 文件，行为保持

## Problem

`TransactionsWorkspace` 约 346 行，列表 query、筛选、表格、对话框耦合。

```43:43:apps/web/src/features/finance/components/TransactionsWorkspace.tsx
export function TransactionsWorkspace(
```

Canonical recipe：抽逻辑区块。Exemplar：已有 `useTransactionListState`、`TransactionFilters`、`TransactionActionDialogs`——继续把剩余「query + table 编排」收紧。

## Target

在 **026（placeholder commit API）迁移本文件之后**再拆，避免双改。

建议抽：

1. `useTransactionsWorkspaceQuery.ts`：`listFilterKey`、`useListPlaceholderData`、`useQuery(listTransactions)`、`resolveListTableLoading`。
2. 主组件保留 filters 绑定 + Table + `TransactionActionDialogs`。

或抽 `TransactionsWorkspaceTable.tsx` 承载 Table JSX + columns memo。

目标：主组件 <300 行，Doctor 不再报警。

## Repo conventions to follow

- hooks 放 `apps/web/src/features/finance/hooks/`。
- 保持 `FinanceWorkspaces.query-state.test.tsx` 等入口。

## Steps

1. 完成 026 对本文件的 API 迁移。
2. 抽 query hook 或 table 子组件。
3. 跑 finance workspace 相关测试。

## Boundaries

- Do NOT 改列表筛选/深链/错误态行为（002/003 等已落地）。
- Do NOT 合并无关格式化 churn。

## Verification

- **Mechanical**: 清除该文件 `no-giant-component`；typecheck；相关测试。
- **Behavior**: 流水列表筛选、翻页软加载、打开新建/编辑/核销抽屉与拆分前一致。
- **Done when**: 诊断清除，测试绿。
