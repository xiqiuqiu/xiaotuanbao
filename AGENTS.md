# AGENTS.md

## 项目概览

小团宝：面向中小地接旅行社的多租户 B 端 SaaS 管理系统。所有业务数据按 `Organization`（租户）隔离，`User`（员工）属于唯一 Organization。领域术语与业务约定见 `CONTEXT.md`（权威术语表，改动业务概念前先读）。

## 技术栈

pnpm monorepo · 前端 Vite + React + TypeScript + Ant Design + `@tanstack/react-router` + Zustand · 后端 NestJS 11 + Prisma 6 + PostgreSQL 16 · JWT 鉴权 · Docker Compose + Caddy 部署。Node ≥ 20（用 22）。

## 目录结构

- `apps/api` — NestJS 后端；`src/modules/{auth,user,role,organization,health}`，全局路由前缀 `/api`；Prisma schema/seed 在 `apps/api/prisma`。
- `apps/web` — 前端；`src/features/*` 按业务域组织，`src/app/router` 定义路由，`src/pages`、`src/layouts`。
- `packages/shared` — 前后端共享的 `enums`/`types`/`constants`（`@xiaotuanbao/shared`）。
- `packages/config` — 共享 tsconfig。
- `docs/` — 架构、API、数据库、部署文档（入口 `docs/README.md`）；`docs/adr` 记录架构决策。

## 常用命令

命令定义在根 `package.json`。开发：`pnpm dev:api`（:3000）、`pnpm dev:web`（:5173，代理 `/api`→3000）。数据库：`pnpm db:up`（Docker Postgres，本 VM 除外见下）、`pnpm db:migrate`、`pnpm db:seed`。检查：`pnpm typecheck`（= lint，覆盖 web+api+shared）。构建：`pnpm build:web` / `pnpm build:api`。演示账号 `admin` / `admin123`。

## 关键约定

- **权限为菜单级**（Menu Permission），`Menu Key` 即前端路由路径（如 `/finance/receivable`）。用户有效权限 = 所绑 Role 权限并集，由后端经登录与 `/auth/me` 以 `menuKeys` 返回；前端仅据此过滤菜单/路由，**不硬编码权限**。系统管理类接口强制后端校验，不能只靠前端隐藏。
- **Role / Permission 为全平台共享**定义（非按 Organization 隔离），预置 `企业管理员/财务/计调` 三个 Role，Organization 创建时 seed；第一版不可自定义 Role 或改权限映射。
- 员工停用用 `status`（可恢复），软删除用 `deletedAt`，二者语义不同；第一版 UI 只做启用/停用不做删除。
- Prisma model 用 `@map`/`@@map` 映射 snake_case 表列名。

## Cursor Cloud specific instructions

小团宝 is a pnpm monorepo B2B travel-agency SaaS. Services:

| Service | Command | Port | Notes |
| ------- | ------- | ---- | ----- |
| API (NestJS + Prisma) | `pnpm dev:api` | 3000 | Serves under `/api` (e.g. `http://localhost:3000/api/health`) |
| Web (Vite + React + antd) | `pnpm dev:web` | 5173 | Vite proxies `/api` → `http://localhost:3000` |
| PostgreSQL 16 | see below | 5432 | Backend depends on this being up |

Standard commands live in `package.json` and `docs/deploy/local-development.md`; typecheck/lint = `pnpm typecheck`, build = `pnpm build:api` / `pnpm build:web`.

### Database (non-obvious in this environment)

- Unlike the docs (which use `pnpm db:up` / Docker for Postgres), this cloud VM runs **native PostgreSQL 16** instead of Docker. Do **not** run `pnpm db:up`. Start the DB with:
  `sudo pg_ctlcluster 16 main start`
  (it is not auto-started on boot). Verify with `pg_lsclusters`.
- The DB role `xiaotuanbao` / db `xiaotuanbao` already exist (password matches `.env`). The role was granted `CREATEDB` so `prisma migrate dev` can create its shadow database — without this you get Prisma error `P3014`.
- The root `.env` (copied from `.env.example`) is git-ignored and persists on the VM; recreate with `cp .env.example .env` if missing.
- Migrations/seed: `pnpm db:migrate` then `pnpm db:seed`. Seed is idempotent (re-running shows "skipped" if the org already exists). Demo login: `admin` / `admin123`.

### Gotchas

- `prisma generate` must be run after dependency installs (the `@prisma/client` postinstall cannot locate the schema and only warns). The startup update script handles this.
- Prisma commands read env via `dotenv -e ../../.env`, so the root `.env` must exist for `pnpm db:migrate` / `pnpm db:seed` / `prisma generate`.
