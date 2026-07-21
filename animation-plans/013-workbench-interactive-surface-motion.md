# 013 — Unify workbench interactive surface motion

- **Status**: DONE（worktree `animation/013-workbench-interactive-surface-motion`，未合入 main）
- **Commit**: 7530f82
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion & tokens / Physicality & origin / Accessibility（合并审计 #1–#4）
- **Estimated scope**: 1 file (`apps/web/src/pages/HomePage.module.css`), small；可选同步 `motion-cohesion.test.ts`

## Problem

工作台今天交付的三类自定义可点击面手感不一致，且与仓库已统一的 press / hover 惯例脱节。

```css
/* apps/web/src/pages/HomePage.module.css:146-177 — current */
.queueItem {
  display: flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  color: inherit;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--ant-color-border-secondary);
  background: transparent;
  cursor: pointer;
}

.queueItem:hover {
  background: var(--ant-color-fill-tertiary);
}

.queueItem:active {
  background: var(--ant-color-fill-secondary);
}
```

```css
/* apps/web/src/pages/HomePage.module.css:189-211 — current */
.metricButton {
  position: relative;
  min-width: 0;
  padding: 16px 20px;
  text-align: left;
  color: inherit;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: var(--ant-border-radius-lg);
  background: var(--ant-color-bg-container);
  cursor: pointer;
  transition: border-color var(--ant-motion-duration-mid), background-color var(--ant-motion-duration-mid);
}

.metricButton:not(:disabled):active {
  background: var(--ant-color-primary-bg);
}
```

```css
/* apps/web/src/pages/HomePage.module.css:250-270 — current */
.trendDayButton {
  display: flex;
  min-width: 72px;
  flex: 1 1 72px;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  color: inherit;
  text-align: left;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: var(--ant-border-radius);
  background: var(--ant-color-bg-container);
  cursor: pointer;
}

.trendDayButton:hover,
.trendDayButton:focus-visible {
  border-color: var(--ant-color-primary-border);
  outline: 2px solid var(--ant-color-primary-border);
  outline-offset: 2px;
}
```

```css
/* apps/web/src/pages/HomePage.module.css:309-313 — current */
@media (prefers-reduced-motion: reduce) {
  .metricButton {
    transition: none;
  }
}
```

具体问题：

1. Hover 用 `motion-duration-mid`（主题里是 `0.2s`），但 `DESIGN.md` Elevation 写明 Hover/Focus ≈ **100ms**；`AppProviders.tsx` 已锁 `motionDurationFast: '0.1s'`。
2. `.queueItem` / `.trendDayButton` hover 颜色瞬切，同页 `.metricButton` 有过渡 → 决策面割裂。
3. 三类控件都是原生 `<button>`，吃不到 `global.css` 的 `.ant-btn:active { scale(0.97) }`，无按压反馈。
4. reduced-motion 把 `.metricButton` 的 color 过渡也掐掉；仓库惯例是保留 color/opacity、去掉位移。

## Target

三类控件共用同一套交互动效配方（数值勿改写）：

| 属性 | 值 |
| --- | --- |
| Color / border hover | `100ms ease` |
| Transform press | `100ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))` |
| Active scale | `0.97`（仅 `:not(:disabled):active`） |
| Reduced motion | 保留 `border-color` / `background-color` 的 `100ms ease`；`transform: none` |

目标 CSS（整段替换/合并到现有选择器，勿改布局属性）：

```css
/* target — queueItem */
.queueItem {
  /* …existing layout props unchanged… */
  transition:
    background-color 100ms ease,
    transform 100ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1));
}

.queueItem:not(:disabled):active {
  background: var(--ant-color-fill-secondary);
  transform: scale(0.97);
}

/* target — metricButton */
.metricButton {
  /* …existing layout props unchanged… */
  transition:
    border-color 100ms ease,
    background-color 100ms ease,
    transform 100ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1));
}

.metricButton:not(:disabled):active {
  background: var(--ant-color-primary-bg);
  transform: scale(0.97);
}

/* target — trendDayButton */
.trendDayButton {
  /* …existing layout props unchanged… */
  transition:
    border-color 100ms ease,
    transform 100ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1));
}

.trendDayButton:active {
  transform: scale(0.97);
}

/* target — reduced motion */
@media (prefers-reduced-motion: reduce) {
  .metricButton,
  .queueItem,
  .trendDayButton {
    transition: border-color 100ms ease, background-color 100ms ease;
  }

  .metricButton:not(:disabled):active,
  .queueItem:not(:disabled):active,
  .trendDayButton:active {
    transform: none;
  }
}
```

说明：`.queueItem` 没有 border-color 过渡也没关系——reduced-motion 块里写上 `border-color` 是无害的统一写法（与 `ExecutionTab.module.css` 的 reduce 块一致）。删除旧的「仅 `.metricButton { transition: none }`」块。

若原有 `.queueItem:active { background: … }` 选择器仍在，合并进 `:not(:disabled):active`，避免两套 active 规则打架。

## Repo conventions to follow

- 不新增平行 CSS Token（`DESIGN.md`）；easing 只用  
  `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))`。
- Color 用字面 `100ms ease`（hover），transform 用 ease-out-quint（press）——与登录提交按钮一致：

```css
/* exemplar — apps/web/src/pages/LoginPage.module.css:233-250 */
.submit {
  transition:
    transform 100ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1)),
    background-color 100ms ease;
}
.submit:active {
  transform: scale(0.97);
}
```

```css
/* exemplar — apps/web/src/features/departure/components/ExecutionTab.module.css:89-96 + 133-140 */
.segmentItem {
  transition:
    background-color 100ms ease,
    border-color 100ms ease,
    transform 100ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1));
}
.segmentItem:has(.segmentItemSelect:active) {
  transform: scale(0.97);
}
@media (prefers-reduced-motion: reduce) {
  .segmentItem {
    transition: background-color 100ms ease, border-color 100ms ease;
  }
  .segmentItem:has(.segmentItemSelect:active) {
    transform: none;
  }
}
```

- 可选：把 `../pages/HomePage.module.css` 加入 `apps/web/src/styles/motion-cohesion.test.ts` 的 `motionCssFiles`，保证 ease-out 只以 ant CSS var 形式出现。

## Steps

1. 打开 `apps/web/src/pages/HomePage.module.css`。
2. 在 `.queueItem` 增加上述 `transition`；把 `.queueItem:active` 改成 `.queueItem:not(:disabled):active` 并加上 `transform: scale(0.97)`；保留现有 hover / focus-visible / disabled 视觉。
3. 把 `.metricButton` 的 `transition` 从 `var(--ant-motion-duration-mid)` 换成目标三段式；在 `:not(:disabled):active` 上加 `transform: scale(0.97)`。
4. 在 `.trendDayButton` 加 `transition` 与 `:active { transform: scale(0.97) }`；不要改 hover/focus outline。
5. 用目标 reduced-motion 块整体替换现有 `309-313` 行块（覆盖三类控件）。
6. （可选）更新 `motion-cohesion.test.ts` 的文件列表。
7. 跑验证命令。

## Boundaries

- Do NOT 改 TSX / 模块结构 / 图表配置 / lazy `Suspense`。
- Do NOT 给表格行、`Button type="link"`、刷新按钮加 scale（它们走 antd `.ant-btn`）。
- Do NOT 引入 Framer Motion / 新依赖 / 新 CSS 变量名。
- Do NOT 加 metric-card enter、softFetching、Skeleton 淡入（那是错失机会，不在本 plan）。
- Do NOT 改 `AppProviders` 的 motion duration token。
- 若打开文件后行号或选择器已漂移：STOP，回报现状，不要即兴扩 scope。

## Verification

- **Mechanical**:
  - `pnpm typecheck`
  - 若改了 cohesion 测试：`pnpm --filter @xiaotuanbao/web exec vitest run src/styles/motion-cohesion.test.ts`
  - 确认 CSS 中不再出现 `.metricButton` + `motion-duration-mid`，且 reduced-motion 下没有 `transition: none` 作用于这三类控件。
- **Feel check**（工作台三个角色模板都点一遍）：
  - Hover 指标卡 / 队列行 / 日条：边框或底色约 100ms 跟上指针，不拖泥带水。
  - 快速按下再松开：轻微 `0.97` 压感，与页面上普通 antd 按钮一致；连点不会「卡在缩小态」。
  - DevTools Animations 面板 10% 速度：color 用 ease，transform 用 ease-out-quint，时长 100ms。
  - Rendering → `prefers-reduced-motion: reduce`：无 scale，但 hover 边框/底色仍有短过渡。
- **Done when**:
  - `.metricButton` / `.queueItem` / `.trendDayButton` 均具备 100ms color(+border) + 100ms press scale 配方；
  - reduced-motion 保留 color、去掉 transform；
  - 无 `motion-duration-mid` 用在这三类 hover 上。
