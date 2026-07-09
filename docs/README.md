# 项目文档

小团宝开发与运维文档索引。按场景查找：

## 快速入口

| 我想… | 看这里 |
| ----- | ------ |
| 第一次在本地跑起来 | [本地开发指南](./deploy/local-development.md) |
| Docker 一键部署全栈 | [Docker 部署指南](./deploy/docker-deploy.md) |
| 查环境变量含义 | [环境变量说明](./deploy/environment-variables.md) |
| 日常运维（重启、更新、备份） | [运维操作手册](./deploy/operations.md) |
| 了解 Caddy 代理规则 | [Caddy 配置说明](./deploy/caddy.md) |
| 家庭服务器 CI/CD（GHCR + Tailscale） | [家庭服务器 CI/CD](./deploy/home-ci.md) |
| 数据库迁移与 seed | [数据库迁移与 Seed](./database/migrations-and-seed.md) |
| 当前 Prisma 模型 | [Prisma 模型说明](./database/prisma-models.md) |
| API 约定与已有接口 | [API 概览](./api/overview.md) |
| 整体架构与技术选型 | [架构概览](./architecture/overview.md) |
| 开发规范与 AI 约束 | [开发规范](./architecture/development-guidelines.md) |
| 供应商功能规格（Epic 1） | [供应商 PRD](./prd/supplier.zh-CN.md) |

## 目录结构

```txt
docs/
  README.md                          本索引
  architecture/
    overview.md                      架构概览
    development-guidelines.md        开发规范
  deploy/
    local-development.md             本地开发
    docker-deploy.md                 Docker 全栈部署
    environment-variables.md         环境变量
    caddy.md                         Caddy 配置
    home-ci.md                       家庭服务器 CI/CD
    operations.md                    运维操作
  database/
    migrations-and-seed.md           迁移与初始化
    prisma-models.md                 数据模型
  api/
    overview.md                      API 约定与接口
  prd/
    supplier.zh-CN.md                供应商管理 Epic 1
```

## 根目录关键文件

| 文件 | 用途 |
| ---- | ---- |
| `.env` | 本地/部署环境变量（不提交 Git） |
| `.env.example` | 环境变量模板 |
| `docker-compose.yml` | 全栈部署编排 |
| `docker-compose.dev.yml` | 本地开发数据库 override |
| `xiaotuanbao-infrastructure.md` | 完整基础设施设计（原始架构文档） |
| `CONTEXT.md` | 领域语言与业务术语 |
