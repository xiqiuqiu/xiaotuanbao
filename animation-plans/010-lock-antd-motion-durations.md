# 010 — Lock Ant Design motion durations to DESIGN.md

- **Status**: TODO
- **Commit**: 2894e53
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities / Cohesion
- **Estimated scope**: 1 file (`AppProviders.tsx`), tiny

## Problem

`DESIGN.md` Elevation specifies:

- Hover/Focus ≈ **100ms**
- 组件展开 **200ms**
- Drawer/Modal **300ms**

`AppProviders.tsx` theme currently sets colors/radii/layout but **does not** pin motion duration tokens. Ant Design defaults are typically `motionDurationFast/Mid/Slow` = `0.1s` / `0.2s` / `0.3s` — already aligned — but they are unset and can drift across upgrades.

```ts
/* apps/web/src/app/providers/AppProviders.tsx:9-57 — current theme has no motionDuration* */
const theme = {
  cssVar: {},
  token: {
    colorPrimary: '#1677FF',
    // … no motionDurationFast / Mid / Slow …
  },
  components: { /* Layout, Card, Table, Menu, Tabs — no motion overrides */ },
}
```

## Target

Explicitly lock seed/map motion durations (and optionally the ease-out-quint already used in custom CSS) in `token`:

```ts
token: {
  // …existing color/radius tokens unchanged…

  // DESIGN.md Elevation — lock antd motion scale
  motionDurationFast: '0.1s',
  motionDurationMid: '0.2s',
  motionDurationSlow: '0.3s',

  // Same curve already hand-used in custom CSS (AUDIT strong ease-out)
  motionEaseOutQuint: 'cubic-bezier(0.23, 1, 0.32, 1)',
}
```

Do **not** set `motion: false`.

Do **not** enable bounce curves (`motionEaseOutBack`) for default overlays.

If plan 007 already added `motionEaseOutQuint`, do not duplicate — merge into one edit.

## Repo conventions to follow

- Theme unique entry: `AppProviders.tsx` (`DESIGN.md` 实现边界).
- No parallel CSS token file.

## Steps

1. Add the three duration tokens (+ ease quint if not present) to `theme.token`.
2. Open a Drawer and Modal once; confirm open/close still feels ~300ms and not sluggish.
3. Optionally note in a one-line comment referencing `DESIGN.md` Elevation (keep comment short).

## Boundaries

- Do NOT per-component override every Drawer/Modal.
- Do NOT change `wireframe` or color tokens.
- Do NOT add custom CSS for antd drawer animation in this plan.

## Verification

- **Mechanical**: `pnpm --filter web typecheck`.
- **Feel check**:
  - Open/close `Drawer` (e.g. source order / transaction form): ~300ms, ease-out, no bounce.
  - Open/close `Modal`: same.
  - Dropdown/Select: still snappy (fast/mid), not slowed to 300ms.
  - DevTools: `--ant-motion-duration-slow` (or equivalent) computes to `0.3s`.
- **Done when**: motion duration tokens are explicit in `AppProviders.tsx` and match DESIGN.
