# Docker 部署指南

通过 Docker Compose 统一部署 **Caddy + API + Agent + Workflow Worker + PostgreSQL + Garage + 前端静态资源**。

## 架构

```txt
浏览器
  ↓
Caddy (:80 / :443)
  ├─ /api/*  → api:3000
  ├─ /copilotkit* → agent:4111
  └─ /*      → web_dist（前端 dist）
       ↓
    workflow-worker + postgres（内网） + garage:3900（S3 API，内网；本地可映射 3900）
```

## 首次部署

```bash
cp .env.example .env
```

编辑 `.env`：

1. 设置 `CADDY_DOMAIN=:80`（本地）或 `your-domain.com`（生产）
2. 生产环境修改 `JWT_SECRET`、`POSTGRES_PASSWORD`，并轮换 `S3_ACCESS_KEY` / `S3_SECRET_KEY`（勿用样例密钥）
3. 配置 `WEB_ORIGINS=https://实际前端域名`、`AUTH_COOKIE_SECURE=true`

启动：

```bash
pnpm docker:up
pnpm docker:seed
```

访问 http://localhost ，使用演示账号 `admin / admin123` 登录。

## 服务说明

| 容器 | 镜像/构建 | 端口 | 说明 |
| ---- | --------- | ---- | ---- |
| `xiaotuanbao-caddy` | caddy:2 | 80, 443 | 唯一公网入口 |
| `xiaotuanbao-api` | apps/api/Dockerfile | 内网 3000 | NestJS（prod 依赖），启动时自动 migrate |
| `xiaotuanbao-agent` | apps/agent/Dockerfile | 内网 4111 | 无头 Agent Runtime（`/v1/headless-runs`）；`GET /copilotkit/info` 可供壳层发现，`POST /copilotkit` 不执行 |
| `xiaotuanbao-workflow-worker` | apps/api/Dockerfile | — | 复用 API 构建产物，执行持久化 Agent 与资料解析作业 |
| `xiaotuanbao-postgres` | postgres:16 | 内网 5432 | 数据持久化 |
| `xiaotuanbao-garage` | dxflrs/garage:v2.3.0 | 3900（S3） | 对象存储（FileStore / ADR-0027） |
| `xiaotuanbao-web` | apps/web/Dockerfile | — | 一次性构建，复制 dist 到 volume |

## 常用命令

| 命令 | 说明 |
| ---- | ---- |
| `pnpm docker:up` | 构建并启动全栈（含 Garage） |
| `pnpm docker:down` | 停止并移除容器 |
| `pnpm garage:up` | 仅启动 Garage（本地 pnpm API + e2e） |
| `pnpm docker:logs` | 查看全部日志 |
| `pnpm docker:restart:api` | 仅重启 API |
| `pnpm docker:migrate` | 手动执行 migrate deploy |
| `pnpm docker:seed` | 容器内 seed |

## 更新版本

```bash
git pull
pnpm docker:up    # 重新构建并启动
```

## 生产服务器建议目录

```txt
/opt/xiaotuanbao/
  docker-compose.yml
  docker-compose.dev.yml
  .env
  docker/caddy/Caddyfile
  garage/data/
  postgres/backup/
  apps/
  packages/
  ...
```

持久化数据：

- `postgres_data` volume — 数据库
- `caddy_data` / `caddy_config` volume — 证书
- `./garage/data` — 对象存储（Garage；`pnpm garage:up` / compose `garage` 服务，见 ADR-0027）
- `docker/garage/garage.toml` — Garage 单节点配置（与 compose / CI 共用）
- `./postgres/backup` — 备份文件

过渡期若仍有 `./uploads`，仅为遗留 `UPLOAD_DIR`，不作为新产品附件落点。

## 验证

```bash
curl http://localhost/api/health
curl -X POST http://localhost/api/auth/login \
  -H 'Origin: http://localhost' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

登录响应通过 `HttpOnly` Cookie 建立会话。生产环境必须使用 HTTPS；上面的 HTTP curl
只适用于 `NODE_ENV=development` 且 `AUTH_COOKIE_SECURE=false` 的本地开发，不适用于生产容器。

AI 建团协助：Agent 只通过 Worker 调 `/v1/headless-runs` 执行；`POST /copilotkit` 不执行。生产不要设 `AGENT_HEADLESS_ADAPTER=deterministic`。真实 OCR / 真实模型冒烟不进默认 CI；本地纯文字冒烟见 `apps/web-e2e/README.md`。

## 相关文档

- [环境变量说明](./environment-variables.md)
- [Caddy 配置说明](./caddy.md)
- [运维操作手册](./operations.md)
