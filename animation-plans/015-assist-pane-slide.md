# 015 — Slide the assist pane open and closed along the same path

- **Status**: DONE（已基于 `main` `22ba35c` 重放，待合入）— 分支 `anim/015-assist-pane-from-main`；review-animations **Approve**
- **Commit**: `7c44b42`
- **Severity**: HIGH
- **Category**: Missed opportunities / Spatial consistency / Interruptibility
- **Estimated scope**: 4–6 files (`AssistPane.tsx`, `AssistPane.module.css`, `AssistPane.test.tsx`, `CreateDepartureWizard.tsx`, `CreateDepartureWizard.test.tsx`, new CSS test), medium

## Problem

The right-hand 电子化助理 column teleports. Collapsed, it is not in the tree; expanded, it mounts at full `480px`. There is no enter path, no exit path, and the main column jumps width in one frame.

```tsx
/* apps/web/src/layouts/AssistPane.tsx:14-16 — current */
  if (collapsed) {
    return null
  }
```

```css
/* apps/web/src/layouts/AssistPane.module.css:1-11 — current; no transition */
.pane {
  flex: none;
  align-self: stretch;
  width: 480px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--assist-bg);
  border-inline-start: 1px solid var(--assist-border);
  overflow: hidden;
}
```

```tsx
/* apps/web/src/layouts/MainLayout.tsx:248 — sibling of the main column; unmount = layout jump */
        <AssistPane />
```

```tsx
/* apps/web/src/features/departure/components/CreateDepartureWizard.tsx:491-495 — reset runs the instant the store flips, so chat unmounts before any exit could finish */
  useEffect(() => {
    if (assistPaneCollapsed) {
      reset()
    }
  }, [assistPaneCollapsed, reset])
```

Frequency: occasional (open/close the assistant, not 100+/day keyboard). Purpose: **spatial consistency** + **preventing a jarring change**. Same path both ways: the pane’s inline-start edge travels horizontally; exit is enter reversed. Not a fade-only, not a scale, not an overlay on desktop (design: 中间列变窄, 收起后宽度为 0, 不留窄拉手, 无 mask).

## Target

**Motion name:** slide / continuity (layout slot). Enter and exit share one path.

**Duration:** `300ms` — `DESIGN.md` Drawer/Modal band; Ant token `motionDurationSlow` is already `'0.3s'` in `apps/web/src/app/providers/AppProviders.tsx`.

**Easing:** `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))` — entering/exiting UI uses ease-out. Do **not** invent `--ease-drawer` or a second token file.

**Desktop (≥768px):** keep the pane in the flex row. Animate **slot `width` only** `0 ↔ 480px` (plus border-width `0 ↔ 1px` so a 1px leftover handle cannot remain). Inner pane is `480px`, `position: absolute; inset-inline-end: 0; inset-block: 0` so the visible slice is always the **inline-end** of the panel — the divider (slot’s inline-start edge) slides toward the screen edge on close and back on open. Do **not** also `translateX` the inner pane on desktop (that doubles the path).

Width animation is a layout property. This is an accepted exception: `transform` alone would overlay the main column and violate “中间列变窄 / 无 mask”. Left `Sider` already collapses by width. Animate only `width` and `border-inline-start-width` — never `transition: all`.

**Mobile (max-width: 767px):** the pane is already `position: absolute` overlay. Keep width at `min(480px, 100%)` and slide with `transform: translateX(100%) ↔ translateX(0)` only (percentage of the pane, not hardcoded px). Do not animate width on this breakpoint.

**Interruptibility:** CSS **transitions**, not `@keyframes`. Spamming the header toggle or close button must retarget from the current width/transform, never restart from 0.

**First paint:** no animation on load. Default CSS is collapsed (`width: 0` / mobile `translateX(100%)`). Enable `transition` only after mount (`data-motion` set in `useEffect`). Persisted-open first paint is instant 480px, then subsequent toggles animate.

**Accessibility while moving:** when `collapsed` becomes true, set `aria-hidden` and `inert` **immediately** (AT should not keep a closing pane). Visual slide can continue. `queryByRole('complementary', { name: '电子化助理' })` stays `null` while collapsed.

**Reduced motion:**

```css
@media (prefers-reduced-motion: reduce) {
  .slot[data-motion] {
    transition: none;
  }
}
```

Snap width/transform. Do not keep a slide. Opacity-only is unnecessary here (the state is “column present or not”).

**Session reset (required coupling):** `reset()` must **not** run on the same frame as collapse. If it does, `setContent(null)` blanks the chat mid-slide, and a reopen during the exit would skip bootstrap (session already null) or flash a placeholder.

- If `assistPaneCollapsed` becomes true: start a **300ms** timeout then `reset()`. If `prefers-reduced-motion: reduce`, call `reset()` immediately.
- If `assistPaneCollapsed` becomes false before the timeout fires: **clear the timeout** (interrupt). Keep the current session — mid-close reopen reuses the same `delegationToken` / `runId`.
- After a **completed** close, `reset()` runs; the next expand bootstraps a new session (existing product rule).

Keep `300` in one commented constant next to the CSS duration. Comment: `DESIGN.md Drawer/Modal 300ms; must match AssistPane.module.css`.

## Repo conventions to follow

- Easing: `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))` — exemplar `apps/web/src/styles/global.css:75` (button press) and `AppProviders.tsx` `motionEaseOutQuint`.
- Duration token: `motionDurationSlow: '0.3s'` in `AppProviders.tsx`. Prefer `var(--ant-motion-duration-slow, 0.3s)` in CSS.
- Reduced-motion: drop movement, do not nuke the whole app — exemplar `apps/web/src/lib/query/list-query-ux.module.css:6-10`.
- Personality: crisp B2B dashboard. No bounce, no spring, no blur, no stagger on this pane.
- Do **not** add Framer Motion / WAAPI / new dependencies.
- CSS test style: `apps/web/src/features/departure/pages/DepartureDetailPage.motion-css.test.ts` (read file, assert tokens and reduced-motion).

## Steps

1. **`AssistPane.tsx` — stop returning `null`.** Always render a slot. After mount, set `data-motion`. Map store `collapsed` to open/closed attributes. Immediate `aria-hidden={collapsed}` and `inert={collapsed || undefined}`. Keep `aria-label="电子化助理"` on the slot. Close button still calls `setAssistPaneCollapsed(true)`.

```tsx
/* target shape — names may match existing CSS modules */
const collapsed = useUiStore((state) => state.assistPaneCollapsed)
const [motionReady, setMotionReady] = useState(false)
useEffect(() => {
  setMotionReady(true)
}, [])

return (
  <aside
    className={styles.slot}
    aria-label="电子化助理"
    aria-hidden={collapsed}
    inert={collapsed || undefined}
    data-open={collapsed ? undefined : ''}
    data-motion={motionReady ? '' : undefined}
    style={{ '--assist-border': token.colorBorderSecondary, '--assist-bg': token.colorBgContainer, '--assist-text': token.colorTextSecondary } as CSSProperties}
  >
    <div className={styles.pane}>
      {/* existing header + body unchanged */}
    </div>
  </aside>
)
```

2. **`AssistPane.module.css` — slot + inner pane.** Replace current `.pane` width layout with:

```css
/* target */
.slot {
  flex: none;
  align-self: stretch;
  position: relative;
  width: 0;
  min-height: 0;
  overflow: hidden;
  border-inline-start: 0 solid var(--assist-border);
}

.slot[data-open] {
  width: 480px;
  border-inline-start-width: 1px;
}

.slot[data-motion] {
  transition:
    width var(--ant-motion-duration-slow, 0.3s)
      var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1)),
    border-inline-start-width var(--ant-motion-duration-slow, 0.3s)
      var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1));
}

.pane {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  width: 480px;
  display: flex;
  flex-direction: column;
  background: var(--assist-bg);
  min-height: 0;
}

/* keep .paneHeader / .body / .placeholder / .close as they are, still under .pane */

@media (max-width: 767px) {
  .slot {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 20;
    width: min(480px, 100%);
    max-width: 100%;
    border-inline-start-width: 1px;
    transform: translateX(100%);
    pointer-events: none;
  }

  .slot[data-open] {
    width: min(480px, 100%);
    transform: translateX(0);
    pointer-events: auto;
  }

  .slot[data-motion] {
    transition: transform var(--ant-motion-duration-slow, 0.3s)
      var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1));
  }

  .pane {
    position: relative;
    inset: auto;
    width: 100%;
  }

  .close {
    min-width: 44px;
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .slot[data-motion] {
    transition: none;
  }
}
```

3. **`CreateDepartureWizard.tsx` — delay `reset()` until exit completes.** Replace the immediate reset effect with a cancellable 300ms timeout (immediate under reduced motion). Do not change bootstrap-when-expanded logic.

```tsx
/* target */
const ASSIST_PANE_EXIT_MS = 300 /* keep in sync with AssistPane.module.css / DESIGN Drawer 300ms */

useEffect(() => {
  if (!assistPaneCollapsed) {
    return
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reset()
    return
  }
  const id = window.setTimeout(() => {
    reset()
  }, ASSIST_PANE_EXIT_MS)
  return () => {
    window.clearTimeout(id)
  }
}, [assistPaneCollapsed, reset])
```

4. **Tests — AssistPane.** `queryByRole('complementary', { name: '电子化助理' })` must still be `null` when collapsed (`aria-hidden` + `inert`). Add: the slot node may remain in the document; collapsed width/handle must not expose a 1px rail (assert `aria-hidden` or that role is absent). Close-button test: after click, role is gone **and** `assistPaneCollapsed === true`; do not require the node to unmount.

5. **Tests — CreateDepartureWizard `starts a new assist session when the header toggle reopens the pane`.** After collapse, **wait** until `copilot-chat` is gone (reset after 300ms) *before* expanding again. Immediate collapse→expand in the same act must **not** be used to assert a second `startAiCreateAssistSession` (that path should keep the first session). Use `await waitFor(..., { timeout: 500 })` for chat teardown, then expand and assert `toHaveBeenCalledTimes(2)` with `deleg-2` / `run-2`.

6. **New `AssistPane.motion-css.test.ts`.** Read `AssistPane.module.css` and assert:
   - `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))`
   - `var(--ant-motion-duration-slow, 0.3s)` (or literal `0.3s` / `300ms` if you inlined — then the file must still be 300ms)
   - no `transition: all`
   - no `ease-in` (except inside `ease-in-out` which must not appear here)
   - no `scale(`
   - `@media (prefers-reduced-motion: reduce)` sets `transition: none` on `.slot[data-motion]`
   - desktop path uses `width` (not `translateX` outside the 767px block)
   - inside `@media (max-width: 767px)`, `translateX(100%)` is present

7. **MainLayout tests.** `默认两列；从中间顶栏展开后…` still: collapsed → role absent; after click → role present, main content visible, no sider mask. If the slot stays mounted, `queryByRole` is the assertion — do not switch to `queryByLabelText` in a way that ignores `aria-hidden`.

## Boundaries

- Do NOT animate the left `Sider` or `.siderMask`.
- Do NOT add a mask/overlay behind the assist pane on desktop (spec: 无 mask).
- Do NOT use `scale`, bounce, spring, `filter: blur`, or Framer Motion.
- Do NOT animate `height`, `margin`, `padding`, `top`, or `left`.
- Do NOT call `reset()` on expand; do NOT start a new assist session while the pane is mid-close (timeout cancelled).
- Do NOT change CopilotKit chat internals or first-turn sending.
- Do NOT persist extra UI flags; keep `assistPaneCollapsed` as the only store field.
- If the markup you find is no longer `return null` / `width: 480px` (drift since `7c44b42`), STOP and report.

## Verification

- **Mechanical:**
  - `pnpm --filter web exec vitest run src/layouts/AssistPane.test.tsx src/layouts/AssistPane.motion-css.test.ts src/layouts/MainLayout.test.tsx src/features/departure/components/CreateDepartureWizard.test.tsx src/features/ai-assist/useAiCreateAssistBootstrap.test.ts`
  - `pnpm --filter web typecheck` (or `pnpm typecheck` if the filter script is not defined)
  - Expected: pass.

- **Feel check:** run tenant layout, open 电子化助理 from the header (and from 新建发团「AI 辅助」):
  - Open: the divider travels from the window’s inline-end inward; the main column (including its header) narrows in sync; ~300ms; starts fast (ease-out); no bounce.
  - Close: **the same divider travels back** to the inline-end; main column widens along that path; chat does not swap to「当前页尚未接入业务辅助」mid-slide.
  - Spam the header toggle: motion reverses mid-way, no snap to 0, no stuck 1px rail when settled closed.
  - Fully close, wait, reopen on `/departure/new`: new assist session (new token), not the previous chat frozen on screen.
  - Reopen **during** close: previous chat continues (same session).
  - Mobile <768px: pane slides as a unit from the right; no mask; main content remains in the tree.
  - DevTools Animations panel at 10%: confirm one path (desktop width clip from inline-end; mobile `translateX`), not a fade+slide combo, not a scale.
  - Rendering panel → `prefers-reduced-motion: reduce`: open/close snaps; no slide; role still hidden when collapsed.

- **Done when:** collapsed settled width is 0 with no handle; open/close are 300ms ease-out-quint along the same path; transitions interrupt; reduced-motion snaps; assist session still resets only after a completed close.
