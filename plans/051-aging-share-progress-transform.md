# 051 — 账龄占比条改用 transform，去掉 transition: all

- **Status**: TODO
- **Commit**: 03e5455
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 2 files（`FinanceReceivablesModule.tsx` + `HomePage.module.css`）+ 测试更新

## Problem

财务工作台账龄「结构占比」用 antd `Progress` 画占比。antd Line Progress 的 track 样式为：

```css
transition: all ${motionDurationSlow} ${motionEaseInOutCirc};
```

即 **`transition: all`**，且通过改变宽度表达进度（layout + paint）。AUDIT：禁止 `transition: all`；只应动画 `transform` / `opacity`。发团概览已有 `scaleX` 范式可抄。

当前：

```194:200:apps/web/src/pages/FinanceReceivablesModule.tsx
                      <Progress
                        percent={row.sharePercent}
                        showInfo={false}
                        size="small"
                        strokeColor={token.colorPrimary}
                        railColor={token.colorFillSecondary}
                      />
```

## Target

用轻量自定义轨 + 填充条，宽度用 `transform: scaleX(share)`（`transform-origin: left center`），过渡：

```css
/* HomePage.module.css — target */
.agingShareTrack {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--ant-color-fill-secondary);
  overflow: hidden;
}

.agingShareFill {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--ant-color-primary);
  transform-origin: left center;
  transform: scaleX(var(--aging-share, 0));
  transition: transform 200ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1));
}

@media (prefers-reduced-motion: reduce) {
  .agingShareFill {
    transition: none;
  }
}
```

（把 `.agingShareFill` 的 `transition: none` **合并进**文件末尾已有的 `@media (prefers-reduced-motion: reduce)` 块，不要新建第二个 reduce 块，除非现有块结构不允许——优先合并。）

JSX：

```tsx
// FinanceReceivablesModule — target（替换 Progress）
<span
  className={styles.agingShareTrack}
  aria-hidden
>
  <span
    className={styles.agingShareFill}
    style={{ ['--aging-share' as string]: Math.min(Math.max(row.sharePercent / 100, 0), 1) }}
  />
</span>
```

说明：

- `sharePercent` 是 0–100；CSS 变量用 0–1 的 `scaleX` 系数。
- 可访问名称已在外层 `button` 的 `aria-label`（`bucketAriaLabel`），条本身 `aria-hidden`。
- **不要**用父级 CSS 变量驱动子级 transform 的复杂链——变量写在填充元素自己的 `style` 上即可（AUDIT：勿用父级变量驱动子 transform 重算；此处变量与 transform 同元素，可接受）。
- 时长 200ms、曲线用仓库标准 ease-out-quint（与 AUDIT「UI 动画 < 300ms」及 `DESIGN.md` 展开 ~200ms 一致）。
- 移除对本文件中 `Progress` 的 import（若再无引用）。

## Repo conventions to follow

Exemplar — 发团概览用 `scaleX` + ease-out-quint + reduce 关闭：

```14:27:apps/web/src/features/departure/components/DepartureOverviewStatsCards.module.css
.progressLoad :global(.ant-progress-track) {
  transform-origin: left center;
  animation: progress-load 240ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1)) both;
}

@keyframes progress-load {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
```

本计划用 **transition + 目标 scaleX**（非 keyframes 从 0 播一遍），以便数据刷新时从当前值 retarget（Interruptibility）。

- Token：`var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))`（见 `motion-cohesion.test.ts`）。
- 若用到 `theme.useToken()` 的 `token.colorPrimary`：自定义条用 CSS 变量 `var(--ant-color-primary)` 即可，可去掉仅为此 Progress 使用的 token 颜色 props；若 `token` 在该组件仍有其它用途则保留 hook。

## Steps

1. 在 `HomePage.module.css` 增加 `.agingShareTrack` / `.agingShareFill`；在现有 reduce media 中为 `.agingShareFill` 设 `transition: none`。
2. 在 `FinanceReceivablesModule.tsx` 的 share 列表中，用上述 span 结构替换 `Progress`；计算 `--aging-share` 时 clamp 到 `[0, 1]`。
3. 清理未使用的 `Progress` import；若 `token` 仅服务 Progress 颜色，检查 `FinanceReceivablesAgingCard` 内是否仍需要 `theme.useToken()`（Column 仍用 `token.colorPrimary` 等——保留）。
4. 更新任何断言 `Progress` / `ant-progress` 的测试（如 `FinanceReceivablesModule.aging-chart.test.tsx`）：改为断言 `agingShareTrack` / `workbench-aging-share-list` 内填充条存在，或 `--aging-share` 合理。
5. 确认 `motion-cohesion.test.ts` 仍通过（新 cubic-bezier 必须包在 var fallback 内）。

## Boundaries

- Do NOT 改账龄推荐模式算法（`finance-aging-chart.ts`）。
- Do NOT 改 column 模式的 `Column` 图表（那是 049）。
- Do NOT 保留 antd Progress 再靠全局 CSS 覆盖 `transition: all`（脆弱、易漏 reduce）。
- Do NOT 使用 `width: ${percent}%` + transition width。
- Do NOT 添加无限 `status="active"` 闪光。

## Verification

- **Mechanical**：
  - `pnpm --filter web exec vitest run src/pages/FinanceReceivablesModule.aging-chart.test.tsx src/styles/motion-cohesion.test.ts src/pages/HomePage.test.tsx`
  - `pnpm --filter web typecheck`
- **Feel check**：
  - 财务工作台 → 逾期账龄 →「结构占比」：条从左以 scaleX 出现/更新，无横向 layout 抖动感。
  - DevTools Animations 设 10%：确认过渡的是 **transform**，不是 width。
  - `prefers-reduced-motion: reduce`：条立即到最终宽度比例，无 200ms 过渡。
  - 极端跨度数据（触发 share 默认）下列表仍可读、可点进 bucket。
- **Done when**：share 列表不再渲染 `Progress`；填充仅 `transform`；reduce 下无过渡；测试绿。
