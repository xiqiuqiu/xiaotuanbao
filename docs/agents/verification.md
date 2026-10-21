# Verification gates

How this repo keeps `main` stable. Summary for agents also lives in root `AGENTS.md`.

## Layers

| Layer | When | What | Blocks |
| ----- | ---- | ---- | ------ |
| Local L2 | Before push (hook `pnpm hooks:install`); Agent before commit / push / open PR | `pnpm typecheck`; React Doctor if web-related; permission-matrix guard if API routes changed | Dirty push / Agent handoff |
| CI C1 | Every PR and every push to `main` | `pnpm typecheck` + core unit tests + Web unit tests for Web-related changes + API e2e (E2) + deterministic browser P0 | Merge into `main` (required checks) |
| Release R1 | Version tag or manual home-image build | Core unit tests + 4-way sharded Web unit tests | Build and push release images |

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
2. **`unit-tests`** — 聚合门禁：shared、AI contracts、Agent、API 单测始终执行；仅当 `apps/web`、Web 直接依赖或测试配置变化时，4 路并行执行 Web 单元/回归测试
3. **`api-e2e`** — empty Postgres (Actions service) → `pnpm test:e2e:ci` provisions a private schema → migrate → seed → API test → drop schema; then `pnpm test:e2e:web:p0` starts a second owned schema with real API/Worker, a deterministic Agent and production Web UI. Browser P0 failures block this existing check.

CI uses **Node ≥ 22.13** (required by pnpm 11.x / `node:sqlite`). Keep local Node in the same range.

`deploy-home.yml` 对标签发布和手动镜像构建并行执行核心单测与 4 路 Web 单测；任一分片失败时不构建、不推送镜像。

`typecheck` must run `prisma generate` on a fresh checkout; committed tree does not include generated `@prisma/client` types.

### E2 e2e scope

`pnpm test:e2e:ci` runs the API Jest e2e suite **excluding** seed / demo loops:

- excluded today: `seed-demo-business-loop.e2e-spec.ts`
- run demos locally with `pnpm --filter api db:seed-demo-loop` when needed

Do **not** add path filters that skip e2e for “docs-only” or “web-only” PRs (cross-package breakage).

### Isolated API E2E database (I1)

- `postgres:16` service container
- Job writes a throwaway `.env` from `.env.example` defaults + CI `DATABASE_URL`
- CI `DATABASE_URL` sets `connection_limit=20&pool_timeout=60` so concurrent e2e (8-way) does not starve Prisma's default tiny pool on Actions runners
- Every `test:e2e`, `test:e2e:ci`, and permission-matrix invocation creates a unique `e2e_jest_*` schema, runs migrations and seed there, then drops only that owned schema.
- Runner and Jest consumer connections mark live runs. The next invocation removes interrupted schemas only when their ownership marker matches the schema name and both leases are gone; similarly named unowned schemas are never removed.
- `jest-e2e.config.js` refuses to start on `public` or another shared schema. Run focused tests through the package script so the guard and lifecycle always apply:

```bash
pnpm --filter api test:e2e -- test/departure-collaboration-recovery.e2e-spec.ts \
  -t 'covers material → review → revision → confirm → formal records without leftover collaboration data reset'
```

- `db:seed-demo-loop` is the explicit exception: it intentionally rewrites local demo business data and is excluded from the E2E gate. Do not use it as a test runner.

### CI object storage (FileStore / #156)

- `api-e2e` starts **Garage** (`dxflrs/garage:v2.3.0`, `--single-node --default-bucket`) against `docker/garage/garage.toml`
- `S3_*` come from `.env.example` sample keys; e2e must hit real S3-compatible storage — **no** silent local-disk fallback
- Locally: `pnpm db:up` + `pnpm garage:up` before FileStore-related e2e

## Branch protection (P1)

**Target policy** on `main`:

- Disallow direct pushes
- Require a pull request
- Require status checks to pass: `typecheck`, `unit-tests`, `api-e2e`
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
    "contexts": ["typecheck", "unit-tests", "api-e2e"]
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

## Browser P0 in C1; full browser and real AI suites local

`pnpm test:e2e:web:p0` is a required part of `api-e2e`: 16 browser tests in `agent-p0.spec.ts` run against owned API/Worker/database processes and scripted Agent outcomes. The runner builds the API, migrates/seeds a private schema, starts an isolated Vite instance, retains failure traces and drops its schema on exit. It does not reuse or stop developer services. CI uploads P0 evidence for seven days.

The broader browser suite (`pnpm test:e2e:web`) and 12 real-model scenarios remain local acceptance checks. Run real AI when changing the model, prompts, tools or Agent execution; they are outside CI because they require provider credentials and have variable cost/latency. See `apps/web-e2e/README.md` for commands and scenario coverage.

Agents must **not** verify UI via browser MCP / computer-use / clicking demo pages. New UI features and bugfixes add Playwright under `apps/web-e2e` and run `pnpm test:e2e:web` (or a scoped file). Prefer `getByRole` / `getByTestId`. On failure, stabilize the script then fix product until green. **Web Vitest stays a gate** — Playwright does not replace it. Amounts, permissions, and closed/archived finance gates stay on API Jest e2e; do not re-assert them in browser scripts. See root `AGENTS.md`.

```bash
# Prerequisites: db up, seed, pnpm dev:api, pnpm dev:web
pnpm --filter web-e2e exec playwright install chromium   # once per machine
pnpm test:e2e:web
pnpm test:e2e:web:p0   # isolated deterministic browser P0; CI also runs it
```

See `apps/web-e2e/README.md` and `docs/superpowers/specs/2026-08-04-web-browser-e2e-design.md`.

## Upgrade checklist (second developer)

- [ ] Branch protection: require ≥1 approving review (V1)
- [ ] Extend pre-push hook with typecheck (+ Doctor) if the team wants full L2 enforced locally
- [x] Web 单元测试基线已清零并纳入 `test:unit:ci`
- [x] Deterministic browser P0 is part of the existing api-e2e required gate; broader browser/live AI remains local
