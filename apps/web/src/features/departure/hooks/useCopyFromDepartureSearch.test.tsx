import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { message } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCopyFromDepartureSearch } from './useCopyFromDepartureSearch'

const getDeparture = vi.fn()
const listSegments = vi.fn()

vi.mock('@/services/departure.service', () => ({
  getDeparture: (...args: unknown[]) => getDeparture(...args),
}))

vi.mock('@/services/segment.service', () => ({
  listSegments: (...args: unknown[]) => listSegments(...args),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function departure(id: string) {
  return {
    id,
    departureNo: `NO-${id}`,
    routeName: `Route ${id}`,
    dayCount: 3,
  }
}

const segmentResult = {
  items: [],
  total: 0,
  summary: {
    segmentCount: 2,
    totalDays: 3,
    resourceCount: 4,
    payableOverview: '应付未生成',
  },
}

describe('useCopyFromDepartureSearch', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('ignores an older copy request that resolves after the source changes', async () => {
    const sourceA = deferred<ReturnType<typeof departure>>()
    getDeparture.mockImplementation((id: string) =>
      id === 'A' ? sourceA.promise : Promise.resolve(departure(id)),
    )
    listSegments.mockResolvedValue(segmentResult)
    const setRouteValues = vi.fn()
    const enterInfoStep = vi.fn().mockResolvedValue(undefined)
    const navigate = vi.fn()

    const { rerender } = renderHook(
      ({ copyFrom }) =>
        useCopyFromDepartureSearch({
          copyFrom,
          navigate,
          setRouteValues,
          enterInfoStep,
        }),
      { initialProps: { copyFrom: 'A' } },
    )

    await waitFor(() => expect(getDeparture).toHaveBeenCalledWith('A'))
    rerender({ copyFrom: 'B' })

    await waitFor(() => {
      expect(setRouteValues).toHaveBeenCalledWith(
        expect.objectContaining({ copyFromDepartureId: 'B', sourceDepartureNo: 'NO-B' }),
      )
    })

    await act(async () => {
      sourceA.resolve(departure('A'))
      await sourceA.promise
    })

    expect(setRouteValues).toHaveBeenCalledTimes(1)
    expect(enterInfoStep).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not navigate when an obsolete request fails', async () => {
    const sourceA = deferred<ReturnType<typeof departure>>()
    getDeparture.mockImplementation((id: string) =>
      id === 'A' ? sourceA.promise : Promise.resolve(departure(id)),
    )
    listSegments.mockResolvedValue(segmentResult)
    const navigate = vi.fn()

    const { rerender } = renderHook(
      ({ copyFrom }) =>
        useCopyFromDepartureSearch({
          copyFrom,
          navigate,
          setRouteValues: vi.fn(),
          enterInfoStep: vi.fn(),
        }),
      { initialProps: { copyFrom: 'A' } },
    )

    await waitFor(() => expect(getDeparture).toHaveBeenCalledWith('A'))
    rerender({ copyFrom: 'B' })
    await waitFor(() => expect(getDeparture).toHaveBeenCalledWith('B'))

    await act(async () => {
      sourceA.reject(new Error('旧请求失败'))
      await sourceA.promise.catch(() => undefined)
    })

    expect(navigate).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)(
    'does not produce side effects when an unmounted request later %s',
    async (settlement) => {
      const source = deferred<ReturnType<typeof departure>>()
      getDeparture.mockReturnValue(source.promise)
      listSegments.mockResolvedValue(segmentResult)
      const setRouteValues = vi.fn()
      const enterInfoStep = vi.fn()
      const navigate = vi.fn()
      const onLoadError = vi.fn()
      const errorToast = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)

      const { unmount } = renderHook(() =>
        useCopyFromDepartureSearch({
          copyFrom: 'A',
          navigate,
          setRouteValues,
          enterInfoStep,
          onLoadError,
        }),
      )
      await waitFor(() => expect(getDeparture).toHaveBeenCalledWith('A'))
      unmount()

      await act(async () => {
        if (settlement === 'resolve') {
          source.resolve(departure('A'))
        } else {
          source.reject(new Error('卸载后的失败'))
        }
        await source.promise.catch(() => undefined)
      })

      expect(setRouteValues).not.toHaveBeenCalled()
      expect(enterInfoStep).not.toHaveBeenCalled()
      expect(onLoadError).not.toHaveBeenCalled()
      expect(errorToast).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
    },
  )
})
