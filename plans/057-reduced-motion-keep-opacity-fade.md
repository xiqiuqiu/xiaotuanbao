# 057 — reduced-motion 保留 Tab/资源 opacity fade

- **Status**: DONE
- **Commit**: 341bdf6
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 2 CSS + 2 test files（可与 056 同批）

## Problem

```css
/* current — nukes all feedback */
@media (prefers-reduced-motion: reduce) {
  .tabPaneEnter { animation: none; }
  .resourcePaneEnter { animation: none; }
}
```

概览卡在 reduced-motion 下仍保留 120ms 纯 opacity（`metric-card-fade`）。审计：减运动非零反馈。

## Target

为 tab / resource 各加 opacity-only keyframes（或复用现有 fade keyframes，它们本就只有 opacity），reduced-motion 下：

```css
@media (prefers-reduced-motion: reduce) {
  .tabPaneEnter {
    animation-name: tab-pane-fade; /* already opacity-only */
    animation-duration: 120ms;
    /* keep ease-out-quint from base or set explicitly */
  }
  .resourcePaneEnter {
    animation-name: resource-pane-fade;
    animation-duration: 100ms;
  }
}
```

因基线动画已是纯 opacity，reduced-motion 分支应**保留**动画（可显式重申 duration），而不是 `animation: none`。若与「保留反馈」冲突于现有测试「disables … animation: none」，**改测试**以匹配 a11y 目标。

## Repo conventions to follow

- Exemplar：`DepartureOverviewStatsCards.module.css` `@media (prefers-reduced-motion: reduce)` 对 `.metricCardEnter`

## Steps

1. 改 `DepartureDetailPage.module.css` 与 `ExecutionTab.module.css` 的 reduced-motion 块。
2. 更新 motion-css 测试：断言保留 fade，不再要求 `animation: none`。

## Boundaries

- Do NOT 在 reduced-motion 下加入位移。
- 可与 056 同 PR。

## Verification

- **Mechanical**: 更新后的 motion-css 测试通过。
- **Feel check**: DevTools 开 `prefers-reduced-motion: reduce`，切 Tab / 换日仍有短淡入，无位移。
- **Done when**: 两处 CSS 无 `animation: none` 作用于这些 enter 类。
