import { act, cleanup, renderHook } from '@testing-library/react'
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

    act(() => {
      result.current.onReady({ chart })
    })

    expect(chart.on).toHaveBeenCalledWith('element:click', expect.any(Function))

    unmount()

    expect(chart.off).toHaveBeenCalledWith('element:click', expect.any(Function))
  })
})
