import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'

describe('agent conversation runtime store #370', () => {
  beforeEach(() => {
    useAgentConversationRuntimeStore.getState().clear()
  })

  it('keeps events, draft and pending text when the same Conversation remounts', () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      draft: '未发送的说明',
      pendingText: '流式中的提问',
      events: [
        {
          id: 'e-1',
          sequence: 1,
          kind: 'user_message',
          payload: { text: '你好' },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
      draftEpoch: 0,
      revision: 2,
      sending: true,
      sendIdempotencyKey: 'idem-1',
    })
    useAgentConversationRuntimeStore.getState().resetIfConversationChanged('c-1')

    expect(useAgentConversationRuntimeStore.getState()).toMatchObject({
      conversationId: 'c-1',
      draft: '未发送的说明',
      pendingText: '流式中的提问',
      revision: 2,
      sending: true,
      sendIdempotencyKey: 'idem-1',
    })
    expect(useAgentConversationRuntimeStore.getState().events).toHaveLength(1)
  })

  it('clears runtime only when switching to a different Conversation', () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      draft: '旧草稿',
    })
    useAgentConversationRuntimeStore.getState().resetIfConversationChanged('c-2')
    expect(useAgentConversationRuntimeStore.getState()).toMatchObject({
      conversationId: 'c-2',
      draft: '',
      events: [],
      pendingText: null,
      sending: false,
      sendIdempotencyKey: null,
    })
  })
})
