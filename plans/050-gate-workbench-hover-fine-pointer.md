# 050 — 工作台 hover 仅限精细指针

- **Status**: TODO
- **Commit**: 03e5455
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 CSS 文件（`HomePage.module.css`）+ 可选契约测试

## Problem

工作台交互面（队列行、结算行、指标卡、账龄占比行、日/月条）用裸 `:hover` 改背景或描边。触控设备上 tap 常会「粘住」hover 态。AUDIT 要求运动/hover 视觉包在 `@media (hover: hover) and (pointer: fine)`；同仓登录页已有范式。

当前（节选）：

```191:193:apps/web/src/pages/HomePage.module.css
.settlementQueueItem:hover {
  background: var(--ant-color-fill-tertiary);
}
```

```284:286:apps/web/src/pages/HomePage.module.css
.queueItem:hover {
  background: var(--ant-color-fill-tertiary);
}
```

```319:324:apps/web/src/pages/HomePage.module.css
.metricButton:not(:disabled):hover,
.metricButton:focus-visible {
  border-color: var(--ant-color-primary-border);
  outline: 2px solid var(--ant-color-primary-border);
  outline-offset: 2px;
}
```

```381:386:apps/web/src/pages/HomePage.module.css
.agingShareRow:hover,
.agingShareRow:focus-visible {
  border-color: var(--ant-color-primary-border);
  outline: 2px solid var(--ant-color-primary-border);
  outline-offset: 2px;
}
```

```428:433:apps/web/src/pages/HomePage.module.css
.trendDayButton:hover,
.trendDayButton:focus-visible {
  border-color: var(--ant-color-primary-border);
  outline: 2px solid var(--ant-color-primary-border);
  outline-offset: 2px;
}
```

注意：`.metricButton` / `.agingShareRow` / `.trendDayButton` 把 `:hover` 与 `:focus-visible` **写在同一规则**。拆分时必须让 **focus-visible 留在 media 外**，否则键盘焦点环会在「不能 hover」的环境里消失。

## Target

```css
/* apps/web/src/pages/HomePage.module.css — target */

/* focus-visible 始终可用（键盘） */
.metricButton:not(:disabled):focus-visible,
.agingShareRow:focus-visible,
.trendDayButton:focus-visible {
  border-color: var(--ant-color-primary-border);
  outline: 2px solid var(--ant-color-primary-border);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .settlementQueueItem:hover {
    background: var(--ant-color-fill-tertiary);
  }

  .queueItem:hover {
    background: var(--ant-color-fill-tertiary);
  }

  .metricButton:not(:disabled):hover {
    border-color: var(--ant-color-primary-border);
    outline: 2px solid var(--ant-color-primary-border);
    outline-offset: 2px;
  }

  .agingShareRow:hover {
    border-color: var(--ant-color-primary-border);
    outline: 2px solid var(--ant-color-primary-border);
    outline-offset: 2px;
  }

  .trendDayButton:hover {
    border-color: var(--ant-color-primary-border);
    outline: 2px solid var(--ant-color-primary-border);
    outline-offset: 2px;
  }
}
```

- `:active` / `prefers-reduced-motion` 块**不要**放进该 media；保持现有按压与 reduce 行为。
- `HomePage.metric-outline-clip.test.ts` 若断言了 `.metricButton:not(:disabled):hover` 的 outline，更新正则以匹配 media 内规则，或改为同时断言 focus-visible 规则仍含 outline。

## Repo conventions to follow

Exemplar — 登录页已正确门控 hover：

```495:499:apps/web/src/pages/LoginPage.module.css
@media (hover: hover) and (pointer: fine) {
  .submit:hover {
    background: var(--ant-color-primary);
  }
}
```

- Hover/Focus 时长仍为约 100ms（`DESIGN.md`）；本计划只改选择器作用域，不改 duration/easing。
- outline + outline-offset 契约见 `apps/web/src/pages/HomePage.metric-outline-clip.test.ts`——改完后必须仍绿。

## Steps

1. 打开 `apps/web/src/pages/HomePage.module.css`。
2. 删除五处裸 `:hover` 规则（及 hover+focus-visible 合并规则中的 hover 部分）。
3. 保留/写出独立的 `:focus-visible` 规则（metric / agingShare / trendDay）。
4. 在文件合适位置（建议在现有 `@media (prefers-reduced-motion: reduce)` **之前**）加入 `@media (hover: hover) and (pointer: fine)`，放入五类 hover 样式，值与改前完全一致。
5. 更新 `HomePage.metric-outline-clip.test.ts` 若因选择器搬家失败。
6. 可选：契约测试断言 CSS 含 `@media (hover: hover) and (pointer: fine)` 且含 `.queueItem:hover`。

## Boundaries

- Do NOT 改 JSX / 模块 TSX。
- Do NOT 改 `:active` 的 `scale(...)` 或 reduced-motion 块逻辑（053 另管 scale 数值）。
- Do NOT 给全局 antd 组件加 hover media（范围仅 `HomePage.module.css`）。
- Do NOT 去掉 focus outline（无障碍回归）。

## Verification

- **Mechanical**：
  - `pnpm --filter web exec vitest run src/pages/HomePage.metric-outline-clip.test.ts src/pages/HomePage.test.tsx`
  - `pnpm --filter web typecheck`（若只改 CSS 可跳过，但建议跑）
- **Feel check**：
  - 桌面鼠标：队列行 / 指标卡 / 日条 hover 视觉与改前相同。
  - 键盘 Tab 到指标卡 / 日条：仍有 2px primary outline。
  - DevTools 设备模拟触控（或真机）：tap 队列行后**不应**残留 hover 底色；导航仍正常。
  - `prefers-reduced-motion: reduce`：按压仍无 scale，色变可保留。
- **Done when**：所有工作台自定义 hover 均在 fine-pointer media 内；focus-visible 在外；相关测试绿。
