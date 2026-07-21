# 045 — 客源单/合作伙伴/供应商筛选 aria-label

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Rule**: Beyond the scan（control-has-associated-label）
- **Estimated scope**: 3 files

## Problem

`SourceOrdersFilters` / `PartnerFilters` / `SupplierFilters` 仅 placeholder。

## Target

Exemplar：`VerificationFilters.tsx` / `DepartureFilters.tsx`。为每个 Select/Input 加中文 `aria-label`（可与 placeholder 同义）。

## Verification

- 读屏/无障碍树可见名称；布局不变。
