# 本地开发指南

## 前置要求

- Node.js >= 20（推荐 22+，与 Docker 构建一致）
- pnpm（通过 `corepack enable` 启用）
- Docker Desktop（用于 PostgreSQL）

## 首次启动

```bash
pnpm install
cp .env.example .env
pnpm db:up          # 启动 PostgreSQL（5432）
pnpm db:migrate     # 执行数据库迁移
pnpm db:seed        # 初始化演示数据
```

## 日常开发

开两个终端：

```bash
# 终端 1 — 后端 http://localhost:3000
pnpm dev:api

# 终端 2 — 前端 http://localhost:5173
pnpm dev:web
```

前端 Vite 会将 `/api` 代理到 `http://localhost:3000`。

## 演示账号

| 用户名 | 密码 |
| ------ | ---- |
| admin | admin123 |

## 常用命令

| 命令 | 说明 |
| ---- | ---- |
| `pnpm dev:web` | 启动前端 |
| `pnpm dev:api` | 启动后端 |
| `pnpm db:up` | 启动 PostgreSQL |
| `pnpm db:down` | 停止 PostgreSQL |
| `pnpm db:migrate` | 开发迁移（`prisma migrate dev`） |
| `pnpm db:seed` | 初始化演示数据 |
| `pnpm --filter api db:reset-agent-run-data` | 仅开发环境重置 Agent 运行数据；不删除 Departure、客源、财务或正式附件 |
| `pnpm typecheck` | 全项目类型检查（web + api + shared） |
| `pnpm typecheck:web` | 前端类型检查 |
| `pnpm typecheck:api` | 后端类型检查 |
| `pnpm lint:web` | 同 `typecheck:web`（兼容旧命令） |
| `pnpm lint:api` | 同 `typecheck:api`（兼容旧命令） |
| `pnpm build:web` | 构建前端 |
| `pnpm build:api` | 构建后端 |

## 验证连通

```bash
# 后端健康检查
curl http://localhost:3000/api/health

# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

前端登录后，首页「前后端连通性」卡片应显示绿色成功状态。

## 与 Docker 全栈的区别

| 项目 | 本地开发 | Docker 全栈 |
| ---- | -------- | ----------- |
| 前端 | Vite :5173 | Caddy 静态资源 :80 |
| 后端 | NestJS :3000 | api 容器（内网） |
| 数据库 | postgres 暴露 5432 | postgres 内网 |
| 启动 | `pnpm dev:*` | `pnpm docker:up` |

本地开发与 Docker 全栈**不要同时占用 80 端口**。若已运行 Docker 全栈，先 `pnpm docker:down` 再本地开发。

## 常见问题

### `pnpm db:seed` 显示 skipped

数据库中已存在同名 Organization，属于正常幂等行为。演示账号仍可用；若需重建，见 [数据库迁移与 Seed](../database/migrations-and-seed.md#重新-seed)。

### Prisma 找不到 DATABASE_URL

确保根目录存在 `.env`，且 `DATABASE_URL` 指向 `localhost:5432`。api 的 Prisma 命令通过 `dotenv -e ../../.env` 读取根目录配置。

### 端口被占用

- 3000：检查是否有其他 `pnpm dev:api` 或 Docker api 容器
- 5432：检查 `docker ps` 中 postgres 容器
- 5173：检查是否有其他 Vite 进程
