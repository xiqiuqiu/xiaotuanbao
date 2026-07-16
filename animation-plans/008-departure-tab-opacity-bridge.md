# 008 — Soft opacity bridge for departure detail tab content

- **Status**: TODO
- **Commit**: 2894e53
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 2–3 files (`DepartureDetailPage` + small CSS module), small

## Problem

`Tabs` use `destroyOnHidden`, so switching tabs unmounts/remounts children. Content pops in with no bridge. Plan 001 correctly **removes** decorative card re-entrance; this plan adds a **short, non-blocking opacity** bridge so the swap is less jarring — without bringing back stagger/translate.

```tsx
/* apps/web/src/features/departure/pages/DepartureDetailPage.tsx:288-292 — current */
<Tabs
  activeKey={activeTab}
  onChange={handleTabChange}
  items={tabItems}
  destroyOnHidden
/>
```

## Target

- On tab panel mount, opacity `0 → 1` in **100–120ms** with `ease` (comprehension fade, not movement).
- **No** translateY, **no** stagger, **no** scale.
- Must not delay pointer events on the tab content (opacity only; no `animation-fill` that blocks interaction longer than 120ms).
- Reduced motion: either instant `opacity: 1` or keep a ≤100ms opacity snap — do **not** use translate.

Suggested CSS (new module colocated with the page or a tiny shared tab helper):

```css
.tabPaneEnter {
  animation: tab-pane-fade 120ms ease both;
}

@keyframes tab-pane-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .tabPaneEnter {
    animation: none;
  }
}
```

Wire by wrapping each tab’s `children` in a `div className={styles.tabPaneEnter}` **or** applying the class on a single wrapper around `Tabs` content via `renderTabBar` / items mapping — prefer mapping `items` children once so every tab gets the same bridge.

Do **not** remove `destroyOnHidden` unless a separate performance investigation requires it; this plan assumes destroy-on-hide stays.

## Repo conventions to follow

- Soft opacity pattern: `list-query-ux.module.css` (`120ms ease` opacity).
- Depends on **plan 001** landing first so overview does not stack fade + metric-card stagger on first visit. After 001, first overview visit may still run gated metric enter **and** this fade — if that feels double, skip the wrapper fade only for overview **or** keep fade at 100ms and accept slight overlap (feel-check decides; prefer single 120ms fade + gated metric enter only on first visit).

## Steps

1. Confirm plan 001 is done (or gate metric enter in the same PR).
2. Add a small CSS module for the fade.
3. Wrap tab children in `DepartureDetailPage` with the enter class.
4. Add reduced-motion: no animation.
5. Feel-check double-motion on first overview; if busy, remove fade for overview tab only.

## Boundaries

- Do NOT reintroduce translateY stagger on metric cards.
- Do NOT animate height of tab panels.
- Do NOT add Framer Motion `AnimatePresence`.
- Do NOT change finance / partner detail tabs in this plan (departure detail only).

## Verification

- **Mechanical**: typecheck; existing departure detail tests still pass.
- **Feel check**:
  - Switch 概览 ↔ 执行 ↔ 财务: content soft-fades ≤120ms, immediately clickable.
  - After 001: returning to 概览 has fade **without** card rise.
  - Reduced motion: no fade (instant).
- **Done when**: tab switches no longer hard-cut; no decorative translate on the bridge.
