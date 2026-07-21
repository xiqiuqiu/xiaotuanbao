# 027 — 工作台图表点击订阅清理与最新导航闭包

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: HIGH
- **Category**: Bugs & correctness
- **Rule**: react-doctor/effect-needs-cleanup
- **Estimated scope**: 4 文件（1 helper + 3 modules）

## Problem

三处工作台 DualAxes 在 `onReady` 里 `chart.on('element:click', …)`，无 `chart.off`，且 handler 闭合当次 render 的 `navigateBucket` / buckets map。工作台 `workbenchQueryOptions` 为 `staleTime: 0` + focus refetch，图表常 in-place 更新而不重跑 `onReady`，点击可能导航到陈旧 `href`；卸载后订阅也可能残留。

```115:118:apps/web/src/pages/CoordinatorTrendModule.tsx
            onReady={({ chart }) => {
              chart.on('element:click', (event: { data?: { data?: { date?: string } } }) => {
                navigateBucket(event.data?.data?.date)
              })
            }}
```

同构：`FinanceReceivablesModule.tsx:208-211`（字段 `label`）、`OrganizationScaleModule.tsx:135-138`（字段 `month`）。

React Doctor 对此三处报 **error**（`effect-needs-cleanup`），是当前 67 分的主要扣分项之一。

Canonical recipe（[effect-needs-cleanup](https://www.react.doctor/prompts/rules/react-doctor/effect-needs-cleanup.md)）：对 `api.on("select", cb)` 在 cleanup 中 `api.off("select", cb)`；handler 提到具名 const，off 使用同一引用。

## Target

新建共享 hook，用 ref 持有最新 `onSelectKey`，在 `useEffect` 对 chart 实例注册/注销同一 handler：

```tsx
// apps/web/src/pages/use-workbench-chart-element-click.ts — target (new)
import { useCallback, useEffect, useRef } from 'react'

type ChartLike = {
  on: (event: string, handler: (event: unknown) => void) => void
  off: (event: string, handler: (event: unknown) => void) => void
}

/** DualAxes onReady + element:click；卸载/换 chart 时 off，回调始终读最新 ref。 */
export function useWorkbenchChartElementClick(
  onSelectKey: (key: string | undefined) => void,
) {
  const onSelectKeyRef = useRef(onSelectKey)
  onSelectKeyRef.current = onSelectKey

  const chartRef = useRef<ChartLike | null>(null)
  const handlerRef = useRef<(event: unknown) => void>((event) => {
    const key = (event as { data?: { data?: Record<string, unknown> } })?.data?.data
    // 调用方通过闭包外的 adapter 解析 date/label/month；见下
    void key
  })

  // 实际实现：handler 调用 extractKey(event) 再 onSelectKeyRef.current(...)
  // extractKey 由参数传入以适配 date | label | month

  const onReady = useCallback(({ chart }: { chart: ChartLike }) => {
    if (chartRef.current && handlerRef.current) {
      chartRef.current.off('element:click', handlerRef.current)
    }
    chartRef.current = chart
    chart.on('element:click', handlerRef.current)
  }, [])

  useEffect(() => {
    return () => {
      if (chartRef.current && handlerRef.current) {
        chartRef.current.off('element:click', handlerRef.current)
      }
      chartRef.current = null
    }
  }, [])

  return { onReady }
}
```

更精简的可执行形状（推荐执行时按此落地）：

```tsx
export function useWorkbenchChartElementClick(
  extractKey: (event: unknown) => string | undefined,
  onSelectKey: (key: string | undefined) => void,
) {
  const extractKeyRef = useRef(extractKey)
  const onSelectKeyRef = useRef(onSelectKey)
  extractKeyRef.current = extractKey
  onSelectKeyRef.current = onSelectKey

  const chartRef = useRef<{ on: Function; off: Function } | null>(null)
  const handler = useRef((event: unknown) => {
    onSelectKeyRef.current(extractKeyRef.current(event))
  }).current

  useEffect(() => () => {
    chartRef.current?.off('element:click', handler)
    chartRef.current = null
  }, [handler])

  const onReady = useCallback(({ chart }: { chart: { on: Function; off: Function } }) => {
    chartRef.current?.off('element:click', handler)
    chartRef.current = chart
    chart.on('element:click', handler)
  }, [handler])

  return { onReady }
}
```

三模块改为：

```tsx
const { onReady } = useWorkbenchChartElementClick(
  (event) => (event as { data?: { data?: { date?: string } } })?.data?.data?.date,
  navigateBucket,
)
// DualAxes: onReady={onReady}  — 删除内联 chart.on
```

`no-children-prop`（DualAxes 的 `children={[...]}` series 配置）**不要改**——那是 plots API，非 React children 误用。

## Repo conventions to follow

- 新 hook 放 `apps/web/src/pages/`，与 `workbench-query.ts` 同区。
- 保持各模块 `navigateBucket` / strip 按钮导航行为不变。
- 类型勿过度精确到 G2 内部；最小 `on`/`off` 即可。

## Steps

1. 新增 `use-workbench-chart-element-click.ts`（含上述 cleanup + ref）。
2. 改 `CoordinatorTrendModule` / `FinanceReceivablesModule` / `OrganizationScaleModule` 使用 hook，删除内联 `chart.on`。
3. 若有 HomePage 相关测试，确认仍通过；必要时给 hook 加轻量单测（mount → onReady → unmount 调用了 `off`）。

## Boundaries

- Do NOT 改 `workbenchQueryOptions` 的 refetch 策略（属 missed opportunity，另议）。
- Do NOT 为消除 `no-children-prop` 而改 DualAxes series API。
- Do NOT 删除图表点击导航能力。

## Verification

- **Mechanical**: 全量或 scoped React Doctor 清除三处 `effect-needs-cleanup`；分数上升；`pnpm --filter web typecheck`。
- **Behavior**: 首页工作台打开计调趋势 → 点击柱/线 → 进入对应列表；触发窗口 focus refetch 后再点，仍进入**最新** buckets 的 href；离开首页后无控制台/泄漏异常。
- **Done when**: 三处诊断清除，点击导航在 refetch 后仍正确。
