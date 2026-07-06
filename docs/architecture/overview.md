# 架构概览

## 技术栈

| 层级 | 技术 |
| ---- | ---- |
| Monorepo | pnpm workspace |
| 前端 | Vite + React + TypeScript + Ant Design + TanStack Router/Query + Zustand |
| 后端 | NestJS + TypeScript + Prisma + PostgreSQL + JWT |
| 部署 | Docker Compose + Caddy |
| 共享 | `packages/shared` 前后端类型 |

## 请求链路

### 本地开发

```txt
浏览器 :5173
  → Vite dev server
  → /api/* 代理到 localhost:3000
  → NestJS API
  → PostgreSQL (Docker, localhost:5432)
```

### Docker 全栈

```txt
浏览器 :80 / :443
  → Caddy
      ├─ /api/*  → api:3000 (NestJS)
      └─ /*      → 前端静态资源 (web_dist volume)
  → PostgreSQL (内网 postgres:5432)
```

## Monorepo 目录

```txt
apps/web/          前端
apps/api/          后端
packages/shared/   共享类型
packages/config/   TS 等工程配置
docker/            Caddy 与部署脚本
docs/              项目文档
```

## 设计约束

1. 不使用 Next.js、Nginx、Spring Boot
2. 不依赖 Cloudflare 基础设施
3. 第一版单机 Docker Compose 部署
4. 多租户通过 `organizationId` 隔离
5. 前端请求统一走 `request` 层 + TanStack Query
6. 后端统一返回格式、DTO 校验、全局异常处理

完整设计见根目录 [xiaotuanbao-infrastructure.md](../../xiaotuanbao-infrastructure.md)，领域术语见 [CONTEXT.md](../../CONTEXT.md)。
