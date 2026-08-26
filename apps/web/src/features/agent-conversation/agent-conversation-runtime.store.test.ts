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

  it('dedupes live assistant snapshots by revision and drops them after the persisted message', () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [],
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 2,
      reasoningText: '',
      text: '已',
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 2,
      reasoningText: '',
      text: '已忽略',
    })
    expect(useAgentConversationRuntimeStore.getState().liveAssistant?.text).toBe('已')

    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 3,
      reasoningText: '',
      text: '已整理',
    })
    expect(useAgentConversationRuntimeStore.getState().liveAssistant?.text).toBe('已整理')

    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-2',
          sequence: 2,
          kind: 'agent_message',
          payload: { text: '已整理当前资料。', attemptId: 'attempt-9' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
    })
    expect(useAgentConversationRuntimeStore.getState().liveAssistant).toBeNull()
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
