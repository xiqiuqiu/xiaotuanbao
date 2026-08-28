import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftLifecycle } from './use-draft-lifecycle'

const navigationGuard = vi.hoisted(() => ({
  shouldBlockFn: null as null | ((args: {
    current: { pathname: string }
    next: { pathname: string }
  }) => boolean | Promise<boolean>),
  enableBeforeUnload: undefined as undefined | boolean | (() => boolean),
}))

vi.mock('@tanstack/react-router', () => ({
  useBlocker: (opts: {
    shouldBlockFn: (args: {
      current: { pathname: string }
      next: { pathname: string }
    }) => boolean | Promise<boolean>
    enableBeforeUnload?: boolean | (() => boolean)
  }) => {
    navigationGuard.shouldBlockFn = opts.shouldBlockFn
    navigationGuard.enableBeforeUnload = opts.enableBeforeUnload
  },
}))

describe('useDraftLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigationGuard.shouldBlockFn = null
    navigationGuard.enableBeforeUnload = undefined
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('debounces autosave and flushes immediately on demand', async () => {
    let dirty = true
    const persist = vi.fn().mockImplementation(async () => {
      dirty = false
    })
    const { result } = renderHook(() =>
      useDraftLifecycle({
        persist,
        isDirty: () => dirty,
        debounceMs: 800,
      }),
    )

    act(() => {
      result.current.scheduleAutosave()
      result.current.scheduleAutosave()
    })
    expect(persist).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(persist).toHaveBeenCalledTimes(1)

    persist.mockClear()
    dirty = true
    await act(async () => {
      await result.current.flush()
    })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('saved')
  })

  it('exposes a retry after persist failure', async () => {
    let dirty = true
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockImplementationOnce(async () => {
        dirty = false
      })
    const { result } = renderHook(() =>
      useDraftLifecycle({
        persist,
        isDirty: () => dirty,
      }),
    )

    await act(async () => {
      await expect(result.current.flush()).rejects.toThrow('网络中断')
    })
    expect(result.current.saveStatus).toBe('error')
    expect(result.current.saveError?.message).toBe('网络中断')

    await act(async () => {
      await result.current.retrySave()
    })
    expect(persist).toHaveBeenCalledTimes(2)
    expect(result.current.saveStatus).toBe('saved')
  })

  it('flushes dirty drafts before SPA navigation and stays when save fails', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('保存失败'))
    renderHook(() =>
      useDraftLifecycle({
        persist,
        isDirty: () => true,
      }),
    )

    const blocked = await navigationGuard.shouldBlockFn?.({
      current: { pathname: '/departure/new' },
      next: { pathname: '/' },
    })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(blocked).toBe(true)
  })

  it('does not flush or block same-path search updates', async () => {
    const persist = vi.fn()
    renderHook(() =>
      useDraftLifecycle({
        persist,
        isDirty: () => true,
      }),
    )

    const blocked = await navigationGuard.shouldBlockFn?.({
      current: { pathname: '/departure/new' },
      next: { pathname: '/departure/new' },
    })
    expect(persist).not.toHaveBeenCalled()
    expect(blocked).toBe(false)
  })

  it('proceeds after a successful leave-time flush', async () => {
    let dirty = true
    const persist = vi.fn().mockImplementation(async () => {
      dirty = false
    })
    renderHook(() =>
      useDraftLifecycle({
        persist,
        isDirty: () => dirty,
      }),
    )

    const blocked = await navigationGuard.shouldBlockFn?.({
      current: { pathname: '/departure/new' },
      next: { pathname: '/departure' },
    })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(blocked).toBe(false)
  })
})
