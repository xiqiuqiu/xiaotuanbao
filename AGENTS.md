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

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
