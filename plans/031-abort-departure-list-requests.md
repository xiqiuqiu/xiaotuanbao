# 031 — 发团列表请求支持 AbortSignal

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 2 文件（`departure.service.ts`、`DeparturesPage.tsx`）

## Problem

发团主列表 `queryFn` 未透传 TanStack Query 的 `signal`；`listDepartures` 也不接受 AbortSignal。快速改筛选/翻页时过期请求不会取消。财务列表已支持（exemplar）。

```190:207:apps/web/src/features/departure/pages/DeparturesPage.tsx
    queryFn: () =>
      listDepartures({
        keyword: state.keyword || undefined,
        routeName: debouncedRouteName,
        ...
        page: state.page,
        pageSize: state.pageSize,
      }),
```

```34:36:apps/web/src/services/departure.service.ts
export async function listDepartures(params: ListDeparturesParams): Promise<DepartureListResult> {
  return request.get<DepartureListResult>('/departures', { params })
}
```

Exemplar：

```115:130:apps/web/src/features/finance/components/TransactionsWorkspace.tsx
    queryFn: ({ signal }) =>
      listTransactions(
        { ... },
        signal,
      ),
```

## Target

```tsx
// departure.service.ts — target
export async function listDepartures(
  params: ListDeparturesParams,
  signal?: AbortSignal,
): Promise<DepartureListResult> {
  return request.get<DepartureListResult>('/departures', { params, signal })
}
```

```tsx
// DeparturesPage.tsx — target
queryFn: ({ signal }) =>
  listDepartures(
    {
      keyword: state.keyword || undefined,
      routeName: debouncedRouteName,
      // ...原字段不变
      page: state.page,
      pageSize: state.pageSize,
    },
    signal,
  ),
```

若其它 `listDepartures` 调用方无需 signal，保持第二参可选即可。

## Repo conventions to follow

- 与 `finance.service.ts` 的 `listTransactions(params, signal?)` 签名顺序一致。
- 不改动 `placeholderData` / filterKey（那是 026）。

## Steps

1. 扩展 `listDepartures`。
2. `DeparturesPage` `queryFn` 解构 `signal` 并传入。
3. typecheck；发团页手动快速切换筛选，Network 中可见前序请求 cancelled（Chrome）。

## Boundaries

- Do NOT 改列表筛选语义或 queryKey。
- Do NOT 强制改所有 departure service 方法——仅 `listDepartures`（除非同页还有并列 list 调用）。

## Verification

- **Mechanical**: `pnpm --filter web typecheck`。
- **Behavior**: DevTools Network：快速连续改筛选，较早的 `/departures` 显示 cancelled；最终列表与最后一次筛选一致。
- **Done when**: signal 贯通，无类型错误。
