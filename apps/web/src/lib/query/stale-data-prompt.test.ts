import { describe, expect, it } from 'vitest'
import {
  STALE_DATA_PROMPT_AFTER_MS,
  shouldShowStaleDataPrompt,
} from './stale-data-prompt'

describe('shouldShowStaleDataPrompt', () => {
  const base = {
    now: 100_000,
    dataUpdatedAt: 100_000,
    isFetching: false,
    isError: false,
    hasData: true,
  }

  it('hides when there is no data yet', () => {
    expect(shouldShowStaleDataPrompt({ ...base, hasData: false })).toBe(false)
  })

  it('hides while a refresh is already in flight', () => {
    expect(
      shouldShowStaleDataPrompt({
        ...base,
        dataUpdatedAt: 0,
        isFetching: true,
      }),
    ).toBe(false)
  })

  it('shows when a refresh failed but prior data is still on screen', () => {
    expect(
      shouldShowStaleDataPrompt({
        ...base,
        isError: true,
        dataUpdatedAt: 99_000,
      }),
    ).toBe(true)
  })

  it('hides while data is fresher than the prompt threshold', () => {
    expect(
      shouldShowStaleDataPrompt({
        ...base,
        dataUpdatedAt: base.now - (STALE_DATA_PROMPT_AFTER_MS - 1),
      }),
    ).toBe(false)
  })

  it('shows after the user has been looking at the same snapshot long enough', () => {
    expect(
      shouldShowStaleDataPrompt({
        ...base,
        dataUpdatedAt: base.now - STALE_DATA_PROMPT_AFTER_MS,
      }),
    ).toBe(true)
  })
})
