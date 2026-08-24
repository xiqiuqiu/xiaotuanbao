import {
  SSE_CATCH_UP_IDLE_POLL_MS,
  SSE_CATCH_UP_POLL_MS,
  isImmediateWorkflowFailure,
  nextSseCatchUpDelay,
} from './ai-conversation.constants'

describe('nextSseCatchUpDelay', () => {
  it('uses the fast interval only after the catch-up actually found events', () => {
    expect(nextSseCatchUpDelay(true)).toBe(SSE_CATCH_UP_POLL_MS)
    expect(nextSseCatchUpDelay(false)).toBe(SSE_CATCH_UP_IDLE_POLL_MS)
    expect(SSE_CATCH_UP_IDLE_POLL_MS).toBeGreaterThan(SSE_CATCH_UP_POLL_MS)
  })
})

describe('isImmediateWorkflowFailure', () => {
  it('fails closed on context capacity and missing profile instead of retrying as an agent outage', () => {
    expect(isImmediateWorkflowFailure('CONTEXT_CAPACITY_EXCEEDED')).toBe(true)
    expect(isImmediateWorkflowFailure('CONTEXT_PROFILE_MISSING')).toBe(true)
    expect(isImmediateWorkflowFailure('AGENT_UNAVAILABLE')).toBe(false)
  })
})
