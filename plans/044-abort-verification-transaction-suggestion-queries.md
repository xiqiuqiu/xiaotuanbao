# 044 — 核销抽屉与流水建议金额 query 接 signal

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 2–3 files

## Problem

`useCreateVerificationDrawerState` 的 `listTransactions` / `listReceivables|listPayables` 已支持 signal 但未传。
`useTransactionFormDrawerQueries` 游客建议金额 `Promise.all` 未接 signal；`getSourceOrder` 需可选 signal。

## Target

```tsx
queryFn: ({ signal }) => listTransactions({ ... }, signal),
queryFn: ({ signal }) => listReceivables({ ... }, signal),
```

```tsx
queryFn: async ({ signal }) => {
  const [receivables, sourceOrder, transactions] = await Promise.all([
    listDepartureReceivables(departureId!, { ... }, signal),
    getSourceOrder(counterpartyId!, signal),
    listTransactions({ ... }, signal),
  ])
```

## Verification

- typecheck；抽屉内快切发团/客源，过期请求取消。
