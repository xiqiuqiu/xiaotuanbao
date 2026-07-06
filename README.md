# 小团宝

面向中小地接旅行社的 B 端 SaaS 管理系统。

## 技术栈

- Monorepo：pnpm workspace
- 前端：Vite + React + TypeScript + Ant Design + TanStack Router + TanStack Query + Zustand
- 后端：NestJS + TypeScript + Prisma + PostgreSQL
- 部署：Docker Compose + Caddy（待建）

## 首次启动

在项目根目录执行：

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

## 日常开发

开两个终端，分别启动后端和前端：

```bash
# 终端 1 — 后端 API（http://localhost:3000）
pnpm dev:api

# 终端 2 — 前端 Web（http://localhost:5173）
pnpm dev:web
```

前端 `/api` 请求会自动代理到后端 `http://localhost:3000`。

### 演示登录

| 用户名 | 密码     |
| ------ | -------- |
| admin  | admin123 |

## 常用命令

### 开发

| 命令            | 说明                          |
| --------------- | ----------------------------- |
| `pnpm dev:web`  | 启动前端开发服务器（5173）    |
| `pnpm dev:api`  | 启动后端开发服务器（3000）    |
| `pnpm build:web`| 构建前端生产包                |
| `pnpm build:api`| 构建后端生产包                |
| `pnpm lint:web` | 前端 TypeScript 类型检查      |
| `pnpm lint:api` | 后端 TypeScript 类型检查      |

### 数据库

| 命令             | 说明                              |
| ---------------- | --------------------------------- |
| `pnpm db:up`     | 启动 PostgreSQL 容器（暴露 5432）   |
| `pnpm db:down`   | 停止 PostgreSQL 容器              |
| `pnpm db:migrate`| 执行 Prisma 数据库迁移            |
| `pnpm db:seed`   | 初始化演示数据（Organization + 管理员） |

### 接口验证

```bash
# 健康检查
curl http://localhost:3000/api/health

# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

## 目录结构

```txt
xiaotuanbao/
  apps/
    web/          前端应用
    api/          后端应用
  packages/
    shared/       前后端共享类型
    config/       公共工程配置
  docker/         部署配置（待建）
  docs/           项目文档（待建）
  docker-compose.yml   本地 PostgreSQL
```

详细架构说明见 [xiaotuanbao-infrastructure.md](./xiaotuanbao-infrastructure.md)。
