# 005 — Unify press feedback scale and duration

- **Status**: TODO
- **Commit**: 2894e53
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 2–3 files (`global.css`, `ExecutionTab.module.css`, optionally `LoginPage.module.css`), small

## Problem

Press feedback disagrees across the app:

```css
/* apps/web/src/styles/global.css:64-69 — current */
.ant-btn {
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.ant-btn:active:not(:disabled) {
  transform: scale(0.97);
}
```

```css
/* apps/web/src/features/departure/components/ExecutionTab.module.css:89-96 — current */
.segmentItem {
  transition:
    background-color 100ms ease,
    border-color 100ms ease,
    transform 100ms cubic-bezier(0.23, 1, 0.32, 1);
}
.segmentItem:has(.segmentItemSelect:active) {
  transform: scale(0.98);
}
```

```css
/* apps/web/src/pages/LoginPage.module.css:238-248 — current (transform half) */
.submit {
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.submit:active {
  transform: scale(0.97);
}
```

`DESIGN.md` Elevation: Hover/Focus ≈ **100ms**. Audit press budget: **100–160ms**, scale **0.95–0.98** (prefer ~0.97).

## Target

One press recipe everywhere custom press exists:

| Property | Value |
| --- | --- |
| Duration | `100ms` |
| Easing (transform) | `cubic-bezier(0.23, 1, 0.32, 1)` or `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))` if plan 007 done |
| Scale | `0.97` |

Apply to:

1. `.ant-btn` in `global.css`
2. `.segmentItem` transform transition + `:active` scale in `ExecutionTab.module.css` (keep background/border at `100ms ease`)
3. `.submit` transform transition + `:active` in `LoginPage.module.css` (background-color easing is plan 006 — while editing, set background to `ease` if 006 not done yet to avoid a second pass)

Reduced-motion: keep existing “no transform” behavior in all three files.

## Repo conventions to follow

- Global button press is the canonical place (`global.css`).
- Segment items are not `.ant-btn` — they need the mirrored values in `ExecutionTab.module.css`.
- Do not create `--press-*` tokens (`DESIGN.md`: 不新增平行 CSS Token 系统). Duplicate the literal values (or ant CSS var for easing only after 007).

## Steps

1. `global.css`: change `160ms` → `100ms` on `.ant-btn` transform transition; keep `scale(0.97)`.
2. `ExecutionTab.module.css`: change transform duration `100ms` (already) and `scale(0.98)` → `scale(0.97)`.
3. `LoginPage.module.css`: change transform duration `160ms` → `100ms`; keep `scale(0.97)`.
4. Confirm reduced-motion blocks still strip transform only.

## Boundaries

- Do NOT change hover background colors or segment selected styles.
- Do NOT add `:active` scale to arbitrary clickable rows outside these three surfaces.
- Do NOT touch locate flash or metric-card enter.

## Verification

- **Mechanical**: typecheck; no CSS module test required unless one asserts `0.98`.
- **Feel check**:
  - Mash primary buttons and segment rows: same subtle squash, ~100ms, no mushy delay.
  - Animations panel: transform duration 100ms, scale to 0.97.
  - Reduced motion: no scale on either control.
- **Done when**: no `scale(0.98)` and no `160ms` transform press remain on these three surfaces.
