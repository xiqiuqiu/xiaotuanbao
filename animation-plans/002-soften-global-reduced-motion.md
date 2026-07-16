# 002 — Soften global prefers-reduced-motion (stop nuking all animations)

- **Status**: DONE
- **Commit**: 2894e53
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1–2 files (`global.css`; verify feature modules still ok), small

## Problem

Global reduced-motion sets `animation-duration: 0.01ms !important` on every element. That disables **all** CSS animations — including Ant Design Spin / loading indicators that aid comprehension. Audit bar and `DESIGN.md` both require **gentler** motion under reduced preference, not zero.

```css
/* apps/web/src/styles/global.css:72-87 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }

  .ant-btn {
    transition: none;
  }

  .ant-btn:active:not(:disabled) {
    transform: none;
  }
}
```

Feature modules already do the right local pattern (keep opacity/color, drop transform) — e.g. `ExecutionTab.module.css:133-140`, `DepartureOverviewStatsCards.module.css:84-94`, `PaymentScheduleWorkspace.module.css:36-40`. The global `*` rule fights them (StatsCards needs `animation-duration: 120ms !important` to override).

## Target

Under `prefers-reduced-motion: reduce`:

1. Keep `scroll-behavior: auto`.
2. **Remove** the universal `animation-duration: 0.01ms` / `animation-iteration-count` hammer.
3. For `.ant-btn`: drop **transform** press feedback; keep color transitions if any from Ant Design (do not set `transition: none` on the whole button unless you only need to clear the custom transform transition).

Exact target for the global block:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
  }

  .ant-btn {
    transition: none; /* only clears the custom transform transition declared above */
  }

  .ant-btn:active:not(:disabled) {
    transform: none;
  }
}
```

Feature-level reduced-motion rules remain the source of truth for custom keyframes (login, metric cards, locate flash, softFetching — see plan 003).

## Repo conventions to follow

- Exemplar: `apps/web/src/features/departure/components/ExecutionTab.module.css:133-140` — keep background/border transitions, remove transform.
- `DESIGN.md` Elevation: 「自定义动效必须提供 prefers-reduced-motion 降级」— 降级 ≠ 全局清零.
- Do not invent a new token system.

## Steps

1. Edit `apps/web/src/styles/global.css` reduced-motion block as in Target.
2. Grep `apps/web` for `animation-duration: 0.01ms` / `0.01ms !important` — ensure no duplicate global hammer elsewhere.
3. Manually confirm feature modules still declare their own reduced-motion fallbacks (do not delete those).
4. Optional cleanup: if `DepartureOverviewStatsCards.module.css` used `animation-duration: 120ms !important` solely to beat the global nuke, you may drop the `!important` **only if** tests/feel still pass — not required for this plan.

## Boundaries

- Do NOT disable Ant Design `token.motion`.
- Do NOT remove feature-level `@media (prefers-reduced-motion: reduce)` blocks.
- Do NOT change press scale values (that is plan 005).
- Do NOT add dependencies.

## Verification

- **Mechanical**: `pnpm --filter web typecheck`.
- **Feel check**:
  - Enable Rendering → `prefers-reduced-motion: reduce`.
  - Trigger a `Spin` / table loading state: spinner (or equivalent) still communicates loading (not frozen at frame 0 / invisible).
  - Click primary buttons: no scale press; click still works.
  - Open overview (first visit): opacity fade only, no translateY (StatsCards local rule).
  - Trigger payment schedule locate: static highlight background remains (existing locate reduced-motion rule).
- **Done when**: no global `animation-duration: 0.01ms` on `*`; loading indicators still readable under reduced motion; button transform still suppressed.
