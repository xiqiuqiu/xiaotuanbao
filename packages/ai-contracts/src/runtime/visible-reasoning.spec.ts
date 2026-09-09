import { CONVERSATION_GENERAL_INSTRUCTIONS } from './conversation-general-definitions'
import { sanitizeVisibleReasoning, stripEnglishChainOfThought } from './visible-reasoning'

describe('sanitizeVisibleReasoning', () => {
  it('keeps a Chinese business sketch', () => {
    expect(sanitizeVisibleReasoning('先核对该发团的团名和状态')).toBe('先核对该发团的团名和状态')
  })

  it('strips English chain-of-thought while keeping the Chinese business reply', () => {
    const englishSoliloquy =
      "I'll check the current task context first, then help add a vehicle departure resource."
    expect(
      stripEnglishChainOfThought(`${englishSoliloquy}\n已提交待审核建议，请在右侧审核确认。`),
    ).toBe('已提交待审核建议，请在右侧审核确认。')
  })

  it('still strips English chain-of-thought on the reasoning channel', () => {
    const englishSoliloquy =
      "I'll check the current task context first, then help add a vehicle departure resource."
    expect(sanitizeVisibleReasoning(englishSoliloquy)).toBe('')
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
