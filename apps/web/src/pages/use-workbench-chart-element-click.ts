import { useCallback, useEffect, useRef } from 'react'

type ChartLike = {
  on: (event: string, handler: (event: unknown) => void) => void
  off: (event: string, handler: (event: unknown) => void) => void
}

/** DualAxes onReady + element:click；卸载/换 chart 时 off，回调始终读最新入参。 */
export function useWorkbenchChartElementClick(
  extractKey: (event: unknown) => string | undefined,
  onSelectKey: (key: string | undefined) => void,
) {
  const extractKeyRef = useRef(extractKey)
  const onSelectKeyRef = useRef(onSelectKey)

  useEffect(() => {
    extractKeyRef.current = extractKey
    onSelectKeyRef.current = onSelectKey
  })

  const chartRef = useRef<ChartLike | null>(null)

  const handler = useCallback((event: unknown) => {
    onSelectKeyRef.current(extractKeyRef.current(event))
  }, [])

  useEffect(() => {
    return () => {
      chartRef.current?.off('element:click', handler)
      chartRef.current = null
    }
  }, [handler])

  // 订阅挂在 DualAxes onReady（plots 交付的 chart 实例），不能放进 setState：
  // 父级再渲染会使 @ant-design/plots useChart 因 config 引用变化再次 chart.render()。
  // 换 chart 时先 off；卸载 cleanup 在上面的 effect。
  const onReady = useCallback(({ chart: next }: { chart: ChartLike }) => {
    chartRef.current?.off('element:click', handler)
    chartRef.current = next
    next.on('element:click', handler)
  }, [handler])

  return { onReady }
}
