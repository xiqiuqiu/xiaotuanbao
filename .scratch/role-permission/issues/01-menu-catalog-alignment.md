Status: ready-for-agent

# 对齐第一版菜单目录

## What to build

将侧边栏与路由与第一版产品范围对齐，为后续 Menu Permission seed 提供正确的 Menu Key 基础。移除尚未上线的「行程管理」「资源管理」；将「客户/同行管理」展示名改为「合作伙伴」（Menu Key 仍为 `/partner`）。

此 slice 尚未引入 Menu Permission 过滤——任意已登录 User 仍看到同一套（已精简后的）菜单。

## Acceptance criteria

- [ ] 侧边栏与路由中不存在 `/itinerary`（行程管理）与 `/resource`（资源管理）
- [ ] `/partner` 菜单展示名为「合作伙伴」
- [ ] 直接访问已移除的路由路径返回 404
- [ ] 其余第一版 Menu Key 路由仍可正常访问（占位页即可）

## Blocked by

None — can start immediately
