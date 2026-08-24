import {
  CONVERSATION_TITLE_MAX_CHARS,
  SSE_CATCH_UP_IDLE_POLL_MS,
  SSE_CATCH_UP_POLL_MS,
  isImmediateWorkflowFailure,
  nextSseCatchUpDelay,
  titleFromFirstUserMessage,
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

describe('titleFromFirstUserMessage', () => {
  it('从首条 User 消息确定性截出临时标题', () => {
    expect(titleFromFirstUserMessage('  今天合作伙伴账款怎么查？  ')).toBe('今天合作伙伴账款怎么查？')
    expect(titleFromFirstUserMessage('a'.repeat(CONVERSATION_TITLE_MAX_CHARS + 5))).toHaveLength(
      CONVERSATION_TITLE_MAX_CHARS,
    )
  })
})

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
