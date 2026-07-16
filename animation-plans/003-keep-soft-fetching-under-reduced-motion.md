# 003 — Keep softFetching opacity under reduced motion

- **Status**: DONE
- **Commit**: 2894e53
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`list-query-ux.module.css`), tiny

## Problem

List pagination soft-fetch hint dims the table via opacity. Under reduced motion the hint is removed entirely (`opacity: 1; transition: none`), so users lose a comprehension cue on a high-frequency path (many list pages).

```css
/* apps/web/src/lib/query/list-query-ux.module.css:1-10 — current */
.softFetching {
  opacity: 0.65;
  transition: opacity 120ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .softFetching {
    opacity: 1;
    transition: none;
  }
}
```

Consumers (do not change call sites unless needed): `DeparturesPage`, `PaymentScheduleWorkspace`, `TransactionsWorkspace`, `VerificationsWorkspace`, `PartnersPage`, `SuppliersPage`, `EmployeesPage` via `listSoftFetchingClassName`.

## Target

Reduced motion = fewer/gentler animations, **not** zero comprehension feedback. Keep the opacity state; shorten or drop only the transition timing if desired.

```css
/* target */
.softFetching {
  opacity: 0.65;
  transition: opacity 120ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .softFetching {
    opacity: 0.65;
    transition: none; /* instant dim is fine; do not force opacity: 1 */
  }
}
```

Do **not** change the default (non-reduced) `0.65` / `120ms ease` unless feel-check proves too strong.

## Repo conventions to follow

- Loading semantics documented in `apps/web/src/lib/query/list-query-ux.ts` — soft hint only while paginating with placeholder rows.
- Exemplar of reduced-motion keeping comprehension: `PaymentScheduleWorkspace.module.css:36-40` (static background instead of wiping the cue).

## Steps

1. Edit `apps/web/src/lib/query/list-query-ux.module.css` reduced-motion block to match Target.
2. If `list-query-ux.test.ts` asserts on class names only, no test change. If any CSS snapshot test exists, update it.
3. Do not alter `resolveListTableLoading` logic.

## Boundaries

- Do NOT apply softFetching on filter changes (hard loading must stay hard — see comments in `list-query-ux.ts`).
- Do NOT animate layout properties.
- Do NOT touch global.css in this plan (plan 002).

## Verification

- **Mechanical**: `pnpm --filter web test -- list-query-ux` (if present) + typecheck.
- **Feel check**:
  - Normal: paginate a long list → table dims to ~0.65 then restores.
  - `prefers-reduced-motion: reduce`: paginate → table **still** dims to ~0.65 instantly (no fade required); cue remains visible.
- **Done when**: reduced-motion path no longer forces `opacity: 1` on `.softFetching`.
