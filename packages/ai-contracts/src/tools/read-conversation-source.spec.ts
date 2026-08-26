import {
  CONVERSATION_SOURCE_READ_PREFACE,
  READ_CONVERSATION_SOURCE_TOOL,
  readConversationSourceModelInputSchema,
  readConversationSourceOutputSchema,
} from './read-conversation-source'

describe('readConversationSource contract v1', () => {
  it('要求当前会话来源的固定解析版本', () => {
    expect(READ_CONVERSATION_SOURCE_TOOL).toEqual({
      name: 'readConversationSource',
      version: 1,
    })
    expect(
      readConversationSourceModelInputSchema.parse({
        sourceId: 'src-1',
        parseVersion: 2,
        pageNumber: 1,
      }),
    ).toEqual({ sourceId: 'src-1', parseVersion: 2, pageNumber: 1 })
  })

  it('回读结果保留来源 locator 与非权威前言', () => {
    const parsed = readConversationSourceOutputSchema.parse({
      conversationId: 'conv-1',
      sourceId: 'src-1',
      parseVersion: 2,
      pageCount: 1,
      truncated: false,
      preface: CONVERSATION_SOURCE_READ_PREFACE,
      locator: {
        kind: 'conversation_source',
        conversationId: 'conv-1',
        sourceId: 'src-1',
        parseVersion: 2,
        pageNumber: 1,
        contentDigest: 'b'.repeat(64),
      },
      text: '喀纳斯三日行程',
    })
    expect(parsed.preface).toBe(CONVERSATION_SOURCE_READ_PREFACE)
    expect(parsed.locator.kind).toBe('conversation_source')
  })
})
