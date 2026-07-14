import { describe, expect, it } from 'vitest'
import {
  OPERATIONAL_QUERY_STALE_TIME_MS,
  OPERATIONAL_REFETCH_INTERVAL_MS,
  operationalQueryOptions,
  shouldShowManualRefreshPrompt,
} from './stale-data-prompt'

describe('operationalQueryOptions', () => {
  it('prefers auto refresh: focus + quiet poll, with a longer fresh window than the poll', () => {
    // Frequency budget agreed for operational lists/details (independent literals).
    expect(OPERATIONAL_QUERY_STALE_TIME_MS).toBe(30_000)
    expect(OPERATIONAL_REFETCH_INTERVAL_MS).toBe(90_000)

    const options = operationalQueryOptions()
    expect(options.staleTime).toBe(30_000)
    expect(options.refetchOnWindowFocus).toBe(true)
    expect(options.refetchInterval).toBe(90_000)
    expect(options.refetchIntervalInBackground).toBe(false)
    expect(options.refetchInterval).toBeGreaterThan(options.staleTime)
  })
})

describe('shouldShowManualRefreshPrompt', () => {
  const base = {
    isFetching: false,
    isError: false,
    hasData: true,
  }

  it('stays hidden while auto refresh is healthy', () => {
    expect(shouldShowManualRefreshPrompt(base)).toBe(false)
  })

  it('stays hidden while an auto refresh is in flight', () => {
    expect(
      shouldShowManualRefreshPrompt({
        ...base,
        isFetching: true,
        isError: true,
      }),
    ).toBe(false)
  })

  it('stays hidden when there is nothing on screen to keep', () => {
    expect(
      shouldShowManualRefreshPrompt({
        ...base,
        hasData: false,
        isError: true,
      }),
    ).toBe(false)
  })

  it('shows only after automatic refresh failed and last good data is still shown', () => {
    expect(
      shouldShowManualRefreshPrompt({
        ...base,
        isError: true,
      }),
    ).toBe(true)
  })
})
