# 054 — 统一日程 chip 按压 scale(0.97)

- **Status**: DONE
- **Commit**: 341bdf6
- **Severity**: HIGH
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 CSS file

## Problem

`ExecutionTab.module.css:127-128` 日程 chip `:active` 使用 `scale(0.98)`，偏离全局按压契约 `scale(0.97)`（`global.css`、`motion-cohesion.test.ts`）。

```css
/* apps/web/src/features/departure/components/ExecutionTab.module.css:127 — current */
.dayChip:active {
  transform: scale(0.98);
}
```

## Target

```css
.dayChip:active {
  transform: scale(0.97);
}
```

## Repo conventions to follow

- 全局按钮：`apps/web/src/styles/global.css` — `transform: scale(0.97)` + `100ms` + `--ant-motion-ease-out-quint`
- 契约测试：`apps/web/src/styles/motion-cohesion.test.ts` 断言 ExecutionTab 含 `scale(0.97)` 且不含 `scale(0.98)`

## Steps

1. 将 `.dayChip:active` 的 `scale(0.98)` 改为 `scale(0.97)`。

## Boundaries

- Do NOT 改 hover / selected / reduced-motion 其它规则。
- Do NOT 改时长或 easing。

## Verification

- **Mechanical**: `pnpm --filter web exec vitest run src/styles/motion-cohesion.test.ts`
- **Feel check**: 执行 Tab 按压日程 chip，压缩幅度与页面按钮一致。
- **Done when**: cohesion 测试通过；CSS 无 `scale(0.98)`。
