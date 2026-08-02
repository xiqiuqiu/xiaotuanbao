# 056 — Tab / 资源 pane 入场改用 ease-out-quint

- **Status**: DONE
- **Commit**: 341bdf6
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 2 CSS + 2 test files

## Problem

Tab pane 与按日资源 pane 入场使用关键字 `ease`：

```css
/* DepartureDetailPage.module.css:24-25 */
.tabPaneEnter {
  animation: tab-pane-fade 120ms ease both;
}
/* ExecutionTab.module.css:287-288 */
.resourcePaneEnter {
  animation: resource-pane-fade 100ms ease both;
}
```

入场应 ease-out；同页其它动效用 `--ant-motion-ease-out-quint`。

## Target

```css
.tabPaneEnter {
  animation: tab-pane-fade 120ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1)) both;
}
.resourcePaneEnter {
  animation: resource-pane-fade 100ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1)) both;
}
```

保持仅 opacity、时长不变。同步更新 `DepartureDetailPage.motion-css.test.ts` 与 `ExecutionTab.motion-css.test.ts` 断言。

## Repo conventions to follow

- Exemplar：`DepartureOverviewStatsCards.module.css` metric-card-enter
- Token：`AppProviders.tsx` `motionEaseOutQuint: 'cubic-bezier(0.23, 1, 0.32, 1)'`

## Steps

1. 改两处 CSS animation 的 easing。
2. 更新两处 motion-css 测试匹配新字符串（仍断言无 translate/scale）。

## Boundaries

- Do NOT 给 tab/resource 加位移或 scale（测试禁止）。
- Do NOT 改时长。

## Verification

- **Mechanical**: vitest 跑上述两个 motion-css 测试 + `motion-cohesion.test.ts`
- **Feel check**: 切 Tab / 换日程，淡入起手更快、收尾更柔。
- **Done when**: 测试绿；CSS 无 `120ms ease` / `100ms ease` 入场写法。
