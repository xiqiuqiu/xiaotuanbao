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

  it('keeps session 思考过程 after agent_message and drops it after failure', () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [],
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 1,
      reasoningText: '先核对出团日期',
      text: '',
    })
    expect(useAgentConversationRuntimeStore.getState().sessionReasoning).toEqual({
      'attempt-9': '先核对出团日期',
    })

    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-2',
          sequence: 2,
          kind: 'agent_message',
          payload: { text: '已记下路线。', attemptId: 'attempt-9' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ],
    })
    expect(useAgentConversationRuntimeStore.getState().liveAssistant).toBeNull()
    expect(useAgentConversationRuntimeStore.getState().sessionReasoning).toEqual({
      'attempt-9': '先核对出团日期',
    })

    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-3',
          sequence: 3,
          kind: 'batch_status',
          payload: { status: 'failed', attemptId: 'attempt-10' },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
      ],
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-10',
      batchId: 'batch-2',
      generation: 4,
      revision: 1,
      reasoningText: '失败前的思考',
      text: '半段',
    })
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-3',
          sequence: 3,
          kind: 'batch_status',
          payload: { status: 'failed', attemptId: 'attempt-10' },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
      ],
    })
    expect(useAgentConversationRuntimeStore.getState().sessionReasoning).toEqual({
      'attempt-9': '先核对出团日期',
    })
  })

  it('drops a late snapshot after user_stop so it cannot rewrite the current projection', () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-2',
          sequence: 2,
          kind: 'batch_status',
          payload: {
            status: 'agent_running',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            generation: 3,
          },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
      ],
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 2,
      reasoningText: '先核对出团日期',
      text: '已记下半段',
    })
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-2',
          sequence: 2,
          kind: 'batch_status',
          payload: {
            status: 'agent_running',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            generation: 3,
          },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
        {
          id: 'e-3',
          sequence: 3,
          kind: 'batch_status',
          payload: {
            status: 'cancelled',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            reason: 'user_stop',
          },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
      ],
    })
    expect(useAgentConversationRuntimeStore.getState().liveAssistant).toBeNull()
    expect(useAgentConversationRuntimeStore.getState().sessionReasoning).toEqual({})

    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 99,
      reasoningText: '迟到思考',
      text: '停止后才赶到的半段',
    })
    expect(useAgentConversationRuntimeStore.getState().liveAssistant).toBeNull()
    expect(useAgentConversationRuntimeStore.getState().sessionReasoning).toEqual({})
  })

  it('keeps the current live assistant when a stale generation arrives with a larger revision', () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-2',
          sequence: 2,
          kind: 'batch_status',
          payload: {
            status: 'agent_running',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            generation: 3,
          },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
      ],
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 2,
      reasoningText: '',
      text: '当前尝试',
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-old',
      batchId: 'batch-1',
      generation: 2,
      revision: 99,
      reasoningText: '',
      text: '上一代迟到',
    })
    expect(useAgentConversationRuntimeStore.getState().liveAssistant).toMatchObject({
      attemptId: 'attempt-9',
      text: '当前尝试',
    })
  })

  it('replaces live text when a newer generation first frame arrives', () => {
    useAgentConversationRuntimeStore.getState().hydrate({
      conversationId: 'c-1',
      events: [
        {
          id: 'e-2',
          sequence: 2,
          kind: 'batch_status',
          payload: {
            status: 'agent_running',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            generation: 3,
          },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
      ],
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 2,
      reasoningText: '',
      text: '上一代半段',
    })
    useAgentConversationRuntimeStore.getState().acceptLiveAssistant({
      attemptId: 'attempt-10',
      batchId: 'batch-1',
      generation: 4,
      revision: 1,
      reasoningText: '',
      text: '重试后的第一句',
    })
    expect(useAgentConversationRuntimeStore.getState().liveAssistant).toMatchObject({
      attemptId: 'attempt-10',
      text: '重试后的第一句',
    })
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
