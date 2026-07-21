import { act, renderHook } from '@testing-library/react'
import { keepPreviousData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  resolveListTableLoading,
  shouldKeepPreviousListData,
  useListPlaceholderData,
} from './list-query-ux'

describe('shouldKeepPreviousListData', () => {
  it('clears rows on the first filter key (no prior cohort)', () => {
    expect(shouldKeepPreviousListData(undefined, 'status=open')).toBe(false)
  })

  it('keeps rows when only pagination changed (same filter key)', () => {
    expect(shouldKeepPreviousListData('status=open', 'status=open')).toBe(true)
  })

  it('clears rows when filters change', () => {
    expect(shouldKeepPreviousListData('status=open', 'status=closed')).toBe(false)
  })
})

describe('useListPlaceholderData', () => {
  it('clears placeholder when filter changes before new data settles', () => {
    const { result, rerender } = renderHook(
      ({ filterKey }) => useListPlaceholderData(filterKey),
      { initialProps: { filterKey: 'status=open' } },
    )

    expect(result.current.placeholderData).toBeUndefined()

    act(() => {
      result.current.commitListFilterKey(true, false)
    })

    rerender({ filterKey: 'status=open' })
    expect(result.current.placeholderData).toBe(keepPreviousData)

    rerender({ filterKey: 'status=closed' })
    expect(result.current.placeholderData).toBeUndefined()

    act(() => {
      result.current.commitListFilterKey(false, false)
    })
    rerender({ filterKey: 'status=closed' })
    expect(result.current.placeholderData).toBeUndefined()

    act(() => {
      result.current.commitListFilterKey(true, false)
    })
    rerender({ filterKey: 'status=closed' })
    expect(result.current.placeholderData).toBe(keepPreviousData)
  })

  it('keeps placeholder for pagination after filter data has settled', () => {
    const { result, rerender } = renderHook(
      ({ filterKey }) => useListPlaceholderData(filterKey),
      { initialProps: { filterKey: 'keyword=foo' } },
    )

    act(() => {
      result.current.commitListFilterKey(true, false)
    })

    rerender({ filterKey: 'keyword=foo' })
    expect(result.current.placeholderData).toBe(keepPreviousData)

    act(() => {
      result.current.commitListFilterKey(true, true)
    })
    rerender({ filterKey: 'keyword=foo' })
    expect(result.current.placeholderData).toBe(keepPreviousData)
  })

  it('does not commit settled filter key while data is still placeholder', () => {
    const { result, rerender } = renderHook(
      ({ filterKey }) => useListPlaceholderData(filterKey),
      { initialProps: { filterKey: 'status=open' } },
    )

    act(() => {
      result.current.commitListFilterKey(true, true)
    })

    rerender({ filterKey: 'status=closed' })
    expect(result.current.placeholderData).toBeUndefined()
  })
})

describe('resolveListTableLoading', () => {
  it('uses hard loading for a cold fetch without placeholder rows', () => {
    expect(
      resolveListTableLoading({
        isLoading: true,
        isFetching: true,
        isPlaceholderData: false,
      }),
    ).toEqual({ hardLoading: true, softFetching: false })
  })

  it('uses soft fetching while paginating with placeholder rows', () => {
    expect(
      resolveListTableLoading({
        isLoading: false,
        isFetching: true,
        isPlaceholderData: true,
      }),
    ).toEqual({ hardLoading: false, softFetching: true })
  })

  it('stays visually idle during silent or focus refetch without placeholder rows', () => {
    expect(
      resolveListTableLoading({
        isLoading: false,
        isFetching: true,
        isPlaceholderData: false,
      }),
    ).toEqual({ hardLoading: false, softFetching: false })
  })

  it('is idle when data is settled', () => {
    expect(
      resolveListTableLoading({
        isLoading: false,
        isFetching: false,
        isPlaceholderData: false,
      }),
    ).toEqual({ hardLoading: false, softFetching: false })
  })
})
