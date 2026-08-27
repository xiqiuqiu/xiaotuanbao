import { describe, expect, it } from 'vitest'
import {
  batchStatusLabel,
  isCopilotChatRunning,
  projectConversationFrame,
  toCopilotChatMessages,
} from './ai-create-copilot-messages'

describe('AI create chat status projection', () => {
  it('still shows AI 处理中 when agent_running carries Attempt and generation', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'user_message',
          payload: { text: '帮我查一下账款' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
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
      null,
      null,
    )

    const labels = messages
      .filter((message) => message.activityType === 'ai-create-batch-status')
      .map((message) => (message.content as { label?: string }).label)
    expect(labels).toEqual(['AI 处理中'])
    expect(messages.some((message) => message.role === 'assistant')).toBe(false)
  })

  it('labels running, queued and waiting-for-answer from server status', () => {
    expect(batchStatusLabel('agent_running')).toBe('AI 处理中')
    expect(batchStatusLabel('preparing_context')).toBe('正在整理会话上下文')
    expect(batchStatusLabel('ready_for_agent', null, { queued: true })).toBe('已排队')
    expect(batchStatusLabel('awaiting_user_input')).toBe('等待回答')
    expect(batchStatusLabel('awaiting_review')).toBe('等待表单审核')
    expect(batchStatusLabel('completed', null, { disposition: 'rejected' })).toBe(
      '已拒绝本次建议',
    )
    expect(batchStatusLabel('completed', null, { disposition: 'confirmed' })).toBe('已完成')
    expect(batchStatusLabel('cancelled', null, { reason: 'user_stop' })).toBe('已停止当前处理')
    expect(batchStatusLabel('cancelled', null, { reason: 'interaction_cancelled' })).toBe(
      '已取消等待',
    )
  })

  it('offers 重试 on a failed Agent batch without 修改后重试 copy', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'user_message',
          payload: { text: '这次会失败' },
          createdAt: '2026-08-20T00:00:00.000Z',
        },
        {
          sequence: 2,
          kind: 'error',
          payload: { batchId: 'batch-fail', errorCode: 'PERMISSION_DENIED' },
          createdAt: '2026-08-20T00:00:01.000Z',
        },
        {
          sequence: 3,
          kind: 'batch_status',
          payload: { status: 'failed', batchId: 'batch-fail', errorCode: 'PERMISSION_DENIED' },
          createdAt: '2026-08-20T00:00:01.000Z',
        },
      ],
      null,
      null,
    )

    const statuses = messages
      .filter((message) => message.activityType === 'ai-create-batch-status')
      .map((message) => message.content as { label?: string; showBatchRetryAction?: boolean })
    expect(statuses.map((item) => item.label)).toEqual(['处理失败'])
    expect(statuses.some((item) => item.showBatchRetryAction)).toBe(true)
    expect(JSON.stringify(messages)).not.toContain('修改后重试')
  })

  it('distinguishes context capacity and missing profile failures from agent outages', () => {
    expect(batchStatusLabel('failed', null, { errorCode: 'AGENT_UNAVAILABLE' })).toBe('处理失败')
    expect(batchStatusLabel('failed', null, { errorCode: 'CONTEXT_CAPACITY_EXCEEDED' })).toBe(
      '上下文超出容量上限，请拆分或精简后再试',
    )
    expect(batchStatusLabel('failed', null, { errorCode: 'CONTEXT_PROFILE_MISSING' })).toBe(
      '当前模型未配置上下文容量',
    )

    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'user_message',
          payload: { text: '超长资料' },
          createdAt: '2026-08-20T00:00:00.000Z',
        },
        {
          sequence: 2,
          kind: 'error',
          payload: { batchId: 'batch-cap', errorCode: 'CONTEXT_CAPACITY_EXCEEDED' },
          createdAt: '2026-08-20T00:00:01.000Z',
        },
        {
          sequence: 3,
          kind: 'batch_status',
          payload: {
            status: 'failed',
            batchId: 'batch-cap',
            errorCode: 'CONTEXT_CAPACITY_EXCEEDED',
          },
          createdAt: '2026-08-20T00:00:01.000Z',
        },
      ],
      null,
      null,
    )

    const statuses = messages
      .filter((message) => message.activityType === 'ai-create-batch-status')
      .map((message) => message.content as { label?: string })
    expect(statuses.map((item) => item.label)).toEqual(['上下文超出容量上限，请拆分或精简后再试'])
  })

  it('keeps queued visible when the running batch starts waiting for an answer', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'user_message',
          payload: { text: '第一批' },
          createdAt: '2026-08-15T00:00:00.000Z',
        },
        {
          sequence: 2,
          kind: 'batch_status',
          payload: { status: 'agent_running', batchId: 'batch-1' },
          createdAt: '2026-08-15T00:00:00.000Z',
        },
        {
          sequence: 3,
          kind: 'user_message',
          payload: { text: '第二批排队' },
          createdAt: '2026-08-15T00:00:01.000Z',
        },
        {
          sequence: 4,
          kind: 'batch_status',
          payload: { status: 'ready_for_agent', batchId: 'batch-2', queued: true },
          createdAt: '2026-08-15T00:00:01.000Z',
        },
        {
          id: 'event-q',
          sequence: 5,
          kind: 'agent_message',
          payload: {
            text: '出团日期是哪一天？',
            interaction: {
              interactionId: 'int-1',
              type: 'free_text',
              prompt: '出团日期是哪一天？',
              status: 'pending',
              version: 1,
            },
          },
          createdAt: '2026-08-15T00:00:02.000Z',
        },
        {
          sequence: 6,
          kind: 'batch_status',
          payload: { status: 'awaiting_user_input', batchId: 'batch-1' },
          createdAt: '2026-08-15T00:00:02.000Z',
        },
      ],
      null,
      null,
    )

    const labels = messages
      .filter((message) => message.activityType === 'ai-create-batch-status')
      .map((message) => (message.content as { label?: string }).label)
    expect(labels).toContain('已排队')
    expect(labels).toContain('等待回答')
    expect(labels).not.toContain('AI 处理中')
  })

  it('does not keep 处理中 or 停止 after the same batch enters awaiting_review', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 2,
          kind: 'batch_status',
          payload: { status: 'agent_running', batchId: 'batch-review' },
          createdAt: '2026-08-15T14:36:11.000Z',
        },
        {
          sequence: 4,
          kind: 'batch_status',
          payload: { status: 'awaiting_review', batchId: 'batch-review' },
          createdAt: '2026-08-15T14:36:29.000Z',
        },
      ],
      null,
      null,
    )

    const statuses = messages
      .filter((message) => message.activityType === 'ai-create-batch-status')
      .map((message) => message.content as { label?: string; showStopAction?: boolean })
    expect(statuses.map((item) => item.label)).toEqual(['等待表单审核'])
    expect(statuses.some((item) => item.showStopAction)).toBe(false)
  })

  it('labels a rejected review batch as 已拒绝本次建议', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'batch_status',
          payload: { status: 'completed', batchId: 'batch-1', disposition: 'confirmed' },
          createdAt: '2026-08-15T14:36:11.000Z',
        },
        {
          sequence: 2,
          kind: 'batch_status',
          payload: { status: 'completed', batchId: 'batch-2', disposition: 'rejected' },
          createdAt: '2026-08-15T14:36:29.000Z',
        },
      ],
      null,
      null,
    )
    const labels = messages
      .filter((message) => message.activityType === 'ai-create-batch-status')
      .map((message) => (message.content as { label?: string }).label)
    expect(labels).toEqual(['已完成', '已拒绝本次建议'])
  })

  it('projects a persisted question as an interaction card, not only assistant text', () => {
    const messages = toCopilotChatMessages(
      [
        {
          id: 'event-q',
          sequence: 1,
          kind: 'agent_message',
          payload: {
            text: '出团日期是哪一天？',
            interaction: {
              interactionId: 'int-1',
              type: 'free_text',
              prompt: '出团日期是哪一天？',
              status: 'pending',
              version: 1,
            },
          },
          createdAt: '2026-08-15T00:00:00.000Z',
        },
      ],
      null,
      null,
    )

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'assistant', content: '出团日期是哪一天？' }),
        expect.objectContaining({
          role: 'activity',
          activityType: 'ai-create-interaction',
          content: expect.objectContaining({
            interactionId: 'int-1',
            eventId: 'event-q',
            status: 'pending',
          }),
        }),
      ]),
    )
  })

  it('projects review and search tool notices from persisted agent events', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'agent_message',
          payload: {
            text: '组织内有这些常用路线。',
            searchRouteTemplates: {
              items: [
                {
                  id: 'tpl-1',
                  name: '川西稻城线',
                  defaultDayCount: 8,
                  usageCount: 4,
                  matchReasons: [{ code: 'name_contains_token', token: '川西' }],
                },
              ],
            },
          },
          createdAt: '2026-08-20T00:00:00.000Z',
        },
        {
          sequence: 2,
          kind: 'agent_message',
          payload: {
            text: '已提交待审核建议，请在中间表单确认。',
            reviewPackageId: 'pkg-1',
            fieldKeys: ['name', 'routeName'],
          },
          createdAt: '2026-08-20T00:00:01.000Z',
        },
      ],
      null,
      null,
    )

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityType: 'ai-create-search-route-templates',
          content: expect.objectContaining({
            items: [expect.objectContaining({ name: '川西稻城线' })],
          }),
        }),
        expect.objectContaining({
          activityType: 'ai-create-review-package',
          content: { reviewPackageId: 'pkg-1', fieldKeys: ['name', 'routeName'] },
        }),
      ]),
    )
  })
})

describe('projectConversationFrame live assistant #415', () => {
  const runningEvents = [
    {
      sequence: 1,
      kind: 'user_message' as const,
      payload: { text: '帮我查一下账款' },
      createdAt: '2026-08-26T00:00:00.000Z',
    },
    {
      sequence: 2,
      kind: 'batch_status' as const,
      payload: {
        status: 'agent_running',
        batchId: 'batch-1',
        attemptId: 'attempt-9',
        generation: 3,
      },
      createdAt: '2026-08-26T00:00:01.000Z',
    },
  ]

  it('keeps batch_status and does not invent a blank assistant before public tokens', () => {
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: null,
    })
    expect(messages.some((message) => message.role === 'assistant')).toBe(false)
    expect(
      messages.some(
        (message) =>
          message.activityType === 'ai-create-batch-status' &&
          (message.content as { label?: string }).label === 'AI 处理中',
      ),
    ).toBe(true)
  })

  it('grows one in-progress assistant and replaces it with the persisted agent_message', () => {
    const live = {
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 2,
      reasoningText: '',
      text: '已整理当前资料。',
    }
    const growing = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: live,
    })
    expect(growing.filter((message) => message.role === 'assistant')).toEqual([
      {
        id: 'live-assistant-attempt-9',
        role: 'assistant',
        content: '已整理当前资料。',
      },
    ])

    const replaced = projectConversationFrame({
      events: [
        ...runningEvents,
        {
          sequence: 3,
          kind: 'agent_message',
          payload: {
            text: '已整理当前资料。可继续问。',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
          },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
      ],
      pendingText: null,
      liveAssistant: live,
    })
    expect(replaced.filter((message) => message.role === 'assistant')).toEqual([
      expect.objectContaining({
        id: 'event-3',
        role: 'assistant',
        content: '已整理当前资料。可继续问。',
      }),
    ])
  })

  it('ignores an older generation snapshot after a newer Attempt is running', () => {
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-old',
        batchId: 'batch-1',
        generation: 2,
        revision: 8,
        reasoningText: '',
        text: '上一代残留',
      },
    })
    expect(messages.some((message) => message.content === '上一代残留')).toBe(false)
  })
})

describe('projectConversationFrame live reasoning #416', () => {
  const runningEvents = [
    {
      sequence: 1,
      kind: 'user_message' as const,
      payload: { text: '帮我查一下账款' },
      createdAt: '2026-08-26T00:00:00.000Z',
    },
    {
      sequence: 2,
      kind: 'batch_status' as const,
      payload: {
        status: 'agent_running',
        batchId: 'batch-1',
        attemptId: 'attempt-9',
        generation: 3,
      },
      createdAt: '2026-08-26T00:00:01.000Z',
    },
  ]

  it('shows collapsible 思考过程 after the first reasoning token before any public reply', () => {
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        revision: 1,
        reasoningText: '先核对出团日期',
        text: '',
      },
    })
    expect(messages.filter((message) => message.role === 'assistant')).toEqual([])
    expect(
      messages.filter((message) => message.activityType === 'ai-agent-reasoning'),
    ).toEqual([
      {
        id: 'live-reasoning-attempt-9',
        role: 'activity',
        activityType: 'ai-agent-reasoning',
        content: { reasoningText: '先核对出团日期' },
      },
    ])
  })

  it('keeps 思考过程 beside the growing reply and overwrites the previous step', () => {
    const firstStep = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        revision: 2,
        reasoningText: '先核对出团日期',
        text: '已记下路线。',
      },
    })
    expect(firstStep.filter((message) => message.role === 'assistant')).toEqual([
      {
        id: 'live-assistant-attempt-9',
        role: 'assistant',
        content: '已记下路线。',
      },
    ])
    expect(
      (firstStep.find((message) => message.activityType === 'ai-agent-reasoning')?.content as {
        reasoningText?: string
      }).reasoningText,
    ).toBe('先核对出团日期')

    const nextStep = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        revision: 3,
        reasoningText: '再核人数',
        text: '已记下路线。日期待核对。',
      },
    })
    expect(
      nextStep
        .filter((message) => message.activityType === 'ai-agent-reasoning')
        .map((message) => (message.content as { reasoningText?: string }).reasoningText),
    ).toEqual(['再核人数'])
    expect(nextStep.filter((message) => message.role === 'assistant')).toEqual([
      {
        id: 'live-assistant-attempt-9',
        role: 'assistant',
        content: '已记下路线。日期待核对。',
      },
    ])
  })

  it('drops 思考过程 when the persisted agent_message replaces the live reply', () => {
    const messages = projectConversationFrame({
      events: [
        ...runningEvents,
        {
          sequence: 3,
          kind: 'agent_message',
          payload: {
            text: '已记下路线。日期待核对。',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
          },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
      ],
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        revision: 4,
        reasoningText: '再核人数',
        text: '已记下路线。日期待核对。',
      },
    })
    expect(messages.some((message) => message.activityType === 'ai-agent-reasoning')).toBe(false)
    expect(messages.filter((message) => message.role === 'assistant')).toEqual([
      expect.objectContaining({
        id: 'event-3',
        role: 'assistant',
        content: '已记下路线。日期待核对。',
      }),
    ])
  })

  it('does not promote tool names mentioned in 思考过程 into a structured tool frame', () => {
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        revision: 1,
        reasoningText: '可以调用 proposeReviewPackage 再核对',
        text: '',
      },
    })
    expect(messages.some((message) => message.activityType === 'ai-create-review-package')).toBe(
      false,
    )
    expect(JSON.stringify(messages)).not.toContain('tool.call')
    expect(
      (messages.find((message) => message.activityType === 'ai-agent-reasoning')?.content as {
        reasoningText?: string
      }).reasoningText,
    ).toBe('可以调用 proposeReviewPackage 再核对')
  })

  it('drops 思考过程 after a failed batch_status so it is not treated as a finished answer', () => {
    const messages = projectConversationFrame({
      events: [
        ...runningEvents,
        {
          sequence: 3,
          kind: 'batch_status',
          payload: {
            status: 'failed',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
            errorCode: 'MODEL_TIMEOUT',
          },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
      ],
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        revision: 2,
        reasoningText: '先核对出团日期',
        text: '半段回复',
      },
    })
    expect(messages.some((message) => message.activityType === 'ai-agent-reasoning')).toBe(false)
    expect(messages.some((message) => message.content === '半段回复')).toBe(false)
  })
})

describe('isCopilotChatRunning in-flight statuses #415', () => {
  it('treats ready_for_agent, preparing_context and agent_running as running', () => {
    expect(
      isCopilotChatRunning(
        [{ sequence: 1, kind: 'batch_status', payload: { status: 'ready_for_agent' }, createdAt: '2026-08-26T00:00:00.000Z' }],
        null,
        null,
      ),
    ).toBe(true)
    expect(
      isCopilotChatRunning(
        [{ sequence: 1, kind: 'batch_status', payload: { status: 'preparing_context' }, createdAt: '2026-08-26T00:00:00.000Z' }],
        null,
        null,
      ),
    ).toBe(true)
    expect(
      isCopilotChatRunning(
        [{ sequence: 1, kind: 'batch_status', payload: { status: 'agent_running' }, createdAt: '2026-08-26T00:00:00.000Z' }],
        null,
        null,
      ),
    ).toBe(true)
    expect(
      isCopilotChatRunning(
        [{ sequence: 1, kind: 'batch_status', payload: { status: 'completed' }, createdAt: '2026-08-26T00:00:00.000Z' }],
        null,
        null,
      ),
    ).toBe(false)
  })
})

