# 043 — 合作伙伴/供应商列表 AbortSignal

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 4 files

## Problem

`listPartners` / `listSuppliers` 与页面 queryFn 未接 signal。

## Target

同 031：服务层第二参 `signal?`；`PartnersPage` / `SuppliersPage` `queryFn: ({ signal }) => ...`。

## Verification

- typecheck；快切筛选可见取消。
