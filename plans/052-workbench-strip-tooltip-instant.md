# 052 — 工作台日/月条 Tooltip 扫掠零延迟

- **Status**: DONE
- **Commit**: 03e5455
- **Severity**: MEDIUM
- **Category**: Purpose & frequency / Easing & duration
- **Estimated scope**: 2 files（`CoordinatorTrendModule.tsx`、`OrganizationScaleModule.tsx`）+ 测试更新

## Problem

计调「团量与客流」日条、企业管理员「业务规模」月条，每个按钮外包一层 antd `Tooltip`。横向扫过 6–14 个控件时，每个都吃默认 `mouseEnterDelay`（antd 默认 0.1s）+ 浮层动画，AUDIT：「工具条上 tooltip delay + animation——首个之后应瞬时」。信息已在按钮 `aria-label` 与条内可见文案中，Tooltip 是增强而非唯一通道。

当前：

```151:171:apps/web/src/pages/CoordinatorTrendModule.tsx
          <Flex className={styles.trendDayStrip} wrap gap={4}>
            {buckets.map((bucket) => (
              <Tooltip key={bucket.date} title={bucketTooltipTitle(bucket)}>
                <button
                  type="button"
                  className={styles.trendDayButton}
                  aria-label={bucketAriaLabel(bucket)}
                  onClick={() => void navigate({ to: bucket.href })}
                >
                  {/* ... */}
                </button>
              </Tooltip>
            ))}
          </Flex>
```

```153:179:apps/web/src/pages/OrganizationScaleModule.tsx
          <Flex className={styles.trendDayStrip} wrap gap={4}>
            {buckets.map((bucket) => (
              <Tooltip key={bucket.month} title={bucketTooltipTitle(bucket)}>
                <button
                  type="button"
                  className={styles.trendDayButton}
                  {/* ... */}
                </button>
              </Tooltip>
            ))}
          </Flex>
```

`HomePage.test.tsx` 有 `user.hover` 断言 tooltip 文案（约「tomorrow」日条、当前月条）——改 delay 后仍应能测到内容，可能需 `waitFor` 或因 delay=0 更快出现。

## Target

两处 `Tooltip` 增加：

```tsx
<Tooltip
  key={bucket.date /* 或 month */}
  title={bucketTooltipTitle(bucket)}
  mouseEnterDelay={0}
  mouseLeaveDelay={0.1}
>
  <button /* 既有 props 不变 */ />
</Tooltip>
```

- `mouseEnterDelay={0}`：扫掠时立即出 tip（满足「instant after first」的实用近似；实现共享 open 状态成本更高，本计划不要求）。
- `mouseLeaveDelay={0.1}`：略留移入相邻按钮的间隙，避免闪烁（0.1s = antd 常见 leave；单位为**秒**）。
- **保留** `Tooltip` 与 `bucketTooltipTitle` 富文本（发团数/客人/待补等），不要改成裸 `title=` 除非测试与产品明确要求简化。
- 不要改 `HomePage.tsx` 结算卡标题旁的 Info `Tooltip`（非扫掠条）。

## Repo conventions to follow

- antd v6 `Tooltip`：`mouseEnterDelay` / `mouseLeaveDelay` 单位为秒。
- 工作台测试：`apps/web/src/pages/HomePage.test.tsx` 已覆盖 hover 日条/月条——以该文件为回归锚点。
- 动效时长预算：tooltip 浮层仍走 antd `motionDurationFast`（0.1s，见 `AppProviders.tsx`）；本计划只去**进入延迟**，不自定义浮层 CSS。

## Steps

1. `CoordinatorTrendModule.tsx`：日条 `Tooltip` 加 `mouseEnterDelay={0}` 与 `mouseLeaveDelay={0.1}`。
2. `OrganizationScaleModule.tsx`：月条 `Tooltip` 同样设置。
3. 跑 `HomePage.test.tsx` 中相关 hover 用例；若偶发失败，用 `findByText` / `waitFor` 等待 tip 内容，不要加大 delay。
4. 确认结算模块 Info tooltip 未改。

## Boundaries

- Do NOT 删除 `aria-label`。
- Do NOT 引入第三方面板或自研 tooltip。
- Do NOT 改图表 `tooltip={{...}}` 配置（G2 图表提示与日条 Tooltip 无关）。
- Do NOT 全局 ConfigProvider 改所有 Tooltip delay。

## Verification

- **Mechanical**：
  - `pnpm --filter web exec vitest run src/pages/HomePage.test.tsx`
  - `pnpm --filter web typecheck`
- **Feel check**：
  - 计调工作台：鼠标快速滑过未来 14 天日条，tip 应几乎立刻跟上，无「每个停顿 100ms」的顿挫。
  - 企业管理员：滑过近 6 个月条，同样即时。
  - 从条移开：tip 很快消失，不长时间残留。
  - 键盘：focus 按钮时 tip/可访问名仍可用（antd Tooltip 对 focus 的行为保持即可；`aria-label` 必须仍在）。
- **Done when**：两处扫掠条 Tooltip 均为 `mouseEnterDelay={0}`；HomePage 相关测试绿。
