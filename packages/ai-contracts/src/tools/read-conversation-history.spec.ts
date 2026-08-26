import {
  CONVERSATION_HISTORY_READ_MAX_EVENTS,
  CONVERSATION_HISTORY_READ_PREFACE,
  READ_CONVERSATION_HISTORY_TOOL,
  readConversationHistoryModelInputSchema,
  readConversationHistoryOutputSchema,
} from './read-conversation-history'

describe('readConversationHistory contract v1', () => {
  it('限制单次回读范围，不提供恢复完整会话', () => {
    expect(READ_CONVERSATION_HISTORY_TOOL).toEqual({
      name: 'readConversationHistory',
      version: 1,
    })
    expect(
      readConversationHistoryModelInputSchema.parse({ sequenceStart: 2, sequenceEnd: 4 }),
    ).toEqual({ sequenceStart: 2, sequenceEnd: 4 })
    expect(() =>
      readConversationHistoryModelInputSchema.parse({ sequenceStart: 1, sequenceEnd: 1 + CONVERSATION_HISTORY_READ_MAX_EVENTS }),
    ).toThrow()
    expect(() =>
      readConversationHistoryModelInputSchema.parse({ sequenceStart: 5, sequenceEnd: 4 }),
    ).toThrow()
  })

  it('回读结果携带 locator 与不可信原文前言', () => {
    const parsed = readConversationHistoryOutputSchema.parse({
      conversationId: 'conv-1',
      conversationVersion: 9,
      truncated: false,
      preface: CONVERSATION_HISTORY_READ_PREFACE,
      events: [
        {
          sequence: 2,
          kind: 'user_message',
          text: '出团日期还没定',
          locator: {
            kind: 'conversation_event',
            conversationId: 'conv-1',
            sequence: 2,
            eventKind: 'user_message',
            contentDigest: 'a'.repeat(64),
            charRange: { start: 0, end: 7 },
          },
        },
      ],
    })
    expect(parsed.preface).toBe(CONVERSATION_HISTORY_READ_PREFACE)
    expect(parsed.events[0]?.locator.kind).toBe('conversation_event')
  })
})
