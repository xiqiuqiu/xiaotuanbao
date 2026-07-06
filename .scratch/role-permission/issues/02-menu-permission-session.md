Status: ready-for-agent

# Menu Permission 会话闭环

## What to build

落地全局 Role Catalog 与 Menu Permission 解析，使不同 Preset Role 的 Employee 登录后看到不同菜单，且刷新页面后权限仍正确。

包含：Role / Permission / RolePermission / UserRole 数据模型；User 新增 Employee Status、Employee Remark、Last Login 字段；seed 三个 Preset Role 与 11 个 Menu Key 映射（企业管理员绑定全部 Permission）；演示 admin 绑定企业管理员 Role，可选 seed 一个计调演示账号。

`POST /auth/login` 与 `GET /auth/me` 共用 session 组装逻辑，返回 `roles` 与 `menuKeys`。登录成功更新 Last Login；停用的 Employee 无法登录。

前端：token 恢复时调用 `/auth/me`；按 `menuKeys` 过滤侧边栏；路由 beforeLoad 拦截无 Menu Permission 的路径。

## Acceptance criteria

- [ ] 企业管理员登录后 `menuKeys` 包含全部 11 个第一版 Menu Key，侧边栏与路由守卫一致
- [ ] 计调登录后不可见 `/finance/*` 与 `/system/*` 相关菜单，直接访问对应路径被拦截
- [ ] 财务登录后仅可见 `/` 与 `/finance/*` 相关菜单
- [ ] Employee Status 为停用的 User 无法登录
- [ ] 浏览器刷新后（token 仍有效）通过 `/auth/me` 重新拉取 `menuKeys`，菜单与守卫行为正确
- [ ] 登录成功后 Last Login 有值；从未登录的 Employee 在后续员工列表中可显示为空（列表 UI 可在 issue 04 完成，此处只需数据写入）

## Blocked by

- 01-menu-catalog-alignment
