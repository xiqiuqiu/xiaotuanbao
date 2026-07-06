# 运维操作手册

## 服务管理

### Docker 全栈

```bash
# 启动（含构建）
pnpm docker:up

# 停止
pnpm docker:down

# 查看日志
pnpm docker:logs

# 查看单个服务日志
docker compose logs -f api
docker compose logs -f caddy
docker compose logs -f postgres

# 重启 API
pnpm docker:restart:api

# 重启 Caddy
docker compose restart caddy
```

### 本地开发数据库

```bash
pnpm db:up       # 启动 PostgreSQL
pnpm db:down     # 停止 PostgreSQL
```

## 数据库操作

### 迁移

```bash
# 本地开发（生成 migration 文件）
pnpm db:migrate

# Docker 容器内（仅 apply 已有 migration）
pnpm docker:migrate
```

> API 容器启动时会自动执行 `prisma migrate deploy`，通常无需手动迁移。

### Seed

```bash
# 本地
pnpm db:seed

# Docker
pnpm docker:seed
```

Seed 为幂等操作：若 Organization 已存在则跳过。详见 [数据库迁移与 Seed](../database/migrations-and-seed.md)。

## 备份与恢复

### 备份

```bash
sh docker/scripts/backup-db.sh
```

备份文件保存在 `postgres/backup/xiaotuanbao_YYYYMMDD_HHMMSS.sql`。

### 恢复

```bash
sh docker/scripts/restore-db.sh ./postgres/backup/xiaotuanbao_YYYYMMDD_HHMMSS.sql
```

> 恢复前建议先备份当前数据。恢复会覆盖现有数据。

## 版本更新

```bash
git pull
pnpm docker:up
```

`docker:up` 会重新构建镜像并滚动更新容器。

## 健康检查

```bash
# Docker 全栈
curl http://localhost/api/health

# 本地开发
curl http://localhost:3000/api/health

# 查看容器健康状态
docker ps --format "table {{.Names}}\t{{.Status}}"
```

## 故障排查

### API 容器 unhealthy

```bash
docker logs xiaotuanbao-api
```

常见原因：数据库未就绪、migration 失败、环境变量缺失。

### Caddy 返回 308 重定向

检查 `.env` 中 `CADDY_DOMAIN` 是否为 `:80`，而非 `localhost`。

### 前端 404 或空白页

```bash
# 确认 web 构建容器已成功
docker compose logs web

# 重新构建
pnpm docker:up
```

### 端口冲突

```bash
# 查看占用
lsof -i :80
lsof -i :5432

# 停止全栈
pnpm docker:down
```

## 磁盘与清理

```bash
# 查看 Docker volume
docker volume ls | grep xiaotuanbao

# 停止并删除容器（保留 volume 数据）
pnpm docker:down

# 完全清除（⚠️ 会删除数据库数据）
docker compose down -v
```
