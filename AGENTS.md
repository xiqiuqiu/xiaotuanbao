# AGENTS.md

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
