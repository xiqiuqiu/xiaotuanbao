# 环境变量说明

复制模板创建本地配置：

```bash
cp .env.example .env
```

`.env` 已加入 `.gitignore`，**不要提交到 Git**。

## 变量一览

### 应用

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `APP_NAME` | 否 | 小团宝 | 应用名称 |
| `NODE_ENV` | 否 | development | 运行环境：`development` / `production` |

### Caddy（Docker 全栈）

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `CADDY_DOMAIN` | Docker 部署时必填 | `:80` | Caddy 站点地址。本地 Docker 用 `:80`；生产用 `your-domain.com`（自动 HTTPS） |

> **注意**：不要使用 `DOMAIN=localhost`，Caddy 会对 localhost 启用 HTTPS 并重定向，导致 HTTP 请求失败。请使用 `CADDY_DOMAIN`。

### API

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `API_PORT` | 否 | 3000 | API 监听端口 |
| `JWT_SECRET` | **是（生产）** | — | JWT 签名密钥，生产必须修改 |
| `JWT_EXPIRES_IN` | 否 | 7d | Token 有效期 |

### 数据库

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `POSTGRES_USER` | 否 | xiaotuanbao | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | **是（生产）** | — | PostgreSQL 密码，生产必须修改 |
| `POSTGRES_DB` | 否 | xiaotuanbao | 数据库名 |
| `DATABASE_URL` | 本地开发必填 | — | Prisma 连接串（见下方场景说明） |

### 文件上传

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `UPLOAD_DIR` | 否 | `./uploads` | 上传目录。本地相对路径；Docker 容器内为 `/app/uploads` |

### 前端构建（Vite）

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `VITE_APP_NAME` | 否 | 小团宝 | 前端显示名称 |
| `VITE_API_BASE_URL` | 否 | /api | API 基础路径，生产环境保持 `/api` |
| `VITE_APP_ENV` | 否 | development | 前端环境标识 |

### Seed 初始化

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `SEED_ORG_NAME` | 否 | 演示旅行社 | 演示 Organization 名称 |
| `SEED_ADMIN_USERNAME` | 否 | admin | 演示管理员用户名 |
| `SEED_ADMIN_PASSWORD` | 否 | admin123 | 演示管理员密码 |
| `SEED_ADMIN_NAME` | 否 | 演示管理员 | 演示管理员显示名 |

## 两种运行场景

### 场景 A：本地开发（pnpm dev:api + pnpm dev:web）

```env
NODE_ENV=development
CADDY_DOMAIN=:80
DATABASE_URL=postgresql://xiaotuanbao:please-change-this-password@localhost:5432/xiaotuanbao?schema=public
UPLOAD_DIR=./uploads
VITE_APP_ENV=development
```

PostgreSQL 通过 `pnpm db:up` 启动，暴露 `localhost:5432`。

### 场景 B：Docker 全栈部署

```env
NODE_ENV=production
CADDY_DOMAIN=:80                    # 本地 Docker 测试
# CADDY_DOMAIN=your-domain.com    # 生产环境
JWT_SECRET=<强随机字符串>
POSTGRES_PASSWORD=<强密码>
UPLOAD_DIR=/app/uploads
VITE_APP_ENV=production
```

`DATABASE_URL` 在 Docker 中由 `docker-compose.yml` 自动注入为 `@postgres:5432`，**无需手动改 `.env` 中的 DATABASE_URL**。

## 生产环境必改项

1. `JWT_SECRET`
2. `POSTGRES_PASSWORD`
3. `CADDY_DOMAIN=your-domain.com`
4. `SEED_ADMIN_PASSWORD`（若使用 seed 初始化）
