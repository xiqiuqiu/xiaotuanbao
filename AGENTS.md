# Agent instructions

## Agent skills

### Issue tracker

GitHub Issues on `xiqiuqiu/xiaotuanbao` via `gh` CLI; external PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles mapped 1:1 to GitHub labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

### UI design

Root `DESIGN.md` — Ant Design v6 visual language constraints for `apps/web`. Follow it when building or changing UI.

Page compliance audit + catalog fix: `.agents/skills/ui-audit` (`/ui-audit`).

### Verification (main stability)

Layered gates — details: `docs/agents/verification.md`.

- **Before commit / push / open PR:** run `pnpm typecheck`. If the diff vs `origin/main` touches `apps/web/**` or `packages/shared/**`, also run `npx react-doctor@latest --verbose --scope changed` and ensure the score does not regress. If it touches API routes/permissions (`apps/api/src/**` controllers/modules/guards or `packages/shared` capabilities), run `pnpm check:permission-matrix`; when the permission surface changed on purpose, run `pnpm gen:permission-matrix` and commit the updated snapshot.
- **Do not** run full API e2e locally by default; CI owns it (`typecheck` + `api-e2e` required on `main`).
- **Merge to `main`:** PR only (no direct push); required checks must be green. Local `--no-verify` does not bypass GitHub.
