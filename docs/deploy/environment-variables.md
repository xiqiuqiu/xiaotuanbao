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
| `WEB_ORIGINS` | **是（生产）** | 本地 Vite origins | 允许携带 Cookie 访问 API 的精确前端 Origin，多个值用逗号分隔，不支持通配符 |
| `AUTH_COOKIE_SECURE` | **是（生产）** | 生产 `true`，开发 `false` | 认证 Cookie 仅经 HTTPS 发送；生产设为 `false` 会拒绝启动 |
| `AUTH_COOKIE_SAME_SITE` | 否 | `lax` | `lax` / `strict` / `none`；仅跨站部署用 `none`，且必须启用 Secure |
| `AUTH_COOKIE_DOMAIN` | 否 | host-only | 通常不要设置；只有经安全评审确认需要跨子域共享时配置 |
| `AUTH_ALLOW_LEGACY_BEARER` | 否 | `false` | Web 迁移窗口临时兼容旧 Bearer Header，到期必须关闭 |

### 数据库

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `POSTGRES_USER` | 否 | xiaotuanbao | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | **是（生产）** | — | PostgreSQL 密码，生产必须修改 |
| `POSTGRES_DB` | 否 | xiaotuanbao | 数据库名 |
| `DATABASE_URL` | 本地开发必填 | — | Prisma 连接串（见下方场景说明） |

### 对象存储（S3 兼容，ADR-0027）

| 变量 | 必填 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `S3_ENDPOINT` | 是 | — | S3 API endpoint；本地 `http://127.0.0.1:3900`，Compose 内 api 覆写为 `http://garage:3900` |
| `S3_REGION` | 否 | `garage` | 区域；Garage 可用占位值；OSS 等按厂商填写 |
| `S3_BUCKET` | 是 | — | 桶名；须与 Garage `GARAGE_DEFAULT_BUCKET` 一致 |
| `S3_ACCESS_KEY` | 是 | — | Access Key；须与 Garage `GARAGE_DEFAULT_ACCESS_KEY` 一致 |
| `S3_SECRET_KEY` | 是 | — | Secret Key；须与 Garage `GARAGE_DEFAULT_SECRET_KEY` 一致 |
| `UPLOAD_DIR` | 否（遗留） | `./uploads` | **遗留**：本地上传目录；新产品附件走 FileStore，勿再依赖 |

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
S3_ENDPOINT=http://127.0.0.1:3900
S3_REGION=garage
S3_BUCKET=xiaotuanbao
S3_ACCESS_KEY=GKaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
S3_SECRET_KEY=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
# UPLOAD_DIR=./uploads  # 遗留
VITE_APP_ENV=development
WEB_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAME_SITE=lax
```

PostgreSQL 通过 `pnpm db:up` 启动，暴露 `localhost:5432`。对象存储通过 `pnpm garage:up` 启动 Garage（配置见 `docker/garage/garage.toml`），S3 API 暴露 `localhost:3900`。附件上传上限 50MB（覆盖试点《疆游记》等大总表）。

### 场景 B：Docker 全栈部署

```env
NODE_ENV=production
CADDY_DOMAIN=:80                    # 本地 Docker 测试
# CADDY_DOMAIN=your-domain.com    # 生产环境
JWT_SECRET=<强随机字符串>
WEB_ORIGINS=https://your-domain.com
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=lax
POSTGRES_PASSWORD=<强密码>
S3_ENDPOINT=http://garage:3900
S3_REGION=garage
S3_BUCKET=xiaotuanbao
S3_ACCESS_KEY=<与 Garage 引导密钥一致>
S3_SECRET_KEY=<与 Garage 引导密钥一致>
VITE_APP_ENV=production
```

`DATABASE_URL` 在 Docker 中由 `docker-compose.yml` 自动注入为 `@postgres:5432`，**无需手动改 `.env` 中的 DATABASE_URL**。`S3_ENDPOINT` 同样由 compose 覆写为 `http://garage:3900`（即使 `.env` 写了 `127.0.0.1`）。

## 生产环境必改项

1. `JWT_SECRET`
2. `POSTGRES_PASSWORD`
3. `CADDY_DOMAIN=your-domain.com`
4. `SEED_ADMIN_PASSWORD`（若使用 seed 初始化）
5. `WEB_ORIGINS=https://实际前端域名`
6. `AUTH_COOKIE_SECURE=true` 并通过 HTTPS 访问
7. `S3_ACCESS_KEY` / `S3_SECRET_KEY`（轮换样例密钥；与 Garage/OSS 实际凭证一致）

认证使用服务端 `HttpOnly` Cookie。默认 Docker/Caddy 的 Web 与 `/api` 同源，保持
`VITE_API_BASE_URL=/api` 与 `AUTH_COOKIE_SAME_SITE=lax`。若 Web 和 API 跨 Origin 但仍同站，
将 Web 的精确 Origin 加入 `WEB_ORIGINS`；只有两者确实跨站时才使用
`AUTH_COOKIE_SAME_SITE=none`，此时 `AUTH_COOKIE_SECURE=true` 是强制条件。
