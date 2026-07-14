import { describe, expect, it } from 'vitest'
import {
  resolveListTableLoading,
  shouldKeepPreviousListData,
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
