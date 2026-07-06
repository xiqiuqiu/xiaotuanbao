# Menu Permission 与 Employee 管理 — PRD 摘要

来源：`/grill-with-docs` 会话共识。领域术语见根目录 `CONTEXT.md`；全局 Role Catalog 决策见 `docs/adr/0001-global-role-catalog.md`。

## 目标

第一版实现 Preset Role（企业管理员、财务、计调）的 Menu Permission 体系，以及企业管理员可用的系统管理功能（员工管理、角色只读、组织只读）。

## 不在范围

- Platform Admin 平台管理台
- 自定义 Role 或修改 Preset Role 权限映射
- 操作级 / 数据级权限
- 行程管理、资源管理菜单（未上线）

## 第一版 Menu Key（11）

`/`, `/departure`, `/finance/receivable`, `/finance/payable`, `/finance/transactions`, `/finance/verification`, `/partner`, `/supplier`, `/system/organization`, `/system/users`, `/system/roles`

## Role 映射

| Menu Key | 企业管理员 | 财务 | 计调 |
|----------|:---:|:---:|:---:|
| `/` | ✅ | ✅ | ✅ |
| `/departure` | ✅ | ❌ | ✅ |
| `/finance/*` | ✅ | ✅ | ❌ |
| `/partner`, `/supplier` | ✅ | ❌ | ✅ |
| `/system/*` | ✅ | ❌ | ❌ |

## Issue 拆分

见 `.scratch/role-permission/issues/`（4 个 vertical slice）。
