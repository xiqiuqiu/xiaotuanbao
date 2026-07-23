# 049 — 关闭工作台图表入场动画

- **Status**: TODO
- **Commit**: 03e5455
- **Severity**: HIGH
- **Category**: Accessibility / Purpose & frequency
- **Estimated scope**: 3 files（图表模块）+ 1 可选契约测试

## Problem

工作台是每日高频 crisp 仪表盘。三处 `@ant-design/plots` 图表未设置 `animate`，G2 默认对 `interval` 使用 `scaleInY`、对 `line` 使用 `fadeIn`。进页、刷新、账龄 Segmented 在 `column`/`share` 间切换导致 `Column` remount 时，柱体会整段长入场——属于装饰性运动，且未尊重 `prefers-reduced-motion`。`DESIGN.md` 要求自定义动效提供降级；此处最干净的修法是**直接关掉入场**（与「删除高频装饰动画」一致，也覆盖 reduce 用户）。

当前无 `animate` 的调用点：

```213:245:apps/web/src/pages/FinanceReceivablesModule.tsx
              <Column
                height={220}
                autoFit
                data={agingChart.data}
                xField={agingChart.xField}
                yField={agingChart.yField}
                legend={false}
                tooltip={false}
                scale={{ y: { type: agingChart.scaleYType, nice: true } }}
                axis={{ y: { title: '未收金额（元）' } }}
                style={{ maxWidth: 48, fill: token.colorPrimary, cursor: 'pointer' }}
                labels={[
                  // ...
                ]}
                onReady={onReady}
              />
```

```112:149:apps/web/src/pages/OrganizationScaleModule.tsx
            <DualAxes
              height={280}
              autoFit
              xField="month"
              legend={{ color: { position: 'top' } }}
              tooltip={{ /* ... */ }}
              onReady={onReady}
            >
              {[
                {
                  data: chartRows,
                  type: 'interval',
                  yField: 'departureCount',
                  // ... 无 animate
                },
                {
                  data: chartRows,
                  type: 'line',
                  yField: 'guestCount',
                  // ... 无 animate
                },
              ]}
            </DualAxes>
```

同构：`apps/web/src/pages/CoordinatorTrendModule.tsx` 内 `DualAxes` 的 `interval` / `line` 子 mark（约 118–148 行）也无 `animate`。

## Target

工作台全部图表**始终**关闭动画（不引入 `matchMedia` 分支——关掉即满足 reduce 与 crisp 气质）：

```tsx
// FinanceReceivablesModule Column — target
<Column
  /* 既有 props 不变 */
  animate={false}
  onReady={onReady}
/>
```

```tsx
// DualAxes 每个 child mark — target（Scale + Trend 两处）
{
  data: chartRows,
  type: 'interval',
  yField: 'departureCount',
  animate: false,
  /* 其余既有字段不变 */
},
{
  data: chartRows,
  type: 'line',
  yField: 'guestCount',
  animate: false,
  /* 其余既有字段不变 */
},
```

G2 / `@ant-design/plots` v2：`animate: false` 关闭 enter/update/exit。不要改成「缩短 duration」或保留 `scaleInY`。

## Repo conventions to follow

- 动效只表达状态；工作台已有 CSS 按压用 `var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1))`（见 `HomePage.module.css`）。
- 图表点击订阅已集中在 `useWorkbenchChartElementClick`（plan 027）——**不要**改动该 hook 的 on/off 语义，只加 `animate`。
- 契约测试风格可参考 `apps/web/src/styles/motion-cohesion.test.ts`（读源码断言字符串），或模块现有 `*.aging-chart.test.tsx`。

Exemplar（同页 CSS 已正确降级运动）：

```494:509:apps/web/src/pages/HomePage.module.css
@media (prefers-reduced-motion: reduce) {
  .metricButton,
  .queueItem,
  .settlementQueueItem,
  .trendDayButton,
  .agingShareRow {
    transition: border-color 100ms ease, background-color 100ms ease;
  }
  /* ... transform: none on :active */
}
```

## Steps

1. `apps/web/src/pages/FinanceReceivablesModule.tsx`：在账龄 `Column` 上增加 `animate={false}`（与 `onReady` 同级）。
2. `apps/web/src/pages/CoordinatorTrendModule.tsx`：给 `DualAxes` children 数组里 **interval** 与 **line** 两个对象各加 `animate: false`。
3. `apps/web/src/pages/OrganizationScaleModule.tsx`：同上，interval + line 各加 `animate: false`。
4. 可选但推荐：新增 `apps/web/src/pages/workbench-chart-animation.test.ts`，`readFileSync` 断言三文件均含 `animate={false}` 或 `animate: false`（DualAxes 子配置），防止回归。
5. 跑聚焦测试与 typecheck（见 Verification）。

## Boundaries

- Do NOT 改图表数据、`onReady` / `useWorkbenchChartElementClick`、tooltip、labels、颜色、高度。
- Do NOT 给非工作台图表（若他处有 plots）一并改动，除非同 PR 明确扩展。
- Do NOT 新增 motion 库或 `useReducedMotion` hook（本方案用恒定 `animate: false`）。
- Do NOT 改 `HomePage.module.css` 按压动效。
- 若 `@ant-design/plots` API 漂移导致类型报错，STOP 并报告实际 prop 名，不要猜测替代 API。

## Verification

- **Mechanical**：
  - `pnpm --filter web exec vitest run src/pages/FinanceReceivablesModule.aging-chart.test.tsx src/pages/HomePage.test.tsx`
  - 若加了契约测试：一并 `vitest run` 该文件
  - `pnpm --filter web typecheck`
- **Feel check**：
  - 以财务 / 计调 / 企业管理员工作台分别进页：柱状/折线应**立即**出现，无自下向上长柱或折线淡入。
  - 财务账龄 Segmented 在「金额对比」↔「结构占比」间切换再回到柱状：柱再次出现时仍无 `scaleInY`。
  - DevTools → Rendering → 勾选 `prefers-reduced-motion: reduce`：图表仍无运动（本方案恒关，应无差别）。
  - 点击柱/日条导航行为与改前一致。
- **Done when**：三处图表配置均显式 `animate: false`；相关 vitest + typecheck 绿；手测无入场长柱。
