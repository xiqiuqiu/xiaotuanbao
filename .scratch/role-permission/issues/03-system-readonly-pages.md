Status: ready-for-agent

# 系统管理只读页（Preset Role + Organization）

## What to build

为企业管理员提供两个只读系统管理页面，并在 `/system/*` 类 API 上强制 Menu Permission 后端校验（第一版 Guard 机制在此 slice 引入并复用）。

`GET /roles`：返回三个 Preset Role 及其各自 `menuKeys`（只读，不可修改映射）。`GET /organization`：返回当前 User 所属 Organization 的名称（只读，第一版不支持改名）。

前端：`/system/roles` 展示 Preset Role 权限矩阵；`/system/organization` 展示 Organization 基本信息。财务、计调访问上述页面或 API 应被拒绝（403）。

## Acceptance criteria

- [ ] 企业管理员可访问 `/system/roles` 并看到三个 Preset Role 及其 Menu Key 列表
- [ ] 企业管理员可访问 `/system/organization` 并看到当前 Organization 名称
- [ ] 财务、计调访问 `/system/roles`、`/system/organization` 页面或对应 API 返回 403
- [ ] Menu Permission Guard 可在后续 slice 中复用于其他 `/system/*` API

## Blocked by

- 02-menu-permission-session
