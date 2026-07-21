import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

type ChartLike = {
  on: (event: string, handler: (event: unknown) => void) => void
  off: (event: string, handler: (event: unknown) => void) => void
}

type ChartStore = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => ChartLike | null
  setChart: (next: ChartLike) => void
}

function createChartStore(): ChartStore {
  let chart: ChartLike | null = null
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return chart
    },
    setChart(next) {
      if (chart === next) {
        return
      }
      chart = next
      listeners.forEach((listener) => listener())
    },
  }
}

function ChartClickSubscription({
  store,
  handler,
}: {
  store: ChartStore
  handler: (event: unknown) => void
}) {
  const chart = useSyncExternalStore(store.subscribe, store.getSnapshot)

  useEffect(() => {
    if (!chart) {
      return
    }
    chart.on('element:click', handler)
    return () => {
      chart.off('element:click', handler)
    }
  }, [chart, handler])

  return null
}

/**
 * plots onReady + element:click。
 * 订阅在独立子节点的 useEffect 里 on/off（满足 cleanup）；
 * onReady 只写入外部 store，不 setState 宿主，避免 plots 因父级重渲染再次 chart.render()。
 * 调用方须渲染返回的 `subscription`（与图表同树即可）。
 */
export function useWorkbenchChartElementClick(
  extractKey: (event: unknown) => string | undefined,
  onSelectKey: (key: string | undefined) => void,
): {
  onReady: (args: { chart: ChartLike }) => void
  subscription: ReactNode
} {
  const extractKeyRef = useRef(extractKey)
  const onSelectKeyRef = useRef(onSelectKey)

  useEffect(() => {
    extractKeyRef.current = extractKey
    onSelectKeyRef.current = onSelectKey
  })

  const storeRef = useRef<ChartStore | null>(null)
  if (storeRef.current == null) {
    storeRef.current = createChartStore()
  }
  const store = storeRef.current

  const handler = useCallback((event: unknown) => {
    onSelectKeyRef.current(extractKeyRef.current(event))
  }, [])

  const onReady = useCallback(({ chart: next }: { chart: ChartLike }) => {
    store.setChart(next)
  }, [store])

  const subscription = <ChartClickSubscription store={store} handler={handler} />

  return { onReady, subscription }
}
