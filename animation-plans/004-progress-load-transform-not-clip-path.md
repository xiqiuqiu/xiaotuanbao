# 004 — Animate progress reveal with transform, not clip-path

- **Status**: DONE
- **Commit**: 2894e53
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 CSS file (+ optional test string assert), small

## Problem

Overview progress reveal animates `clip-path`, which is more expensive than `transform`/`opacity` (paint-heavy). Audit rule: animate transform and opacity only.

```css
/* apps/web/src/features/departure/components/DepartureOverviewStatsCards.module.css:14-25 — current */
.progressLoad :global(.ant-progress-track) {
  animation: progress-load 240ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes progress-load {
  from {
    clip-path: inset(0 100% 0 0);
  }

  to {
    clip-path: inset(0 0 0 0);
  }
}
```

Gated by `animateProgress` / enter flag (plan 001) — still worth fixing for first paint and Safari cost.

## Target

Left-origin horizontal reveal via `scaleX`:

```css
.progressLoad :global(.ant-progress-track) {
  transform-origin: left center;
  animation: progress-load 240ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes progress-load {
  from {
    transform: scaleX(0);
  }

  to {
    transform: scaleX(1);
  }
}
```

Under reduced motion, keep existing rule that disables this animation (`animation: none` on `.progressLoad …`).

Easing stays `cubic-bezier(0.23, 1, 0.32, 1)` (or `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))` if plan 007 already landed).

Duration stays **240ms** (under 300ms UI budget).

## Repo conventions to follow

- Progress class toggled in TSX — do not change semantics of when it runs (coordinate with plan 001 if both touch this file).
- Exemplar transform press: `global.css` `.ant-btn:active { transform: scale(0.97); }`.

## Steps

1. Replace `clip-path` keyframes with `scaleX` as in Target; set `transform-origin: left center` on the animated track.
2. Visually confirm Ant Design progress track does not overflow oddly; if the track’s parent clips incorrectly, add `overflow: hidden` on `.progressLoad :global(.ant-progress)` **only if needed** after feel-check (do not preemptively restyle Progress).
3. Update any test that asserts on CSS source containing `clip-path` (grep `progress-load` / `clip-path` in tests).
4. Keep reduced-motion `animation: none` for progress.

## Boundaries

- Do NOT animate width/height of the progress bar.
- Do NOT change Statistic percent text timing (tests require values visible immediately — see `DepartureOverviewStatsCards.test.tsx`).
- Do NOT introduce JS animation libraries.

## Verification

- **Mechanical**: `pnpm --filter web test -- DepartureOverviewStatsCards`.
- **Feel check**:
  - First overview visit with animate on: track grows from left → full in ~240ms; percent label already correct at start.
  - Animations panel 10%: property is `transform`, not `clip-path`.
  - Reduced motion: no track scale animation.
- **Done when**: no `clip-path` in `progress-load`; reveal still reads left-to-right; tests green.
