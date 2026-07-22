# 开发规范

## AI / 协作开发约束

后续开发新功能时，遵循以下约束：

```txt
技术栈：
  Monorepo：pnpm workspace
  前端：Vite + React + TypeScript + Ant Design + TanStack Router + TanStack Query + Zustand
  后端：NestJS + TypeScript + Prisma + PostgreSQL
  部署：Docker Compose + Caddy

约束：
  1. 不使用 Next.js、Nginx、Spring Boot
  2. 不依赖 Cloudflare 基础设施
  3. 不一次性开发无关模块
  4. 优先复用 packages/shared 中的类型、枚举和常量
  5. 前端接口请求必须通过统一 request 和 TanStack Query
  6. 后端接口必须使用 DTO、参数校验、统一返回格式和全局异常处理
  7. 涉及数据库变更必须同步更新 Prisma schema 和 migration
  8. 每次修改后说明改动文件和验证方式
```

## 代码组织

### 前端 `apps/web`

- 页面放 `src/pages/`，业务模块放 `src/features/`
- 接口请求走 `src/lib/request/`，数据缓存用 TanStack Query
- 全局状态（登录用户、UI）用 Zustand
- 路由用 TanStack Router

### 后端 `apps/api`

- 按业务拆 `src/modules/`
- 公共逻辑放 `src/common/`
- 数据库访问通过 `PrismaService`
- 新模块：`module` + `controller` + `service` + `dto/`

### 共享 `packages/shared`

适合放入的内容：枚举、状态常量、DTO 类型、通用接口返回类型。

## Git 提交范围

应提交：

- 源代码、Prisma schema 与 migration
- `docs/` 文档更新
- `.env.example`（不含 `.env` 本身）
- Docker 与部署配置

不应提交：

- `.env`、`.env.local`
- `node_modules/`、`dist/`
- 对象存储本地数据目录（如 `garage/data/`）与遗留 `uploads/` 中的实际上传文件
- Docker volume 数据

## 领域语言

业务术语以 [CONTEXT.md](../../CONTEXT.md) 为准。关键约定：

- **Organization**（不用「租户」「公司」）
- **User / Employee**（Organization 内员工）
- **Departure**（发团，不用「团单」）
- **Partner**（同行，不用「客户」）
