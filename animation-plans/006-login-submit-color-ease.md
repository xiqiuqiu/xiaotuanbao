# 006 — Login submit: ease for color, ease-out for transform

- **Status**: TODO
- **Commit**: 2894e53
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 file (`LoginPage.module.css`), tiny

## Problem

Hover/color changes should use `ease`. The login submit button uses the strong UI ease-out curve for `background-color` as well as `transform`.

```css
/* apps/web/src/pages/LoginPage.module.css:233-249 — current */
.submit {
  height: 48px;
  background: var(--ant-color-primary-active);
  font-size: 16px;
  font-weight: 600;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.submit:hover,
.submit:focus-visible {
  background: var(--ant-color-primary);
}

.submit:active {
  transform: scale(0.97);
}
```

The reduced-motion branch already does the right split:

```css
/* apps/web/src/pages/LoginPage.module.css:298-300 — current (correct) */
.submit {
  transition: background-color 100ms ease;
}
```

## Target

```css
.submit {
  height: 48px;
  background: var(--ant-color-primary-active);
  font-size: 16px;
  font-weight: 600;
  transition:
    transform 100ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 100ms ease;
}
```

Notes:

- Transform duration `100ms` aligns with plan 005 / `DESIGN.md` Hover≈100ms. If executing this plan **before** 005, still use `100ms` (do not keep 160ms).
- Easing for transform: keep strong ease-out (or ant var after plan 007).
- Easing for background: **`ease`** only.
- Leave reduced-motion block as-is (`background-color 100ms ease`, no transform).

## Repo conventions to follow

- Exemplar property split: `ExecutionTab.module.css` uses `ease` for colors and ease-out cubic-bezier for transform.
- Hover gated at `LoginPage.module.css:494` with `(hover: hover) and (pointer: fine)` — do not remove.

## Steps

1. Update `.submit` `transition` declaration to Target.
2. Do not change colors, heights, or layout.

## Boundaries

- Do NOT remove `loginRise` in this plan.
- Do NOT change brand panel animations.
- Do NOT add new CSS variables.

## Verification

- **Mechanical**: typecheck.
- **Feel check**:
  - Hover submit: color eases softly (not snappy ease-out).
  - Press: scale still ease-out, ~100ms.
  - Animations panel: two properties, two different timing functions.
- **Done when**: `background-color` transition uses `ease`; transform keeps ease-out.
