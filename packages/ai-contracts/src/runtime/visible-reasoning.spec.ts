import { CONVERSATION_GENERAL_INSTRUCTIONS } from './conversation-general-definitions'
import { sanitizeVisibleReasoning } from './visible-reasoning'

describe('sanitizeVisibleReasoning', () => {
  it('keeps a Chinese business sketch', () => {
    expect(sanitizeVisibleReasoning('先核对该发团的团名和状态')).toBe('先核对该发团的团名和状态')
  })

  it('strips system prompt fragments, internal tool names and English chain-of-thought', () => {
    const leaked = [
      'Let me reconsider: the conversation context is about 小团宝工作台 and I should follow the rules.',
      CONVERSATION_GENERAL_INSTRUCTIONS.slice(12, 80),
      'User 明确要求创建发团时，调用 routeConversation 登记建团目标，也可以 readConversationSource。',
    ].join('\n')

    const sanitized = sanitizeVisibleReasoning(leaked)
    expect(sanitized).not.toContain('Let me reconsider')
    expect(sanitized).not.toContain('routeConversation')
    expect(sanitized).not.toContain('readConversationSource')
    expect(sanitized).not.toContain('根据当前 User 输入')
  })
})
