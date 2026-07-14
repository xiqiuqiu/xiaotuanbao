# 012 — 为侧栏折叠按钮补充动态 Tooltip

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: LOW
- **Category**: Accessibility
- **Rule**: custom/icon-button-missing-tooltip
- **Estimated scope**: 2 files, about 35 lines including test

## Problem

主壳侧栏开关是纯图标按钮。它已有可访问名称，但没有可见 Tooltip；用户必须从图标猜测动作，且折叠状态改变后提示应同步变化。

    // apps/web/src/layouts/MainLayout.tsx:113 — current
    <Button
      className={styles.collapseButton}
      type="text"
      icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      onClick={toggleSidebar}
      aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
    />

`DESIGN.md` 的 Buttons 约束允许 aria-label 或 Tooltip；本计划是低风险可发现性增强，不宣称当前按钮缺少无障碍名称。Navigation 章节要求折叠态保留 Tooltip，本开关也应明确“展开/折叠侧边栏”。

## Target

只引入 Ant Design Tooltip，复用一个 label，避免 Tooltip 与 aria-label 漂移：

    // apps/web/src/layouts/MainLayout.tsx — target
    import { Layout, Menu, Breadcrumb, Button, Dropdown, Tooltip, theme } from 'antd'

    const sidebarToggleLabel = sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'

    <Tooltip title={sidebarToggleLabel} placement="bottom">
      <Button
        className={styles.collapseButton}
        type="text"
        icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={toggleSidebar}
        aria-label={sidebarToggleLabel}
      />
    </Tooltip>

## Repo conventions to follow

- `apps/web/src/features/departure/components/ExecutionTab.tsx:461` 是 antd `Tooltip title={...}` 包裹单一触发元素的现有范例。
- 保留现有 `aria-label`；Tooltip 是视觉补充，不替代 accessible name。
- 不给已有文字的用户菜单按钮加 Tooltip；它不是纯图标控件。

## Steps

1. 在 `MainLayout.tsx` 引入 Tooltip，并在 hooks/state 后计算 `sidebarToggleLabel`。
2. 按 Target 包裹唯一的 collapse Button；Button props 与 click handler 不变。
3. 新建 `apps/web/src/layouts/MainLayout.test.tsx`（若父级计划已建立该测试则追加）：mock router/auth/ui store，断言初始按钮 accessible name 与 hover 后 Tooltip 文案一致；触发 toggle 后 rerender，二者都切换为相反动作。
4. 用 fake/real timers 按 antd Tooltip 测试惯例等待浮层，不用脆弱 class selector。

## Boundaries

- 只处理 `MainLayout` 的侧栏开关；不批量包装有文字按钮或已有 Tooltip 的控件。
- 不删除 aria-label，不修改 sidebar 宽度、breakpoint、collapsedWidth 或 store。
- 不新增 CSS、依赖或自定义 tooltip。
- 若代码偏离 commit `b77379c`，停止并报告。

## Verification

- **Mechanical**:
  - `pnpm --filter @xiaotuanbao/web test -- MainLayout`
  - `pnpm --filter @xiaotuanbao/web typecheck && pnpm --filter @xiaotuanbao/web lint`
  - `npx react-doctor@latest --scope changed` 清除目标诊断且分数不下降。
- **Behavior check**: 桌面端 hover/focus 侧栏图标，展开时显示“折叠侧边栏”，折叠后显示“展开侧边栏”；键盘与读屏名称同步，点击仍只切换一次。用 Highlight updates 确认 Tooltip 不导致 Content 子树额外刷新。
- **Done when**: 动态 Tooltip 和 aria-label 始终一致，折叠逻辑与布局无回归，测试通过。
