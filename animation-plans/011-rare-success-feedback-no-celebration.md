# 011 — Rare success feedback without decorative motion

- **Status**: TODO
- **Commit**: 2894e53
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 1–3 call sites (message / Alert only), tiny — **opt-in polish**

## Problem

Rare, high-emotion successes (create departure, batch generate payables, first archive/settle) currently rely on stock `message.success`. That is correct for a crisp ops tool — but some flows close a Modal/Drawer and leave the underlying view unchanged with only a toast, which can feel like “nothing happened” when the user is not looking at the message corner.

This is **not** a license for celebration animations. `DESIGN.md` forbids bounce, glow, and continuous decorative motion.

## Target

For **at most 2–3** rare mutations already using `message.success`, add one non-motion comprehension cue:

1. Prefer existing Ant Design patterns only:
   - Keep `message.success(...)`.
   - Optionally show a short-lived `Alert` type="success" **inline** on the page that already refreshed (e.g. above the table/workspace) that dismisses after ~3s **without** custom keyframes — use Ant Design Alert’s built-in close, or React state timeout with **no** enter animation beyond antd defaults.
2. Or ensure the primary list/query invalidation scrolls/focuses the new row if one exists (no animation library).

Explicit non-goals (do **not** implement):

- Confetti, bounce, `scale(0)`, blur blooms, Lottie, canvas.
- Custom `@keyframes` success flourishes.
- Changing toast position globally.

Suggested first candidates (verify still accurate at execute time):

- Batch payable generation success in execution resource flows (`formatBatchFinanceGenerationMessage` / `message.success` near `generatePayablesForSegment`).
- Create departure wizard completion success toast.

If after reading the call sites the toast + query invalidation is already obvious on screen, **mark this plan DONE with a short note** and make no code change — “already right” is an allowed outcome.

## Repo conventions to follow

- Personality: 清晰运营台 — feedback = state clarity.
- Exemplar of restrained feedback: payment schedule locate flash (existing, do not copy its 480ms into success toasts).

## Steps

1. Grep `message.success` under `apps/web/src/features/departure` and `finance` for rare completions.
2. Pick ≤2 call sites where the UI does not otherwise change obviously.
3. Add inline `Alert` or focus/scroll to the affected entity — **no custom motion CSS**.
4. If nothing qualifies, close the plan as cancelled/done with rationale in `animation-plans/README.md`.

## Boundaries

- Do NOT add motion dependencies.
- Do NOT animate success with translate/scale.
- Do NOT spam Alerts on high-frequency saves (inline edit, single field blur).

## Verification

- **Mechanical**: existing tests for those mutations still pass.
- **Feel check**: trigger the rare success once — user can tell it worked without watching the top-right toast; UI stays calm.
- **Done when**: either ≤2 call sites gained a non-motion cue, or README notes “no change needed” with evidence.
