# API 概览

后端基础路径：`/api`（NestJS 全局前缀）

## 统一返回格式

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

- `code === 0` 表示成功
- 失败时 `code` 为 HTTP 状态码或业务错误码，`message` 为错误描述

前端 `request` 层会自动解包 `data` 字段；`code !== 0` 时抛出 `ApiError`。

## 认证

第一版采用 JWT Bearer Token：

1. `POST /api/auth/login` 获取 `accessToken`
2. 后续请求头：`Authorization: Bearer <token>`
3. 401 时前端自动退出登录

共享类型定义见 `packages/shared/src/types/api.types.ts`。

## 已有接口

### 健康检查

```
GET /api/health
```

无需认证。

响应 `data`：

```json
{
  "status": "ok",
  "timestamp": "2026-07-06T15:07:53.684Z"
}
```

含数据库连通检测（`SELECT 1`）。

### 登录

```
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

响应 `data`：

```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "...",
    "name": "演示管理员",
    "organizationId": "...",
    "organizationName": "演示旅行社"
  }
}
```

错误：401 `用户名或密码错误`

## 验证示例

```bash
# 本地开发
curl http://localhost:3000/api/health

curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

# Docker 全栈（经 Caddy）
curl http://localhost/api/health
```

## 开发约定

1. 所有接口使用 DTO + `class-validator` 校验
2. 统一经 `TransformInterceptor` 包装返回
3. 异常经 `AllExceptionsFilter` 统一格式化
4. 涉及数据库变更同步更新 Prisma schema 和 migration
5. 前后端共享类型优先放 `packages/shared`

## 模块结构

```txt
apps/api/src/modules/
  auth/       JWT + 登录
  health/     健康检查
  （后续）organization, user, role, tour, finance...
```
