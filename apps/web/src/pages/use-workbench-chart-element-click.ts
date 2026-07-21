import { useCallback, useEffect, useRef } from 'react'

type ChartLike = {
  on: (event: string, handler: (event: unknown) => void) => void
  off: (event: string, handler: (event: unknown) => void) => void
}

/** DualAxes onReady + element:click；卸载/换 chart 时 off，回调始终读最新 ref。 */
export function useWorkbenchChartElementClick(
  extractKey: (event: unknown) => string | undefined,
  onSelectKey: (key: string | undefined) => void,
) {
  const extractKeyRef = useRef(extractKey)
  const onSelectKeyRef = useRef(onSelectKey)
  extractKeyRef.current = extractKey
  onSelectKeyRef.current = onSelectKey

  const chartRef = useRef<ChartLike | null>(null)
  const handler = useRef((event: unknown) => {
    onSelectKeyRef.current(extractKeyRef.current(event))
  }).current

  useEffect(
    () => () => {
      chartRef.current?.off('element:click', handler)
      chartRef.current = null
    },
    [handler],
  )

  const onReady = useCallback(
    ({ chart }: { chart: ChartLike }) => {
      chartRef.current?.off('element:click', handler)
      chartRef.current = chart
      chart.on('element:click', handler)
    },
    [handler],
  )

  return { onReady }
}
