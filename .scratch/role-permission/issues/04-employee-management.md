Status: ready-for-agent

# Employee 管理

## What to build

实现设计图中的员工管理功能，供企业管理员管理 Organization 内 Employee 账号、Preset Role 与 Employee Status。

API（Organization 内隔离）：员工列表（含总数 / 启用 / 停用 / 今日新增等统计）、创建 Employee（登录用户名、显示名称、Employee Remark、Preset Role 单选、Employee Status、初始密码 ≥8 位）、编辑、停用。列表展示 Preset Role、Employee Status、Last Login（从未登录 / 具体时间）。保存 Role 时全量替换 UserRole（UI 单选，底层仍支持多 Role）。

前端：员工列表页（筛选、搜索、统计卡片、分页）与创建/编辑抽屉，交互对齐现有设计图。新建计调 Employee 后，该账号登录应仅获得计调 Menu Key。

非企业管理员无法访问员工管理页面与 API。

## Acceptance criteria

- [ ] 企业管理员可创建 Employee，分配 Preset Role（UI 单选），并设置初始密码
- [ ] 企业管理员可编辑 Employee 的显示名称、Employee Remark、Preset Role、Employee Status
- [ ] 企业管理员可停用 Employee；停用后该账号无法登录
- [ ] 列表正确展示 Preset Role、Employee Status、Last Login
- [ ] 新建的计调 Employee 登录后菜单与 Menu Permission 映射一致（无财务、无系统管理）
- [ ] 财务、计调无法访问 `/system/users` 页面或对应 API

## Blocked by

- 02-menu-permission-session
