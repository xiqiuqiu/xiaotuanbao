# 001 — Gate overview metric-card enter to first visit

- **Status**: DONE
- **Commit**: 2894e53
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 4 files (CSS + TSX + page + tests), small

## Problem

Departure overview metric cards replay a decorative stagger entrance every time the「概览」tab remounts. Progress animation is already session-gated; card enter is not. With `destroyOnHidden`, leaving and returning to overview remounts the tree and re-triggers the animation — high-frequency noise on an ops dashboard.

```css
/* apps/web/src/features/departure/components/DepartureOverviewStatsCards.module.css:1-2 — current */
.metricCard {
  animation: metric-card-enter 180ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
```

```tsx
/* apps/web/src/features/departure/pages/DepartureDetailPage.tsx:288-292 — current */
<Tabs
  activeKey={activeTab}
  onChange={handleTabChange}
  items={tabItems}
  destroyOnHidden
/>
```

```tsx
/* apps/web/src/features/departure/pages/DepartureDetailPage.tsx:173-176 — current */
<DepartureOverview
  departure={departure}
  animateProgress={!animatedOverviewDepartureIds.current.has(departure.id)}
/>
```

`animateProgress` only gates `.progressLoad` (see `DepartureOverviewStatsCards.tsx` progress helpers). Every `Card` still always gets `styles.metricCard` (e.g. `SummaryCard` at line ~216).

## Target

- Metric-card enter + stagger play **only** on the same first-visit gate as progress (session `Set` of departure ids already in `DepartureDetailPage`).
- Subsequent overview remounts: cards appear with **no** `metric-card-enter` / no stagger delays.
- Progress behavior unchanged: still first-visit only via the same boolean.
- Reduced-motion path for cards when gated on: keep existing `metric-card-fade` (opacity only) from the same stylesheet.

Exact CSS shape:

```css
/* target — only when enter is gated on */
.metricCardEnter {
  animation: metric-card-enter 180ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

/* .metricCard becomes a non-animating base class (layout-only), OR
   cards omit the enter class when animateEnter is false */
```

Prop naming: prefer renaming `animateProgress` → `animateEnter` (or add `animateEnter` and drive both card class + progress from it). Do not leave two independent booleans that can drift.

## Repo conventions to follow

- Session gate already lives in `DepartureDetailPage.tsx` via `animatedOverviewDepartureIds` ref + `useEffect` that adds the id when `activeTab === 'overview'`.
- Exemplar of correct gating: progress uses `className={animate ? styles.progressLoad : undefined}` in `DepartureOverviewStatsCards.tsx` (~line 131). Imitate that for cards.
- Personality: crisp ops UI — decorative enter is allowed once per departure visit, not on every tab toggle (`DESIGN.md` Elevation: 动效只表达状态；禁止连续装饰动画).

## Steps

1. In `DepartureOverviewStatsCards.module.css`: move the enter animation from `.metricCard` onto a new class `.metricCardEnter` (keep keyframes `metric-card-enter` / stagger selectors updated to `.metricCardEnter`). Keep `.metricCard` as a plain class if still needed for non-motion styling, or drop it if it only existed for animation.
2. Update stagger selectors (`.firstRow … .metricCard` → `.metricCardEnter`) so delays only apply when enter is active.
3. In `DepartureOverviewStatsCards.tsx`: rename/extend prop so one boolean gates both progress and card enter. Apply `styles.metricCardEnter` only when that boolean is true (every Card that currently uses `styles.metricCard`).
4. Thread the prop through `DepartureOverview.tsx` and `DepartureDetailPage.tsx` (same expression as today's `animateProgress`).
5. Update `DepartureOverviewStatsCards.test.tsx`: assert enter class present when animate flag true; absent when false. Keep existing progress assertions.
6. Do **not** remove `destroyOnHidden` in this plan (see plan 008 for tab bridge).

## Boundaries

- Do NOT change finance locate flash, login page, or ExecutionTab motion.
- Do NOT remove `destroyOnHidden` here.
- Do NOT add Framer Motion or new dependencies.
- Do NOT invent a parallel motion token system (`DESIGN.md`).
- If `animateProgress` is referenced outside these files and renaming breaks callers, STOP and report.

## Verification

- **Mechanical**: `pnpm --filter web test -- DepartureOverviewStatsCards` and `pnpm --filter web typecheck`.
- **Feel check**:
  - Open a departure → 概览: cards rise once with ~30–120ms stagger; progress reveals once.
  - Switch to 执行 then back to 概览: cards appear instantly, **no** rise/stagger.
  - Soft-reload same departure in session: no re-enter (Set still holds id). Navigate to a different departure: enter plays once for the new id.
  - DevTools Animations at 10%: confirm second overview visit has no `metric-card-enter`.
  - `prefers-reduced-motion: reduce`: first visit uses opacity-only fade (existing rule), no translateY.
- **Done when**: tab toggling never replays card enter; first visit still has gated enter + progress.
