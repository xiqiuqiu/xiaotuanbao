# Verification gates

How this repo keeps `main` stable. Summary for agents also lives in root `AGENTS.md`.

## Layers

| Layer | When | What | Blocks |
| ----- | ---- | ---- | ------ |
| Local L2 | Before push (hook `pnpm hooks:install`); Agent before commit / push / open PR | `pnpm typecheck`; React Doctor if web-related; permission-matrix guard if API routes changed | Dirty push / Agent handoff |
| CI C1 | Every PR and every push to `main` | `pnpm typecheck` + API e2e (E2) | Merge into `main` (required checks) |

There is **no** hard pre-commit gate. Full API e2e is **not** required on every local commit.

## Local L2

```bash
pnpm typecheck
```

If the diff vs `origin/main` touches `apps/web/**` or `packages/shared/**`:

```bash
npx react-doctor@latest --verbose --scope changed
```

**Pass (R1):** score must not regress vs the base branch (`origin/main`).

### Permission-matrix guard (R2)

`apps/api` 的路由/权限面固化在 `test/permission-matrix.e2e-spec.ts` 的 golden 快照里。新增或改动端点后必须同步快照，否则 `api-e2e` 会红；坏快照一旦进 `main`，后续每次提交都会持续飘红（历史上 `GET /api/source-orders`、`GET /api/account-generation-gaps` 均踩过）。

若 diff vs `origin/main` 触及 `apps/api/src/**` 的 `*.controller.ts` / `*.module.ts` / guard / permission / decorator，或 `packages/shared/src` 的能力/权限/菜单清单：

```bash
pnpm check:permission-matrix   # 聚焦跑 permission-matrix 单 spec（约数秒，需本地 DB）
```

**权限面确有变化时**（新增端点/改 key），确认无误后重生成并提交快照：

```bash
pnpm gen:permission-matrix     # = api test:permission-matrix:update（jest -u 单 spec）
```

DB 不可达时守卫只告警不拦截，e2e 最终由 CI 兜底。

## CI C1

Workflow: [`.github/workflows/verify.yml`](../../.github/workflows/verify.yml)

Jobs / checks (names must match branch protection):

1. **`typecheck`** — shared build → `prisma generate` → `pnpm typecheck`
2. **`api-e2e`** — empty Postgres (Actions service) → migrate → seed → `pnpm test:e2e:ci`

CI uses **Node ≥ 22.13** (required by pnpm 11.x / `node:sqlite`). Keep local Node in the same range.

`typecheck` must run `prisma generate` on a fresh checkout; committed tree does not include generated `@prisma/client` types.

### E2 e2e scope

`pnpm test:e2e:ci` runs the API Jest e2e suite **excluding** seed / demo loops:

- excluded today: `seed-demo-business-loop.e2e-spec.ts`
- run demos locally with `pnpm --filter api db:seed-demo-loop` when needed

Do **not** add path filters that skip e2e for “docs-only” or “web-only” PRs (cross-package breakage).

### CI database (I1)

- `postgres:16` service container
- Job writes a throwaway `.env` from `.env.example` defaults + CI `DATABASE_URL`
- CI `DATABASE_URL` sets `connection_limit=20&pool_timeout=60` so concurrent e2e (8-way) does not starve Prisma's default tiny pool on Actions runners
- `prisma migrate deploy` + `prisma:db:seed` on a fresh DB each run

### CI object storage (FileStore / #156)

- `api-e2e` starts **Garage** (`dxflrs/garage:v2.3.0`, `--single-node --default-bucket`) against `docker/garage/garage.toml`
- `S3_*` come from `.env.example` sample keys; e2e must hit real S3-compatible storage — **no** silent local-disk fallback
- Locally: `pnpm db:up` + `pnpm garage:up` before FileStore-related e2e

## Branch protection (P1)

**Target policy** on `main`:

- Disallow direct pushes
- Require a pull request
- Require status checks to pass: `typecheck`, `api-e2e`
- Do **not** require approving reviews yet (**V2**); when a second developer joins, raise to **V1** (at least one non-author Approve) and update this section

### GitHub plan blocker (current)

`xiqiuqiu/xiaotuanbao` is a **private** repo. Classic branch protection and repository rulesets return HTTP 403 until the account/org has **GitHub Pro** (or the repo is public). Until that is unlocked, P1 cannot be enforced by GitHub — treat the same rules as **team policy** + CI visibility:

- Still open PRs for changes meant for `main` (even as a solo habit)
- Do not merge/push over a red `Verify` workflow
- Unlock real P1 by upgrading to Pro (preferred) or making the repo public (usually undesirable)

### Apply with `gh` (repo admin, after Pro)

After the verify workflow has run at least once on `main` (so check names exist):

```bash
gh api -X PUT "repos/xiqiuqiu/xiaotuanbao/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["typecheck", "api-e2e"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

Or GitHub UI: **Settings → Branches → Branch protection rule** for `main`.

## Exceptions (X2)

- Local `--no-verify` is allowed for rare local issues (network, broken Doctor CLI). Do not treat it as normal workflow.
- **Required CI checks cannot be skipped** to merge into `main`.
- If CI is wrongfully red: fix CI or the product code; use a revert PR for emergencies — do not disable protection casually.

## Agent obligations (A1 + A2)

Before the user asks to **commit**, **push**, or **open a PR**:

1. Run `pnpm typecheck` and fix failures.
2. If the change set vs `origin/main` includes `apps/web/**` or `packages/shared/**`, run React Doctor (`--scope changed`) and fix score regressions.
3. If the change set touches API routes/permissions (see R2), run `pnpm check:permission-matrix`; if the permission surface changed on purpose, `pnpm gen:permission-matrix` and commit the updated snapshot.
4. Do **not** run full API e2e locally by default (slow, needs DB). Rely on CI unless the user asks, or the change is clearly high-risk for finance / settlement / auth paths — then prefer a focused e2e file over the full suite.

## Pre-push hook

Tracked at [`.githooks/pre-push`](../../.githooks/pre-push); enable once per clone:

```bash
pnpm hooks:install   # git config core.hooksPath .githooks
```

Currently runs the **permission-matrix guard (R2)** — the recurring `main`-reddening foot-gun. Bypass with `git push --no-verify` only for network/env issues. typecheck + Doctor remain agent/manual L2 for now (Doctor via `npx` is slow/network-bound; add to the hook if desired).

## Optional local browser E2E (not C1)

Manual Playwright smoke + thin create-departure flow. **Not** a required CI check; does not block merge.

```bash
# Prerequisites: db up, seed, pnpm dev:api, pnpm dev:web
pnpm --filter web-e2e exec playwright install chromium   # once per machine
pnpm test:e2e:web
```

See `apps/web-e2e/README.md` and `docs/superpowers/specs/2026-08-04-web-browser-e2e-design.md`.

## Upgrade checklist (second developer)

- [ ] Branch protection: require ≥1 approving review (V1)
- [ ] Extend pre-push hook with typecheck (+ Doctor) if the team wants full L2 enforced locally
- [ ] Optional: add web unit tests as a third required check (was deferred from C1)
- [ ] Optional: promote browser E2E smoke to a non-blocking or required CI job after the suite is stable
