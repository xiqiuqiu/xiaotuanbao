import {
  SSE_CATCH_UP_IDLE_POLL_MS,
  SSE_CATCH_UP_POLL_MS,
  nextSseCatchUpDelay,
} from './ai-conversation.constants'

describe('nextSseCatchUpDelay', () => {
  it('uses the fast interval only after the catch-up actually found events', () => {
    expect(nextSseCatchUpDelay(true)).toBe(SSE_CATCH_UP_POLL_MS)
    expect(nextSseCatchUpDelay(false)).toBe(SSE_CATCH_UP_IDLE_POLL_MS)
    expect(SSE_CATCH_UP_IDLE_POLL_MS).toBeGreaterThan(SSE_CATCH_UP_POLL_MS)
  })
})
