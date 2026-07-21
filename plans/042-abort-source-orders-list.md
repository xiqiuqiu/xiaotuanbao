# 042 — 客源单列表 AbortSignal

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 2 files

## Problem

`listSourceOrders` 无 signal；`SourceOrdersTab` queryFn 未透传。

## Target

Exemplar：`plans/031` / `TransactionsWorkspace`。

```ts
export async function listSourceOrders(
  departureId: string,
  params: ListSourceOrdersParams = {},
  signal?: AbortSignal,
): Promise<SourceOrderListResult> {
  return request.get(..., { params, signal })
}
```

```tsx
queryFn: ({ signal }) => listSourceOrders(departure.id, { ... }, signal),
```

两处 query（筛选列表 + 批量计数）都接。

## Verification

- typecheck；快切筛选 Network 见 cancelled。
