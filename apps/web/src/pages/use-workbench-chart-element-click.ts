import { useCallback, useEffect, useEffectEvent, useState } from 'react'

type ChartLike = {
  on: (event: string, handler: (event: unknown) => void) => void
  off: (event: string, handler: (event: unknown) => void) => void
}

/** DualAxes onReady + element:click；卸载/换 chart 时 off，回调始终读最新入参。 */
export function useWorkbenchChartElementClick(
  extractKey: (event: unknown) => string | undefined,
  onSelectKey: (key: string | undefined) => void,
) {
  const onElementClick = useEffectEvent((event: unknown) => {
    onSelectKey(extractKey(event))
  })

  const [chart, setChart] = useState<ChartLike | null>(null)

  useEffect(() => {
    if (!chart) return
    chart.on('element:click', onElementClick)
    return () => {
      chart.off('element:click', onElementClick)
    }
  }, [chart])

  const onReady = useCallback(({ chart: next }: { chart: ChartLike }) => {
    setChart(next)
  }, [])

  return { onReady }
}
