# Docker 部署指南

通过 Docker Compose 统一部署 **Caddy + API + PostgreSQL + 前端静态资源**。

## 架构

```txt
浏览器
  ↓
Caddy (:80 / :443)
  ├─ /api/*  → api:3000
  └─ /*      → web_dist（前端 dist）
       ↓
    postgres（内网，不暴露公网）
```

## 首次部署

```bash
cp .env.example .env
```

编辑 `.env`：

1. 设置 `CADDY_DOMAIN=:80`（本地）或 `your-domain.com`（生产）
2. 生产环境修改 `JWT_SECRET`、`POSTGRES_PASSWORD`

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
| `xiaotuanbao-api` | apps/api/Dockerfile | 内网 3000 | NestJS，启动时自动 migrate |
| `xiaotuanbao-postgres` | postgres:16 | 内网 5432 | 数据持久化 |
| `xiaotuanbao-web` | apps/web/Dockerfile | — | 一次性构建，复制 dist 到 volume |

## 常用命令

| 命令 | 说明 |
| ---- | ---- |
| `pnpm docker:up` | 构建并启动全栈 |
| `pnpm docker:down` | 停止并移除容器 |
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
  uploads/
  postgres/backup/
  apps/
  packages/
  ...
```

持久化数据：

- `postgres_data` volume — 数据库
- `caddy_data` / `caddy_config` volume — 证书
- `./uploads` — 上传文件
- `./postgres/backup` — 备份文件

## 验证

```bash
curl http://localhost/api/health
curl -X POST http://localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

## 相关文档

- [环境变量说明](./environment-variables.md)
- [Caddy 配置说明](./caddy.md)
- [运维操作手册](./operations.md)
