# 014 — Zero workbench strip tooltip enter delay

- **Status**: DONE
- **Commit**: 7530f82
- **Severity**: LOW
- **Category**: Purpose & frequency
- **Estimated scope**: 3 files（三个 Module 的 strip Tooltip），极小

## Problem

工作台图表下方的密集 chip 条（14 日趋势 / 6 月规模 / 3 段账龄）每个 chip 都包了 antd `Tooltip`。扫过条带时，默认 `mouseEnterDelay`（antd ≈ 0.1s）叠加浮层打开动画，会在高频扫视路径上反复「等一下再出 tip」——对运营台这种每天扫多次的面来说属于多余延迟。

```tsx
/* apps/web/src/pages/CoordinatorTrendModule.tsx:154-174 — current */
<Flex className={styles.trendDayStrip} wrap gap={4}>
  {buckets.map((bucket) => (
    <Tooltip key={bucket.date} title={bucketTooltipTitle(bucket)}>
      <button
        type="button"
        className={styles.trendDayButton}
        aria-label={bucketAriaLabel(bucket)}
        onClick={() => void navigate({ to: bucket.href })}
      >
        {/* … */}
      </button>
    </Tooltip>
  ))}
</Flex>
```

```tsx
/* apps/web/src/pages/OrganizationScaleModule.tsx:165-189 — current */
<Flex className={styles.trendDayStrip} wrap gap={4}>
  {buckets.map((bucket) => (
    <Tooltip key={bucket.month} title={bucketTooltipTitle(bucket)}>
      <button
        type="button"
        className={styles.trendDayButton}
        aria-label={bucketAriaLabel(bucket)}
        onClick={() => void navigate({ to: bucket.href })}
      >
        {/* … */}
      </button>
    </Tooltip>
  ))}
</Flex>
```

```tsx
/* apps/web/src/pages/FinanceReceivablesModule.tsx:234-249 — current */
<Flex gap={8} wrap className={styles.trendDayStrip}>
  {buckets.map((bucket) => (
    <Tooltip key={bucket.key} title={bucketTooltipTitle(bucket)}>
      <button
        type="button"
        className={styles.trendDayButton}
        aria-label={bucketAriaLabel(bucket)}
        onClick={() => void navigate({ to: bucket.href })}
      >
        {/* … */}
      </button>
    </Tooltip>
  ))}
</Flex>
```

`HomePage.tsx` 里「待生成应收统计口径」那颗孤立 Info Tooltip **不在本 plan 范围**（不是密集条带）。

## Target

三条 strip 上的每一个 `Tooltip` 都显式：

```tsx
<Tooltip
  mouseEnterDelay={0}
  title={/* existing title unchanged */}
>
```

不要改 `title` 内容、不要加 `open` 受控状态、不要引入 Tooltip 组/共享 context。零延迟即可：条带扫视时 tip 即时跟上；chip 本身已有 `aria-label`，无障碍不依赖 tip 延迟。

## Repo conventions to follow

- 使用 antd `Tooltip` 的 prop，不自写 hover 层。
- 仓库目前几乎没有 `mouseEnterDelay` 先例——本 plan 就是建立「密集工具条 = 0 delay」的惯例。
- 保持 `aria-label` 不变（屏幕阅读器主路径）。

## Steps

1. `CoordinatorTrendModule.tsx`：strip 内 `<Tooltip …>` 增加 `mouseEnterDelay={0}`。
2. `OrganizationScaleModule.tsx`：同上。
3. `FinanceReceivablesModule.tsx`：账龄 strip 内 `<Tooltip …>` 同上。
4. 跑相关单测（若有）与 typecheck。

## Boundaries

- Do NOT 改 `HomePage.tsx` 结算模块里的 Info `Tooltip`。
- Do NOT 改图表 DualAxes 的 tooltip 配置。
- Do NOT 移除 strip Tooltip（产品仍需要完整数值说明）。
- Do NOT 改 CSS / 动效（那是 plan **013**）。
- Do NOT 添加新依赖。
- 若文件结构已把 strip 抽成共享组件：只在共享组件上加一次 `mouseEnterDelay={0}`，并回报路径变化。

## Verification

- **Mechanical**:
  - `pnpm typecheck`
  - `pnpm --filter @xiaotuanbao/web exec vitest run src/pages/HomePage.test.tsx`（覆盖趋势/账龄/规模渲染）
  - `rg 'mouseEnterDelay=\{0\}' apps/web/src/pages/CoordinatorTrendModule.tsx apps/web/src/pages/OrganizationScaleModule.tsx apps/web/src/pages/FinanceReceivablesModule.tsx` 三处均命中。
- **Feel check**:
  - 打开计调工作台趋势卡，鼠标快速横扫日条：tip 几乎无等待跟上；不会在每个 chip 上「顿一下」。
  - 打开企管规模 / 财务账龄条带，同样扫视。
  - 点击 chip 仍导航；`aria-label` 仍可读。
  - DevTools 不必查动画——本 plan 只消 delay，不引入 motion。
- **Done when**: 上述三处 strip Tooltip 均为 `mouseEnterDelay={0}`，且 HomePage 相关测试通过。
