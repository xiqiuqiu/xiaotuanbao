# 007 — Consolidate hand-copied ease-out via Ant Design CSS vars

- **Status**: TODO
- **Commit**: 2894e53
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: ~6 CSS files + optional `AppProviders.tsx` comment/token lock, small–medium

## Problem

The strong ease-out curve is hand-typed ~9 times:

`cubic-bezier(0.23, 1, 0.32, 1)`

Locations (at commit 2894e53):

- `apps/web/src/styles/global.css:65`
- `apps/web/src/pages/LoginPage.module.css:88,177,238-239`
- `apps/web/src/features/departure/components/DepartureOverviewStatsCards.module.css:2,15`
- `apps/web/src/features/finance/components/PaymentScheduleWorkspace.module.css:27`
- `apps/web/src/features/departure/components/ExecutionTab.module.css:92`

`DESIGN.md` forbids inventing a **parallel** CSS token system. Ant Design already seeds this curve as `motionEaseOutQuint` (default `cubic-bezier(0.23, 1, 0.32, 1)`), and the app enables `cssVar: {}` in `AppProviders.tsx`.

## Target

1. Prefer Ant Design CSS variables already injected by ConfigProvider, with literal fallback:

```css
var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))
```

2. Replace every custom-motion use of the bare cubic-bezier above with that `var(...)`.
3. Leave hover/color transitions on bare `ease` (correct per audit) — do **not** force ease-out on color.
4. Optionally lock the seed in `AppProviders.tsx` theme token (documentation + drift guard):

```ts
token: {
  // …existing…
  motionEaseOutQuint: 'cubic-bezier(0.23, 1, 0.32, 1)',
  motionDurationFast: '0.1s',   // DESIGN Hover/Focus ≈100ms
  motionDurationMid: '0.2s',    // DESIGN 组件展开 200ms
  motionDurationSlow: '0.3s',   // DESIGN Drawer/Modal 300ms
}
```

If CSS var name differs at runtime (verify in DevTools computed styles on `:root` / `html`), STOP and report the actual `--ant-*` name rather than inventing `--ease-out`.

## Repo conventions to follow

- Theme single entry: `apps/web/src/app/providers/AppProviders.tsx`.
- Existing color usage already uses `var(--ant-color-*)` in CSS modules (e.g. `LoginPage.module.css`, `TableNameLink.module.css`) — same pattern for motion.
- Do **not** add `src/styles/tokens.css` or `--ease-out` custom properties on `:root` unless ant vars are confirmed unavailable — that would violate DESIGN.

## Steps

1. Run the app once; in DevTools confirm the CSS variable name for `motionEaseOutQuint` (expect `--ant-motion-ease-out-quint`).
2. Replace bare cubic-beziers in the listed files with `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))`.
3. Optionally add the `token` locks in `AppProviders.tsx` as in Target (plan 010 overlaps duration locks — if 010 will set durations, only set `motionEaseOutQuint` here).
4. Grep `apps/web` for `cubic-bezier(0.23, 1, 0.32, 1)` afterward — remaining hits should only be inside `var(..., fallback)`.

## Boundaries

- Do NOT introduce Framer Motion.
- Do NOT rename Ant tokens or wrap them in a second naming layer (`--app-ease-out` → ant var).
- Do NOT change durations in this plan except via optional AppProviders locks shared with plan 010 — prefer letting 010 own duration tokens if both execute.
- If `cssVar: {}` does not expose motion vars, STOP; do not invent a parallel system — report and keep literals.

## Verification

- **Mechanical**: `pnpm --filter web typecheck`; grep shows no bare duplicate bezier outside fallbacks.
- **Feel check**: button press, login rise, overview enter, locate flash, segment press — curves feel identical to before (same cubic-bezier).
- **Done when**: custom motion easings reference the ant CSS var (with fallback); no new parallel token file.
