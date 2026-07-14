# 013 — 删除未使用的应付概览标签

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: LOW
- **Category**: Maintainability & architecture
- **Rule**: deslop/unused-export
- **Estimated scope**: 1 file，删除 7 行

## Problem

全仓检索只有声明本身，没有 importer 或本地调用：

    // apps/web/src/features/departure/catalog.ts:184 — current
    export const SEGMENT_PAYABLE_OVERVIEW_LABELS: Record<string, string> = {
      [SegmentPayableStatus.NOT_GENERATED]: '应付未生成',
      [SegmentPayableStatus.PENDING]: '应付待付',
      [SegmentPayableStatus.PARTIAL]: '应付部分付款',
      [SegmentPayableStatus.PAID]: '应付已付清',
      [SegmentPayableStatus.CLOSED]: '应付已关闭',
    }

该未使用导出扩大 catalog 公共接口并暗示一个不存在的展示口径。

## Target

Canonical fix要求先确认无 importer；若声明在文件内也未使用，则删除整个声明，而不是仅去掉 `export`：

    // apps/web/src/features/departure/catalog.ts — target
    export const SEGMENT_PAYABLE_STATUS_LABELS = { /* unchanged */ }
    // SEGMENT_PAYABLE_OVERVIEW_LABELS removed completely.

## Repo conventions to follow

- `apps/web/src/features/departure/catalog.ts` 继续只保存被业务代码使用的稳定枚举映射。
- 不改相邻 `SEGMENT_PAYABLE_STATUS_LABELS` 及其中文文案。

## Steps

1. 再次运行 `rg -n "SEGMENT_PAYABLE_OVERVIEW_LABELS" .`，确认只有声明。
2. 删除 `catalog.ts:184-190` 的完整常量声明。
3. 不格式化或重排相邻 catalog。

## Boundaries

- Do NOT 删除或改名 `SEGMENT_PAYABLE_STATUS_LABELS`。
- Do NOT 顺手清理其他 catalog 项。
- 若出现新 importer 或代码偏离 commit `b77379c`，停止并报告。

## Verification

- **Mechanical**:
  - `pnpm --filter web typecheck`
  - `pnpm --filter web test`
  - 全量 `npx react-doctor@latest --json` 中不再出现 `deslop/unused-export` 的该项。
- **Behavior check**: 打开发团执行页，确认资源应付状态标签仍按 `SEGMENT_PAYABLE_STATUS_LABELS` 正常显示。
- **Done when**: 全仓无该符号、类型检查和测试通过、现有状态标签无变化。
