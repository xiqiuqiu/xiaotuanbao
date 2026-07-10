# 小团宝项目基础设施与工作目录设计

## 1. 项目定位

小团宝是一套面向中小地接旅行社的 B 端 SaaS 管理系统，主要用于管理团单、行程、资源、同行/客户、供应商、应收、应付、收支流水、核销、组织、员工和权限等业务。

本次技术方向已经确定为：

```txt
Monorepo：pnpm workspace
前端：Vite + React + TypeScript + Ant Design + TanStack Router + TanStack Query + Zustand
后端：NestJS + TypeScript + Prisma + PostgreSQL + JWT
数据库：自建 PostgreSQL
部署：Docker Compose + Caddy
文件存储：本地持久化目录，后续可扩展 MinIO
缓存：Redis 可选，第一版可先预留
```

## 2. 总体架构

```txt
用户浏览器
  ↓
Caddy
  ├─ /             → 前端静态资源 dist
  ├─ /api/*        → NestJS API 服务
  └─ HTTPS         → Caddy 自动管理证书
        ↓
NestJS API
        ↓
Prisma ORM
        ↓
PostgreSQL
```

部署目标是通过一台服务器和一个 `docker-compose.yml` 统一管理所有服务。服务器上不需要手动安装 Node.js、pnpm、PostgreSQL 等运行环境，所有核心服务通过 Docker 容器运行。

## 3. 技术选型说明

### 3.1 前端技术栈

```txt
Vite
React
TypeScript
Ant Design
TanStack Router
TanStack Query
Zustand
Axios 或 Fetch
```

前端主要负责后台管理界面、页面路由、表单、表格、状态管理、接口请求和用户交互。

推荐使用方式：

```txt
Ant Design：负责 UI 组件、表单、表格、弹窗、抽屉、布局
TanStack Router：负责前端路由、页面权限、路由参数
TanStack Query：负责接口请求、缓存、刷新、分页、加载状态
Zustand：负责登录用户、组织信息、侧边栏折叠状态等全局状态
```

### 3.2 后端技术栈

```txt
NestJS
TypeScript
Prisma
PostgreSQL
JWT
```

后端主要负责业务 API、登录认证、权限控制、数据库访问、财务规则、团单规则、审计日志、文件上传和系统配置。

NestJS 适合这个项目的原因：

1. 模块化结构清晰。
2. 适合复杂业务系统。
3. 可以按业务拆分模块。
4. TypeScript 类型体验好。
5. 方便和前端共享类型、枚举、状态常量。

### 3.3 数据库

数据库使用自建 PostgreSQL。

第一版不依赖 Cloudflare D1、KV、R2、Workers、Pages 等基础设施。所有核心业务数据、用户数据、财务数据都进入自建 PostgreSQL。

### 3.4 部署

部署使用 Docker Compose + Caddy。

Caddy 负责：

1. 前端静态资源访问。
2. `/api/*` 请求反向代理到 NestJS。
3. HTTPS 自动证书。
4. React SPA 刷新回退到 `index.html`。

## 4. Monorepo 工作目录设计

推荐项目目录：

```txt
xiaotuanbao/
  apps/
    web/
    api/
  packages/
    shared/
    config/
  docker/
    caddy/
    postgres/
    scripts/
  docs/
    architecture/
    database/
    api/
    deploy/
  .env.example
  package.json
  pnpm-workspace.yaml
  docker-compose.yml
  README.md
```

### 4.1 根目录

```txt
xiaotuanbao/
```

项目根目录，负责 Monorepo 管理、统一脚本、Docker Compose 编排和项目文档入口。

根目录核心文件：

```txt
package.json
pnpm-workspace.yaml
docker-compose.yml
.env.example
README.md
```

### 4.2 apps/web

```txt
apps/web/
```

前端应用目录，负责后台管理系统界面。

建议目录结构：

```txt
apps/web/
  src/
    app/
      providers/
      router/
      store/
    assets/
    components/
      common/
      business/
    config/
    constants/
    features/
      auth/
      dashboard/
      tour/
      itinerary/
      resource/
      finance/
      partner/
      supplier/
      system/
    hooks/
    layouts/
    lib/
      request/
      query/
    pages/
    services/
    styles/
    types/
    utils/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  Dockerfile
```

前端职责：

1. 登录页。
2. 后台基础布局。
3. 左侧菜单。
4. 顶部栏。
5. 面包屑。
6. 表格列表页。
7. 表单抽屉。
8. 查询筛选。
9. 接口请求。
10. 登录状态管理。
11. 路由权限控制。

### 4.3 apps/api

```txt
apps/api/
```

后端应用目录，负责 NestJS API 服务。

建议目录结构：

```txt
apps/api/
  src/
    main.ts
    app.module.ts
    config/
    common/
      decorators/
      filters/
      guards/
      interceptors/
      pipes/
      types/
      utils/
    database/
      prisma/
    modules/
      auth/
      health/
      user/
      organization/
      role/
      permission/
      tour/
      itinerary/
      resource/
      finance/
      partner/
      supplier/
      system/
    shared/
  prisma/
    schema.prisma
    seed.ts
  package.json
  tsconfig.json
  Dockerfile
```

后端职责：

1. 登录认证。
2. JWT 校验。
3. 用户管理。
4. 组织管理。
5. 角色权限。
6. 团单管理。
7. 行程资源。
8. 应收应付。
9. 收支流水。
10. 核销管理。
11. 文件上传。
12. 审计日志。
13. 统一异常处理。
14. 统一接口返回。
15. Prisma 数据访问。

### 4.4 packages/shared

```txt
packages/shared/
```

前后端共用包，放置共享类型、枚举、状态、常量、DTO 类型等。

建议内容：

```txt
packages/shared/
  src/
    enums/
      tour-status.enum.ts
      finance-status.enum.ts
      resource-type.enum.ts
      partner-type.enum.ts
      supplier-type.enum.ts
    constants/
    types/
    dto/
    index.ts
  package.json
  tsconfig.json
```

适合放在 shared 中的内容：

1. 团单状态。
2. 团型枚举。
3. 资源类型。
4. 供应商类型。
5. 同行类型。
6. 应收状态。
7. 应付状态。
8. 核销状态。
9. 通用分页类型。
10. 通用接口返回类型。

这样可以减少前后端字段不一致的问题。

### 4.5 packages/config

```txt
packages/config/
```

公共工程配置目录。

建议内容：

```txt
packages/config/
  eslint/
  prettier/
  tsconfig/
  package.json
```

主要用于统一：

1. TypeScript 配置。
2. ESLint 配置。
3. Prettier 配置。
4. 代码风格。
5. 构建规范。

### 4.6 docker

```txt
docker/
```

部署相关配置目录。

建议结构：

```txt
docker/
  caddy/
    Caddyfile
  postgres/
    init/
  scripts/
    backup-db.sh
    restore-db.sh
```

职责：

1. Caddy 配置。
2. PostgreSQL 初始化脚本。
3. 数据库备份脚本。
4. 数据库恢复脚本。
5. 部署辅助脚本。

### 4.7 docs

```txt
docs/
```

项目文档目录。

建议结构：

```txt
docs/
  architecture/
    infrastructure.md
    development-guidelines.md
  database/
    database-guidelines.md
    prisma-models.md
  api/
    api-guidelines.md
  deploy/
    docker-deploy.md
    caddy.md
```

职责：

1. 架构说明。
2. 数据库规范。
3. API 规范。
4. 部署说明。
5. 开发规范。
6. AI 编程工具约束说明。

## 5. 前端基础设计

### 5.1 前端核心能力

前端第一阶段需要完成：

1. Vite React TypeScript 基础工程。
2. Ant Design 接入。
3. TanStack Router 接入。
4. TanStack Query 接入。
5. Zustand 接入。
6. 统一 request 请求实例。
7. 基础 Layout。
8. 登录页。
9. 首页。
10. 404 页面。
11. 登录态路由拦截。
12. Mock 登录。
13. 请求 `/api/health` 验证前后端连通。

### 5.2 前端基础菜单

建议第一版菜单：

```txt
首页
团单管理
行程管理
资源管理
财务管理
  应收管理
  应付管理
  收支流水
  核销管理
客户/同行管理
供应商管理
系统管理
  组织管理
  员工管理
  角色权限
```

### 5.3 前端环境变量

示例：

```env
VITE_APP_NAME=小团宝
VITE_API_BASE_URL=/api
VITE_APP_ENV=production
```

前端生产环境推荐通过相对路径 `/api` 请求后端，由 Caddy 统一代理。

### 5.4 前端请求规范

所有接口请求统一经过 `request` 层。

推荐能力：

1. 自动注入 token。
2. 统一处理接口返回格式。
3. 统一处理错误提示。
4. 401 自动退出登录。
5. 支持 GET、POST、PUT、DELETE。
6. 与 TanStack Query 配合使用。

建议接口返回格式：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

## 6. 后端基础设计

### 6.1 后端第一阶段能力

后端第一阶段需要完成：

1. NestJS 基础项目。
2. 环境变量读取。
3. Prisma 配置。
4. PostgreSQL 连接。
5. 统一接口返回格式。
6. 全局异常处理。
7. 参数校验 ValidationPipe。
8. CORS 配置。
9. JWT 基础能力。
10. health check 接口。
11. 日志输出。
12. Prisma migration 命令。
13. seed 初始化脚本。

### 6.2 后端模块拆分

建议模块：

```txt
auth          登录认证
health        健康检查
organization  组织管理
user          员工/用户管理
role          角色管理
permission    权限管理
tour          团单管理
itinerary     行程管理
resource      资源管理
finance       财务管理
partner       同行/客户管理
supplier      供应商管理
system        系统配置
```

### 6.3 后端环境变量

示例：

```env
NODE_ENV=production
API_PORT=3000
DATABASE_URL=postgresql://xiaotuanbao:password@postgres:5432/xiaotuanbao?schema=public
JWT_SECRET=please-change-this-secret
JWT_EXPIRES_IN=7d
UPLOAD_DIR=/app/uploads
```

### 6.4 JWT 认证方案

第一版建议采用 JWT：

1. 登录成功后返回 accessToken。
2. 前端保存 token。
3. 请求头携带 `Authorization: Bearer token`。
4. 后端 Guard 校验 token。
5. 后续可扩展 refreshToken。

## 7. 数据库与 Prisma 设计

### 7.1 数据库选型

使用 PostgreSQL。

推荐版本：PostgreSQL 16。

### 7.2 第一批基础模型

第一批模型只设计系统基础能力：

```txt
Organization
User
Role
Permission
UserRole
RolePermission
```

### 7.3 多租户预留

第一版采用 `organizationId` 作为组织隔离字段。

建议：

1. User 属于 Organization。
2. Role 属于 Organization。
3. 业务表都预留 organizationId。
4. 查询业务数据时默认按 organizationId 过滤。
5. 后续 SaaS 多租户可继续基于 organizationId 扩展。

### 7.4 通用字段规范

业务表建议统一包含：

```txt
id
organizationId
createdAt
updatedAt
deletedAt
createdBy
updatedBy
```

说明：

```txt
id：主键
organizationId：组织隔离字段
createdAt：创建时间
updatedAt：更新时间
deletedAt：软删除时间
createdBy：创建人
updatedBy：更新人
```

### 7.5 金额字段规范

财务相关金额字段必须使用 Decimal，避免浮点精度问题。

示例：

```prisma
amount Decimal @db.Decimal(12, 2)
```

### 7.6 Prisma migration

建议使用 Prisma migration 管理数据库结构变更。

常用命令：

```bash
pnpm --filter api prisma migrate dev
pnpm --filter api prisma migrate deploy
pnpm --filter api prisma generate
pnpm --filter api prisma db seed
```

## 8. Docker Compose 部署设计

### 8.1 部署目标

使用一个 `docker-compose.yml` 统一部署和运维管理。

部署约束：

1. 所有核心服务容器化。
2. 服务器不手动安装 Node.js、pnpm、PostgreSQL。
3. Caddy 作为唯一公网入口。
4. PostgreSQL 数据必须持久化。
5. Caddy 证书数据必须持久化。
6. 上传文件必须持久化。
7. api 和 postgres 默认不直接暴露公网端口。
8. 不使用 Nginx。
9. 不使用 Cloudflare 基础设施。
10. 不使用 Kubernetes。
11. 第一版只做单机部署。

### 8.2 Docker 服务划分

第一版核心服务：

```txt
caddy       统一入口、HTTPS、前端静态资源、API 反向代理
api         NestJS 后端服务
postgres    PostgreSQL 数据库
```

后续可选服务：

```txt
redis       缓存、验证码、任务状态
minio       文件存储、合同附件、行程单附件
```

### 8.3 生产服务器目录

推荐服务器目录：

```txt
/opt/xiaotuanbao/
  docker-compose.yml
  .env
  caddy/
    Caddyfile
    data/
    config/
  postgres/
    data/
    backup/
  uploads/
  logs/
```

目录说明：

```txt
docker-compose.yml：服务编排文件
.env：生产环境变量
caddy/Caddyfile：Caddy 配置
caddy/data：Caddy 证书数据，需要持久化
caddy/config：Caddy 配置数据，需要持久化
postgres/data：数据库数据，需要持久化
postgres/backup：数据库备份目录，需要定期备份
uploads：上传文件目录，需要持久化
logs：日志目录，可按需持久化
```

### 8.4 docker-compose.yml 示例

```yaml
services:
  caddy:
    image: caddy:2
    container_name: xiaotuanbao-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/caddy/Caddyfile:/etc/caddy/Caddyfile
      - ./apps/web/dist:/srv/web
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: xiaotuanbao-api
    restart: unless-stopped
    env_file:
      - .env
    depends_on:
      - postgres
    volumes:
      - ./uploads:/app/uploads

  postgres:
    image: postgres:16
    container_name: xiaotuanbao-postgres
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/backup:/backup

volumes:
  postgres_data:
  caddy_data:
  caddy_config:
```

说明：

生产环境不建议暴露 PostgreSQL 端口到公网。后端容器通过 Docker 内部网络访问 PostgreSQL。

### 8.5 Caddyfile 示例

生产环境：

```caddyfile
your-domain.com {
    root * /srv/web
    encode gzip zstd

    handle /api/* {
        reverse_proxy api:3000
    }

    handle {
        try_files {path} /index.html
        file_server
    }
}
```

本地环境：

```caddyfile
:80 {
    root * /srv/web
    encode gzip zstd

    handle /api/* {
        reverse_proxy api:3000
    }

    handle {
        try_files {path} /index.html
        file_server
    }
}
```

关键说明：

```txt
root * /srv/web：前端构建产物目录
handle /api/*：接口请求代理到 api 服务
reverse_proxy api:3000：转发到 NestJS 容器
try_files {path} /index.html：解决 SPA 刷新 404
file_server：提供静态文件访问
```

## 9. Dockerfile 设计

### 9.1 前端 Dockerfile 设计目标

前端构建流程：

1. 安装依赖。
2. 执行 Vite build。
3. 输出 dist。
4. Caddy 读取 dist 目录提供访问。

可选方案：

1. 由 Docker 构建前端 dist。
2. 本地构建 dist 后上传服务器。

第一版建议由 Docker 完成构建，减少环境差异。

### 9.2 后端 Dockerfile 设计目标

后端构建流程：

1. 安装依赖。
2. 生成 Prisma Client。
3. 构建 NestJS。
4. 生产环境启动 Node 服务。

后端容器启动命令建议：

```bash
node dist/main.js
```

## 10. 环境变量规划

`.env.example` 建议内容：

```env
# App
APP_NAME=小团宝
NODE_ENV=production
DOMAIN=your-domain.com

# API
API_PORT=3000
JWT_SECRET=please-change-this-secret
JWT_EXPIRES_IN=7d

# Database
POSTGRES_USER=xiaotuanbao
POSTGRES_PASSWORD=please-change-this-password
POSTGRES_DB=xiaotuanbao
DATABASE_URL=postgresql://xiaotuanbao:please-change-this-password@postgres:5432/xiaotuanbao?schema=public

# Upload
UPLOAD_DIR=/app/uploads

# Frontend
VITE_API_BASE_URL=/api
```

生产环境必须修改：

1. DOMAIN。
2. POSTGRES_PASSWORD。
3. JWT_SECRET。
4. DATABASE_URL。

## 11. 运维命令

### 11.1 首次启动

```bash
docker compose up -d --build
```

### 11.2 停止服务

```bash
docker compose down
```

### 11.3 重启服务

```bash
docker compose restart
```

### 11.4 查看全部日志

```bash
docker compose logs -f
```

### 11.5 查看后端日志

```bash
docker compose logs -f api
```

### 11.6 查看 Caddy 日志

```bash
docker compose logs -f caddy
```

### 11.7 查看数据库日志

```bash
docker compose logs -f postgres
```

### 11.8 执行数据库迁移

```bash
docker compose exec api pnpm prisma migrate deploy
```

### 11.9 执行 seed

```bash
docker compose exec api pnpm prisma db seed
```

### 11.10 备份数据库

```bash
docker compose exec postgres pg_dump -U xiaotuanbao xiaotuanbao > ./postgres/backup/xiaotuanbao_$(date +%Y%m%d_%H%M%S).sql
```

### 11.11 恢复数据库

```bash
cat ./postgres/backup/backup.sql | docker compose exec -T postgres psql -U xiaotuanbao -d xiaotuanbao
```

### 11.12 更新版本

```bash
git pull
docker compose up -d --build
```

### 11.13 只重启后端

```bash
docker compose restart api
```

## 12. 开发落地顺序

建议按下面顺序推进：

```txt
第 1 步：创建 Monorepo 项目结构
第 2 步：创建 apps/web 前端基础工程
第 3 步：创建 apps/api 后端基础工程
第 4 步：配置 packages/shared
第 5 步：配置 PostgreSQL 和 Prisma
第 6 步：配置 Docker Compose
第 7 步：配置 Caddy
第 8 步：实现 health check 前后端连通
第 9 步：实现登录认证闭环
第 10 步：实现组织、员工、角色权限基础模型
第 11 步：实现一个标准业务模块模板
第 12 步：扩展团单、资源、财务等核心模块
```

第一阶段验收目标：

```txt
1. Monorepo 能跑起来
2. web 能启动
3. api 能启动
4. web 能请求 api 的 health 接口
5. PostgreSQL 能连接
6. Prisma migration 能执行
7. seed 能初始化管理员账号
8. Caddy 能代理前端和后端
```

## 13. 给 AI 编程工具的固定约束

后续每次让 AI 编程工具开发新功能时，建议带上下面这段：

```txt
当前项目技术栈：

Monorepo：pnpm workspace
前端：Vite + React + TypeScript + Ant Design + TanStack Router + TanStack Query + Zustand
后端：NestJS + TypeScript + Prisma + PostgreSQL
部署：Docker Compose + Caddy
数据库：自建 PostgreSQL

开发约束：

1. 不使用 Next.js。
2. 不使用 Nginx。
3. 不使用 Spring Boot。
4. 不依赖 Cloudflare 基础设施。
5. 不一次性开发无关模块。
6. 优先复用 packages/shared 中的类型、枚举和常量。
7. 前端接口请求必须通过统一 request 和 TanStack Query。
8. 后端接口必须使用 DTO、参数校验、统一返回格式和全局异常处理。
9. 涉及数据库变更必须同步更新 Prisma schema 和 migration。
10. 每次修改后说明改动文件和验证方式。
```

## 14. 总结

本项目最终确定的技术路线为：

```txt
Vite + React + Ant Design + TanStack
NestJS + Prisma + PostgreSQL
pnpm workspace Monorepo
Docker Compose + Caddy 单机部署
```

该方案适合个人或小团队持续开发，也适合使用 AI 编程工具进行分阶段建设。第一版应优先保证基础工程、前后端连通、数据库迁移、登录认证、Docker 部署闭环稳定，再逐步进入团单、资源和财务等核心业务模块开发。
