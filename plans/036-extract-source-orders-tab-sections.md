# 036 — 拆分 SourceOrdersTab 巨型组件

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 2–4 文件，行为保持

## Problem

`SourceOrdersTab` 约 459 行，编排列表、筛选、抽屉、批量生成、金额变更确认等，超过阈值。

```150:150:apps/web/src/features/departure/components/SourceOrdersTab.tsx
export function SourceOrdersTab(
```

（以 Doctor 报告行号为准；导出函数本体过长。）

Canonical recipe：按区块抽子组件 / hook。Exemplar：010 `ExecutionSegmentListPane`、025 列提取。

## Target

在 **029（竞态修复）之后**拆分。建议：

1. 若列构建仍内联：抽到 `source-orders-table-columns.tsx`（仓库已有 `source-orders-table-columns.actions.test.tsx` 等，对齐该惯例）。
2. 抽 `SourceOrdersTabToolbar`（批量生成 + 筛选条）或抽屉提交逻辑到 `useSourceOrderSubmit.ts`（含 029 的 abort 逻辑）。
3. 主文件保留 tab 状态与布局，目标 <300 行。

## Repo conventions to follow

- `apps/web/src/features/departure/components/*-columns.tsx` 命名。
- 保持 `SourceOrdersTab.*.test.tsx` 仍从 Tab 入口测行为。

## Steps

1. 完成 029。
2. 先移纯列/纯提交 hook，再移 toolbar JSX。
3. 跑 source-order 相关 vitest。

## Boundaries

- Do NOT 改客源单业务规则或生成应收语义。
- Do NOT 与 029 挤在同一混乱 diff——先行为修复后结构移动。

## Verification

- **Mechanical**: 清除 `SourceOrdersTab` 的 `no-giant-component`；typecheck；相关测试。
- **Behavior**: 列表筛选、新建/编辑、金额变更确认、批量生成与拆分前一致。
- **Done when**: 诊断清除，测试绿。
