import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('publishes only the latest value after the delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: '' } },
    )

    expect(result.current).toBe('')
    rerender({ value: '上' })
    rerender({ value: '上海' })

    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe('')

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('上海')
  })

  it('clears its pending timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const { rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: 'first' } },
    )

    rerender({ value: 'second' })
    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })
})
