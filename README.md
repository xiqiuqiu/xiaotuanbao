# 小团宝

面向中小地接旅行社的 B 端 SaaS 管理系统。

## 技术栈

- Monorepo：pnpm workspace
- 前端：Vite + React + TypeScript + Ant Design + TanStack Router + TanStack Query + Zustand
- 后端：NestJS + TypeScript + Prisma + PostgreSQL
- 部署：Docker Compose + Caddy（待建）

## 开发

### 前端

```bash
pnpm install
pnpm dev:web
```

前端开发服务器默认运行在 http://localhost:5173 ，`/api` 请求会代理到 `http://localhost:3000`。

### 后端

```bash
# 1. 复制环境变量
cp .env.example .env

# 2. 启动 PostgreSQL（暴露 5432 到本机）
pnpm db:up

# 3. 执行数据库迁移
pnpm db:migrate

# 4. 启动 API
pnpm dev:api
```

API 默认运行在 http://localhost:3000 ，健康检查：http://localhost:3000/api/health

## 目录结构

```txt
xiaotuanbao/
  apps/
    web/          前端应用
    api/          后端应用
  packages/
    shared/       前后端共享类型（待建）
    config/       公共工程配置
  docker/         部署配置（待建）
  docs/           项目文档（待建）
  docker-compose.yml   本地 PostgreSQL
```

详细架构说明见 [xiaotuanbao-infrastructure.md](./xiaotuanbao-infrastructure.md)。
