# 055 — 发团资源 locate flash 对齐财务 480ms

- **Status**: DONE
- **Commit**: 341bdf6
- **Severity**: HIGH
- **Category**: Cohesion / Performance
- **Estimated scope**: 2 files（CSS + TS）

## Problem

发团级资源表 locate 动画 sticky 操作列、时长 2.4s、关键字 `ease-out`，与财务 `PaymentScheduleWorkspace`（480ms + ease-out-quint、不闪 fixed 列）不一致。

```css
/* DepartureResourcePane.module.css:31-47 — current */
.locateFlash > td:not(:global(.ant-table-cell-fix)) {
  animation: departure-resource-locate-flash 2.4s ease-out both;
}
.locateFlash > td:global(.ant-table-cell-fix) {
  animation: departure-resource-locate-flash 2.4s ease-out both;
}
```

```ts
/* DepartureResourcePane.tsx:156 — current */
const timer = window.setTimeout(() => setHighlightActive(false), 2400)
```

## Target

对齐财务 locate（`PaymentScheduleWorkspace.module.css` + `LOCATE_FLASH_MS = 480`）：

- 仅滚动单元格播 flash；fixed 列只抬 `z-index`，背景用容器色
- 时长 480ms，曲线 `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))`
- keyframes：快速到峰值 → 短 dwell → 淡出（可复用财务曲线结构）
- TS timer = 480
- reduced-motion：取消动画，保留静态高亮底色

## Repo conventions to follow

- Exemplar：`apps/web/src/features/finance/components/PaymentScheduleWorkspace.module.css:1-40`
- Timer：`apps/web/src/features/finance/hooks/usePaymentScheduleLocate.ts` — `LOCATE_FLASH_MS = 480`

## Steps

1. 重写 `DepartureResourcePane.module.css` locate 段，模仿财务：keyframes + 仅非 fixed td 动画 + fixed td z-index。
2. `DepartureResourcePane.tsx`：抽出 `LOCATE_FLASH_MS = 480`（注释写明匹配 CSS），替换 `2400`。
3. 若有 CSS 契约测试则更新；无则不必新建。

## Boundaries

- Do NOT 改财务 locate 实现。
- Do NOT 改表格列定义或其它资源 pane 行为。

## Verification

- **Mechanical**: `pnpm --filter web exec vitest run` 覆盖 DepartureResourcePane / ExecutionTab 相关测试；确认无硬编码 2400。
- **Feel check**: 深链定位发团级资源行 → 约半秒柔和高亮后消失；sticky 操作列不闪、不透底。
- **Done when**: CSS 无 `2.4s`；timer 480；fixed 列无 background animation。
