# 009 — Soft opacity when execution segment selection swaps the resource pane

- **Status**: DONE
- **Commit**: 2894e53
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 2–3 files (`ExecutionTab.tsx` / `ExecutionResourcePane.tsx` + CSS), small

## Problem

Selecting a different itinerary segment swaps the right-hand resource table via a new query (`['segment-resources', segment.id]`). The pane content hard-cuts. Segment list already has press/hover feedback; the **result** of selection lacks a spatial/comprehension bridge.

Relevant mount:

```tsx
/* apps/web/src/features/departure/components/ExecutionTab.tsx — resource pane receives `segment` */
/* ExecutionResourcePane uses useQuery({ queryKey: ['segment-resources', segment.id], ... }) */
```

Frequency: tens of times/day on the execution tab — keep motion **minimal**.

## Target

- When `segment.id` changes, apply a **100ms** opacity bridge on the resource pane body (or the table wrapper): `opacity 0.65 → 1` or a mount fade `0 → 1` lasting **≤100ms** with `ease`.
- Prefer CSS transition on a class toggled when `segment.id` changes, or `key={segment.id}` on a wrapper with a short `@keyframes` opacity-only enter.
- **No** translate, scale, or stagger.
- Reduced motion: keep a static soft opacity if using the softFetching pattern, or skip animation entirely but do not block understanding of loading (`Spin` already exists while `isLoading`).

Recommended approach (interruptible, matches list soft-fetch):

```css
/* e.g. ExecutionTab.module.css */
.resourcePaneSoft {
  opacity: 0.65;
  transition: opacity 100ms ease;
}

.resourcePaneReady {
  opacity: 1;
  transition: opacity 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .resourcePaneSoft,
  .resourcePaneReady {
    transition: none;
  }
}
```

Toggle `resourcePaneSoft` while `isFetching && !isLoading` for the new segment (or while placeholder), then `resourcePaneReady` when settled — **or** simpler: on `segment.id` change, one-shot 100ms opacity enter on a `key={segment.id}` wrapper.

Do not exceed **100ms** (DESIGN Hover/Focus band; high-frequency path).

## Repo conventions to follow

- Soft fetch opacity: `list-query-ux.module.css` / `listSoftFetchingClassName`.
- Segment press already in `ExecutionTab.module.css` — keep press and pane bridge separate classes.
- Personality: crisp; this is state indication, not delight.

## Steps

1. Read `ExecutionTab.tsx` where `ExecutionResourcePane` is rendered; identify the wrapper.
2. Implement the ≤100ms opacity bridge keyed to `segment.id` (prefer transition over keyframes for interruptibility when clicking segments rapidly).
3. Ensure rapid segment clicking retargets smoothly (transition) rather than restarting a long keyframe.
4. Add reduced-motion: `transition: none` (opacity may jump).
5. Confirm `Spin` / empty states still readable.

## Boundaries

- Do NOT animate table row layout or column widths.
- Do NOT add springs / Framer Motion.
- Do NOT change segment list press styles (plan 005).
- Do NOT apply this to every table in the app — execution resource pane only.

## Verification

- **Mechanical**: `pnpm --filter web test -- ExecutionTab` (url-sync / create-select / layout tests).
- **Feel check**:
  - Click several segments quickly: pane soft-dims or short-fades without feeling laggy; no bounce.
  - Animations panel: only opacity, ≤100ms.
  - Reduced motion: no lingering transition.
- **Done when**: segment changes no longer hard-cut the resource pane; duration ≤100ms; transform unused.
