# 小团宝

面向中小地接旅行社的 B 端 SaaS 管理系统。

## 快速开始

```bash
pnpm install
cp .env.example .env
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev:api    # 终端 1
pnpm dev:web    # 终端 2
```

演示账号：**admin / admin123**

## 文档

详细操作说明见 **[docs/README.md](./docs/README.md)**：

| 文档 | 说明 |
| ---- | ---- |
| [本地开发](./docs/deploy/local-development.md) | pnpm dev 日常开发 |
| [Docker 部署](./docs/deploy/docker-deploy.md) | 全栈容器部署 |
| [环境变量](./docs/deploy/environment-variables.md) | `.env` 配置说明 |
| [运维操作](./docs/deploy/operations.md) | 备份、重启、故障排查 |
| [数据库迁移](./docs/database/migrations-and-seed.md) | Prisma migrate 与 seed |
| [API 概览](./docs/api/overview.md) | 接口约定与已有端点 |
| [架构概览](./docs/architecture/overview.md) | 技术栈与请求链路 |

## 技术栈

Monorepo (pnpm) · Vite + React + Ant Design · NestJS + Prisma + PostgreSQL · Docker Compose + Caddy

完整架构设计：[xiaotuanbao-infrastructure.md](./xiaotuanbao-infrastructure.md)
