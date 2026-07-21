# 047 — 客人名单 Editable 列稳定化

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 1 file

## Problem

`SourceOrderGuestDrawer` 每 render `baseColumns.map` 新 `onCell`。

```331:346:apps/web/src/features/departure/components/SourceOrderGuestDrawer.tsx
  const columns = baseColumns.map((col) => {
```

## Target

Exemplar：022 execution resource columns `useMemo`。将 `baseColumns`+`columns` 用 `useMemo`，依赖 `readOnly`、`editingKey`/`isEditing`、pending、handlers。

## Verification

- Profiler：编辑时列引用稳定；行为不变。
