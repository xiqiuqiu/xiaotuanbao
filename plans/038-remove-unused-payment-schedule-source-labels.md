# 038 — 删除未使用的 PAYMENT_SCHEDULE_SOURCE_TYPE_LABELS 导出

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: LOW
- **Category**: Maintainability & architecture
- **Rule**: deslop/unused-export
- **Estimated scope**: 1 文件（`catalog.ts`）

## Problem

```54:59:apps/web/src/features/finance/catalog.ts
export const PAYMENT_SCHEDULE_SOURCE_TYPE_LABELS: Record<string, string> = {
  [PaymentScheduleSourceType.MANUAL]: '手工录入',
  [PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT]: '客源单客户结算',
  [PaymentScheduleSourceType.SOURCE_ORDER_GUEST_COLLECTION]: '客源单游客代收',
  [PaymentScheduleSourceType.SEGMENT_RESOURCE]: '行程段资源',
}
```

全仓无模块 import。实际展示用的是下方 `RECEIVABLE_COLLECTION_METHOD_LABELS`。

Canonical recipe（[deslop/unused-export](https://www.react.doctor/prompts/rules/deslop/unused-export.md)）：确认无 importer 后去掉 `export`；若模块内也不用则删除声明。

## Target

删除整个 `PAYMENT_SCHEDULE_SOURCE_TYPE_LABELS` 常量块（模块内无引用）。保留紧随其后的 `RECEIVABLE_COLLECTION_METHOD_LABELS` 与注释。

执行前再跑一次：

```bash
rg "PAYMENT_SCHEDULE_SOURCE_TYPE_LABELS" apps/web
```

若已有新引用则 STOP 并报告。

## Repo conventions to follow

- `catalog.ts` 只保留真正共享的标签/options。
- 不「改成非 export 仍留死代码」——直接删除。

## Steps

1. `rg` 确认无引用。
2. 删除常量。
3. typecheck。

## Boundaries

- Do NOT 删除 `RECEIVABLE_COLLECTION_METHOD_LABELS` 或其它仍被引用的 catalog 导出。

## Verification

- **Mechanical**: React Doctor 清除 `deslop/unused-export`（全量扫描；`--scope changed` 可能跳过 deadCode——应用全量或确认规则）；`pnpm --filter web typecheck`。
- **Behavior**: 应收列表「收款方式」列展示不变。
- **Done when**: 符号消失且无类型/测试失败。
