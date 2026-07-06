# Prisma 模型说明

Schema 文件：`apps/api/prisma/schema.prisma`

## 当前模型（第一版）

### Organization

Organization 是多租户 SaaS 中的租户单位，所有业务数据按 Organization 隔离。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String (cuid) | 主键 |
| name | String | Organization 名称 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |
| deletedAt | DateTime? | 软删除时间 |

表名：`organizations`

### User

Organization 内的员工账号。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | String (cuid) | 主键 |
| organizationId | String | 所属 Organization |
| username | String | 登录用户名（Organization 内唯一） |
| passwordHash | String | bcrypt 密码哈希 |
| name | String | 显示名称 |
| isPlatformAdmin | Boolean | 平台管理员标志（默认 false） |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |
| deletedAt | DateTime? | 软删除时间 |

表名：`users`

唯一约束：`(organizationId, username)`

## 关系

```txt
Organization 1 ── N User
```

## 后续规划

架构文档中规划的后续模型（尚未实现）：

- Role / Permission / UserRole / RolePermission
- 业务表（Departure、Partner、Supplier 等）均预留 `organizationId`

## 通用字段规范

后续业务表建议统一包含：

```txt
id, organizationId, createdAt, updatedAt, deletedAt, createdBy, updatedBy
```

金额字段使用 `Decimal @db.Decimal(12, 2)`。

领域术语见 [CONTEXT.md](../../CONTEXT.md)。
