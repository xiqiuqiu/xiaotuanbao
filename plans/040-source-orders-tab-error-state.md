# 040 — 客源单列表错误态

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: Beyond the scan（custom/missing-query-error-state）
- **Estimated scope**: 1–2 files

## Problem

`SourceOrdersTab` 只取 `isLoading`；失败时 `dataSource={listResult?.items ?? []}` 呈空表。

```74:84:apps/web/src/features/departure/components/SourceOrdersTab.tsx
  const { data: listResult, isLoading } = useQuery({
```

```216:223:apps/web/src/features/departure/components/SourceOrdersTab.tsx
      <Table
        loading={isLoading}
        dataSource={listResult?.items ?? []}
```

## Target

对齐 `ExecutionTab` / 财务列表：解构 `isError`/`error`/`refetch`；无数据且错误时用 `Alert`+重试替换 Table；有 stale 数据时可保留表 + `StaleDataAlert`（若同页已有模式则复用，否则至少硬错误 Alert）。

Exemplar：`ExecutionTab.tsx:241-254`。

## Steps

1. 扩展 useQuery 解构。
2. 错误 UI；筛选条保持可见。
3. 可选：同改 `PartnerSourceOrdersTab` 若同构。

## Boundaries

- Do NOT 改筛选/抽屉行为。

## Verification

- typecheck；mock 列表失败可见错误与重试。
