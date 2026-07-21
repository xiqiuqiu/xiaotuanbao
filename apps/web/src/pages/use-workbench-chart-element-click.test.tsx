import { act, cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkbenchChartElementClick } from './use-workbench-chart-element-click'

describe('useWorkbenchChartElementClick', () => {
  afterEach(() => {
    cleanup()
  })

  it('offs element:click on unmount', () => {
    const chart = {
      on: vi.fn(),
      off: vi.fn(),
    }
    const onSelectKey = vi.fn()

    const { result, unmount } = renderHook(() =>
      useWorkbenchChartElementClick(
        (event) => (event as { data?: { data?: { date?: string } } })?.data?.data?.date,
        onSelectKey,
      ),
    )

    const { unmount: unmountSubscription } = render(result.current.subscription)

    act(() => {
      result.current.onReady({ chart })
    })

    expect(chart.on).toHaveBeenCalledWith('element:click', expect.any(Function))

    unmountSubscription()
    unmount()

    expect(chart.off).toHaveBeenCalledWith('element:click', expect.any(Function))
  })

  it('onReady does not re-render the consumer via state', () => {
    const chart = {
      on: vi.fn(),
      off: vi.fn(),
    }
    let renders = 0

    const { result } = renderHook(() => {
      renders += 1
      return useWorkbenchChartElementClick(() => 'month', vi.fn())
    })

    const { unmount: unmountSubscription } = render(result.current.subscription)
    const rendersBeforeReady = renders

    act(() => {
      result.current.onReady({ chart })
    })

    expect(renders).toBe(rendersBeforeReady)
    unmountSubscription()
  })

  it('offs the previous chart when onReady receives a new instance', () => {
    const first = {
      on: vi.fn(),
      off: vi.fn(),
    }
    const second = {
      on: vi.fn(),
      off: vi.fn(),
    }

    const { result } = renderHook(() =>
      useWorkbenchChartElementClick(() => 'month', vi.fn()),
    )

    const { rerender, unmount: unmountSubscription } = render(result.current.subscription)

    act(() => {
      result.current.onReady({ chart: first })
    })
    rerender(result.current.subscription)

    act(() => {
      result.current.onReady({ chart: second })
    })
    rerender(result.current.subscription)

    expect(first.off).toHaveBeenCalledWith('element:click', expect.any(Function))
    expect(second.on).toHaveBeenCalledWith('element:click', expect.any(Function))
    unmountSubscription()
  })
})
