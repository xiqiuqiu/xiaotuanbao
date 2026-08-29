import { describe, expect, it } from 'vitest'
import {
  batchStatusLabel,
  currentStoppableBatchId,
  isCopilotChatRunning,
  projectConversationFrame,
  projectQueuedConversationMessages,
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
    expect(statuses.map((item) => item.label)).toEqual(['当前权限不足，无法完成这次处理'])
    expect(statuses.some((item) => item.showBatchRetryAction)).toBe(true)
    expect(JSON.stringify(messages)).not.toContain('修改后重试')
  })

  it('distinguishes context capacity and missing profile failures from agent outages', () => {
    expect(batchStatusLabel('failed', null, { errorCode: 'AGENT_UNAVAILABLE' })).toBe(
      'AI 辅助暂时不可用，请稍后重试',
    )
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

  it('keeps queued input above the composer until that batch starts', () => {
    const events = [
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
    ]
    const queued = projectQueuedConversationMessages(events)
    const messages = toCopilotChatMessages(queued.visibleEvents, null, null)

    const labels = messages
      .filter((message) => message.activityType === 'ai-create-batch-status')
      .map((message) => (message.content as { label?: string }).label)
    expect(queued.messages).toEqual([
      { batchId: 'batch-2', text: '第二批排队', userEventSequence: 3 },
    ])
    expect(messages.some((message) => message.content === '第二批排队')).toBe(false)
    expect(labels).not.toContain('已排队')
    expect(labels).toContain('等待回答')
    expect(labels).not.toContain('AI 处理中')

    const started = projectQueuedConversationMessages([
      ...events,
      {
        sequence: 7,
        kind: 'batch_status',
        payload: { status: 'preparing_context', batchId: 'batch-2' },
        createdAt: '2026-08-15T00:00:03.000Z',
      },
    ])
    expect(started.messages).toEqual([])
    expect(
      toCopilotChatMessages(started.visibleEvents, null, null).some(
        (message) => message.content === '第二批排队',
      ),
    ).toBe(true)
    expect(
      projectConversationFrame({
        events: started.visibleEvents,
        pendingText: null,
        liveAssistant: null,
        sessionReasoning: null,
      })
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => message.content),
    ).toEqual(['第一批', '出团日期是哪一天？', '第二批排队'])

    const retracted = projectQueuedConversationMessages([
      ...events,
      {
        sequence: 7,
        kind: 'batch_status',
        payload: {
          status: 'cancelled',
          batchId: 'batch-2',
          reason: 'queue_retracted',
          retractedUserMessageSequence: 3,
        },
        createdAt: '2026-08-15T00:00:03.000Z',
      },
    ])
    expect(retracted.messages).toEqual([])
    expect(
      toCopilotChatMessages(retracted.visibleEvents, null, null).some(
        (message) => message.content === '第二批排队',
      ),
    ).toBe(false)
  })

  it('releases a queued turn into the transcript once that batch already has an agent_message', () => {
    const events = [
      {
        sequence: 1,
        kind: 'user_message',
        payload: { text: '第一批' },
        createdAt: '2026-08-15T00:00:00.000Z',
      },
      {
        sequence: 2,
        kind: 'batch_status',
        payload: { status: 'completed', batchId: 'batch-1' },
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
        sequence: 5,
        kind: 'agent_message',
        payload: { text: '第二批回复', batchId: 'batch-2', attemptId: 'attempt-2' },
        createdAt: '2026-08-15T00:00:02.000Z',
      },
    ]
    const queued = projectQueuedConversationMessages(events)
    const messages = projectConversationFrame({
      events: queued.visibleEvents,
      pendingText: null,
      liveAssistant: null,
      sessionReasoning: null,
    })

    expect(queued.messages).toEqual([])
    expect(messages.some((message) => message.content === '第二批排队')).toBe(true)
    expect(messages.some((message) => message.content === '第二批回复')).toBe(true)
    expect(
      messages
        .filter((message) => message.activityType === 'ai-create-batch-status')
        .map((message) => (message.content as { label?: string }).label),
    ).not.toContain('已排队')
  })

  it('按批次执行顺序交错展示排队提问与两次回答', () => {
    const events = [
      {
        sequence: 1,
        kind: 'user_message',
        payload: { text: '提问一' },
        createdAt: '2026-08-28T01:09:43.074Z',
      },
      {
        sequence: 2,
        kind: 'batch_status',
        payload: { status: 'agent_running', batchId: 'batch-1', queued: false },
        createdAt: '2026-08-28T01:09:43.209Z',
      },
      {
        sequence: 3,
        kind: 'user_message',
        payload: { text: '提问二' },
        createdAt: '2026-08-28T01:09:45.402Z',
      },
      {
        sequence: 4,
        kind: 'batch_status',
        payload: { status: 'ready_for_agent', batchId: 'batch-2', queued: true },
        createdAt: '2026-08-28T01:09:45.410Z',
      },
      {
        sequence: 5,
        kind: 'agent_message',
        payload: { text: '回答一', batchId: 'batch-1' },
        createdAt: '2026-08-28T01:09:45.946Z',
      },
      {
        sequence: 6,
        kind: 'batch_status',
        payload: { status: 'completed', batchId: 'batch-1' },
        createdAt: '2026-08-28T01:09:45.949Z',
      },
      {
        sequence: 7,
        kind: 'batch_status',
        payload: { status: 'preparing_context', batchId: 'batch-2' },
        createdAt: '2026-08-28T01:09:45.995Z',
      },
      {
        sequence: 8,
        kind: 'agent_message',
        payload: { text: '回答二', batchId: 'batch-2' },
        createdAt: '2026-08-28T01:09:49.498Z',
      },
    ]

    const queued = projectQueuedConversationMessages(events)
    const turns = projectConversationFrame({
      events: queued.visibleEvents,
      pendingText: null,
      liveAssistant: null,
      sessionReasoning: null,
    })
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => message.content)

    expect(turns).toEqual(['提问一', '回答一', '提问二', '回答二'])
  })

  it('releases a queued turn into the transcript when live output arrives for that batch', () => {
    const events = [
      {
        sequence: 1,
        kind: 'user_message',
        payload: { text: '第一批' },
        createdAt: '2026-08-15T00:00:00.000Z',
      },
      {
        sequence: 2,
        kind: 'batch_status',
        payload: { status: 'completed', batchId: 'batch-1' },
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
    ]
    const liveAssistant = {
      attemptId: 'attempt-2',
      batchId: 'batch-2',
      generation: 1,
      revision: 1,
      reasoningText: '',
      text: '第二批正在回复',
    }
    const queued = projectQueuedConversationMessages(events, liveAssistant)
    const messages = projectConversationFrame({
      events: queued.visibleEvents,
      pendingText: null,
      liveAssistant,
      sessionReasoning: null,
    })

    expect(queued.messages).toEqual([])
    expect(messages.some((message) => message.content === '第二批排队')).toBe(true)
    expect(messages.some((message) => message.content === '第二批正在回复')).toBe(true)
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

  it('projects a visible task activity and links its review back to the created task', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'user_message',
          payload: { text: '帮我创建发团：9 月 15 日出发，行程 8 天' },
          createdAt: '2026-08-27T00:00:00.000Z',
        },
        {
          sequence: 2,
          kind: 'batch_status',
          payload: {
            status: 'ready_for_agent',
            batchId: 'batch-1',
            createdTaskId: 'task-1',
            createdTaskGoal: '创建 9 月 15 日出发的 8 天行程',
            createdTaskType: 'departure_creation',
            continuation: true,
          },
          createdAt: '2026-08-27T00:00:01.000Z',
        },
        {
          sequence: 3,
          kind: 'agent_message',
          payload: {
            text: '已提交待审核建议，请在中间表单确认。',
            batchId: 'batch-1',
            taskId: 'task-1',
            reviewPackageId: 'pkg-1',
            fieldKeys: ['routeName', 'startDate', 'endDate'],
          },
          createdAt: '2026-08-27T00:00:02.000Z',
        },
        {
          sequence: 4,
          kind: 'batch_status',
          payload: {
            status: 'awaiting_review',
            batchId: 'batch-1',
            taskId: 'task-1',
            reviewPackageId: 'pkg-1',
          },
          createdAt: '2026-08-27T00:00:03.000Z',
        },
      ],
      null,
      null,
    )

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'activity',
          activityType: 'agent-task',
          content: expect.objectContaining({
            taskId: 'task-1',
            title: '创建 9 月 15 日出发的 8 天行程',
            status: 'awaiting_review',
            taskType: 'departure_creation',
          }),
        }),
        expect.objectContaining({
          role: 'activity',
          activityType: 'ai-create-review-package',
          content: expect.objectContaining({
            reviewPackageId: 'pkg-1',
            taskId: 'task-1',
            taskType: 'departure_creation',
          }),
        }),
      ]),
    )
  })

  it('falls back to the registered default title when the event has no goal #439', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'batch_status',
          payload: {
            status: 'ready_for_agent',
            batchId: 'batch-1',
            createdTaskId: 'task-1',
            createdTaskType: 'departure_creation',
          },
          createdAt: '2026-08-27T00:00:01.000Z',
        },
      ],
      null,
      null,
    )

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'activity',
          activityType: 'agent-task',
          content: expect.objectContaining({
            taskId: 'task-1',
            taskType: 'departure_creation',
            title: '创建发团',
            status: 'ready_for_agent',
          }),
        }),
      ]),
    )
  })

  it('does not use the departure default title for an unregistered task type #439', () => {
    const messages = toCopilotChatMessages(
      [
        {
          sequence: 1,
          kind: 'batch_status',
          payload: {
            status: 'ready_for_agent',
            batchId: 'batch-1',
            createdTaskId: 'task-1',
            createdTaskType: 'unknown.task',
          },
          createdAt: '2026-08-27T00:00:01.000Z',
        },
      ],
      null,
      null,
    )

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'activity',
          activityType: 'agent-task',
          content: expect.objectContaining({
            taskId: 'task-1',
            taskType: 'unknown.task',
            title: '任务',
            status: 'ready_for_agent',
          }),
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

  it('keeps the later cumulative snapshot when an earlier revision was missed', () => {
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        revision: 3,
        reasoningText: '先核对出团日期',
        text: '已整理当前资料。',
      },
    })
    expect(messages.filter((message) => message.role === 'assistant')).toEqual([
      {
        id: 'live-assistant-attempt-9',
        role: 'assistant',
        content: '已整理当前资料。',
      },
    ])
    expect(messages.some((message) => message.role === 'reasoning')).toBe(true)
    expect(messages.some((message) => message.content === '已')).toBe(false)
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
    expect(messages.filter((message) => message.role === 'reasoning')).toEqual([
      {
        id: 'live-reasoning-attempt-9',
        role: 'reasoning',
        content: '先核对出团日期',
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
    expect(firstStep.filter((message) => message.role === 'reasoning')).toEqual([
      {
        id: 'live-reasoning-attempt-9',
        role: 'reasoning',
        content: '先核对出团日期',
      },
    ])

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
    expect(nextStep.filter((message) => message.role === 'reasoning')).toEqual([
      {
        id: 'live-reasoning-attempt-9',
        role: 'reasoning',
        content: '再核人数',
      },
    ])
    expect(nextStep.filter((message) => message.role === 'assistant')).toEqual([
      {
        id: 'live-assistant-attempt-9',
        role: 'assistant',
        content: '已记下路线。日期待核对。',
      },
    ])
  })

  it('keeps 思考过程 as CopilotKit reasoning after agent_message when the session still has it', () => {
    const completed = [
      ...runningEvents,
      {
        sequence: 3,
        kind: 'agent_message' as const,
        payload: {
          text: '已记下路线。日期待核对。',
          batchId: 'batch-1',
          attemptId: 'attempt-9',
        },
        createdAt: '2026-08-26T00:00:02.000Z',
      },
    ]
    const refreshed = projectConversationFrame({
      events: completed,
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
    expect(refreshed.some((message) => message.role === 'reasoning')).toBe(false)
    expect(refreshed.filter((message) => message.role === 'assistant')).toEqual([
      expect.objectContaining({
        id: 'event-3',
        role: 'assistant',
        content: '已记下路线。日期待核对。',
      }),
    ])

    const inSession = projectConversationFrame({
      events: completed,
      pendingText: null,
      liveAssistant: null,
      sessionReasoning: { 'attempt-9': '再核人数' },
    })
    const assistantIndex = inSession.findIndex((message) => message.id === 'event-3')
    expect(inSession[assistantIndex - 1]).toEqual({
      id: 'live-reasoning-attempt-9',
      role: 'reasoning',
      content: '再核人数',
    })
    expect(inSession[assistantIndex]).toEqual(
      expect.objectContaining({
        id: 'event-3',
        role: 'assistant',
        content: '已记下路线。日期待核对。',
      }),
    )
  })

  it('still shows 思考过程 on the next turn after the previous batch completed', () => {
    const messages = projectConversationFrame({
      events: [
        ...runningEvents,
        {
          sequence: 3,
          kind: 'agent_message',
          payload: {
            text: '已记下路线。',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
          },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
        {
          sequence: 4,
          kind: 'batch_status',
          payload: {
            status: 'completed',
            batchId: 'batch-1',
            attemptId: 'attempt-9',
          },
          createdAt: '2026-08-26T00:00:03.000Z',
        },
        {
          sequence: 5,
          kind: 'user_message',
          payload: { text: '人数呢' },
          createdAt: '2026-08-26T00:00:04.000Z',
        },
      ],
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-10',
        batchId: 'batch-2',
        generation: 4,
        revision: 1,
        reasoningText: '再核第二轮人数',
        text: '',
      },
      sessionReasoning: { 'attempt-9': '先核对出团日期' },
    })
    expect(messages.filter((message) => message.role === 'reasoning')).toEqual([
      {
        id: 'live-reasoning-attempt-9',
        role: 'reasoning',
        content: '先核对出团日期',
      },
      {
        id: 'live-reasoning-attempt-10',
        role: 'reasoning',
        content: '再核第二轮人数',
      },
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
        reasoningText: '可以再核对审核包',
        text: '',
      },
    })
    expect(messages.some((message) => message.activityType === 'ai-create-review-package')).toBe(
      false,
    )
    expect(JSON.stringify(messages)).not.toContain('tool.call')
    expect(messages.filter((message) => message.role === 'reasoning')).toEqual([
      {
        id: 'live-reasoning-attempt-9',
        role: 'reasoning',
        content: '可以再核对审核包',
      },
    ])
  })

  it('hides leaked system prompt fragments and English chain-of-thought from 思考过程', () => {
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-9',
        batchId: 'batch-1',
        generation: 3,
        revision: 1,
        reasoningText:
          'Let me reconsider: the conversation context is about 小团宝工作台. 根据当前 User 输入用中文给出简洁、可执行的说明。调用 routeConversation 登记建团目标。',
        text: '',
      },
    })
    const reasoning = messages.filter((message) => message.role === 'reasoning')
    expect(JSON.stringify(reasoning)).not.toContain('Let me reconsider')
    expect(JSON.stringify(reasoning)).not.toContain('routeConversation')
    expect(JSON.stringify(reasoning)).not.toContain('根据当前 User 输入')
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
      sessionReasoning: { 'attempt-9': '先核对出团日期' },
    })
    expect(messages.some((message) => message.role === 'reasoning')).toBe(false)
    expect(messages.some((message) => message.content === '半段回复')).toBe(false)
  })
})

describe('projectConversationFrame Agent 本次运行停止 #417', () => {
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

  const livePartial = {
    attemptId: 'attempt-9',
    batchId: 'batch-1',
    generation: 3,
    revision: 4,
    reasoningText: '先核对出团日期',
    text: '已记下半段',
  }

  it('does not put a stop control on batch status; composer owns stop while the batch is in flight', () => {
    for (const status of ['ready_for_agent', 'preparing_context', 'agent_running'] as const) {
      const events = [
        {
          sequence: 1,
          kind: 'user_message' as const,
          payload: { text: '帮我查一下账款' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
        {
          sequence: 2,
          kind: 'batch_status' as const,
          payload: { status, batchId: 'batch-1' },
          createdAt: '2026-08-26T00:00:01.000Z',
        },
      ]
      const statusContent = toCopilotChatMessages(events, null, null)
        .filter((message) => message.activityType === 'ai-create-batch-status')
        .map((message) => message.content as { showStopAction?: boolean; batchId?: string })
      expect(statusContent).toEqual([expect.objectContaining({ batchId: 'batch-1' })])
      expect(statusContent.some((item) => item.showStopAction)).toBe(false)
      expect(currentStoppableBatchId(events)).toBe('batch-1')
    }
  })

  it('replaces live 思考过程 and partial reply with 已停止当前处理 and does not invent agent_message', () => {
    const messages = projectConversationFrame({
      events: [
        ...runningEvents,
        {
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
      pendingText: null,
      liveAssistant: livePartial,
      sessionReasoning: { 'attempt-9': '先核对出团日期' },
    })
    expect(
      messages
        .filter((message) => message.activityType === 'ai-create-batch-status')
        .map((message) => (message.content as { label?: string }).label),
    ).toEqual(['已停止当前处理'])
    expect(messages.some((message) => message.role === 'reasoning')).toBe(false)
    expect(messages.some((message) => message.role === 'assistant')).toBe(false)
    expect(messages.some((message) => message.content === '已记下半段')).toBe(false)
  })

  it('ignores a late snapshot after user_stop even when generation matches', () => {
    const stopped = [
      ...runningEvents,
      {
        sequence: 3,
        kind: 'batch_status' as const,
        payload: {
          status: 'cancelled',
          batchId: 'batch-1',
          attemptId: 'attempt-9',
          reason: 'user_stop',
        },
        createdAt: '2026-08-26T00:00:02.000Z',
      },
    ]
    const messages = projectConversationFrame({
      events: stopped,
      pendingText: null,
      liveAssistant: {
        ...livePartial,
        revision: 99,
        text: '停止后才赶到的半段',
      },
    })
    expect(messages.some((message) => message.content === '停止后才赶到的半段')).toBe(false)
    expect(isCopilotChatRunning(stopped, null, null, { ...livePartial, revision: 99 })).toBe(false)
  })

  it('resolves the latest in-flight batch for composer stop and ignores cancelled or HITL wait', () => {
    expect(currentStoppableBatchId(runningEvents)).toBe('batch-1')
    expect(
      currentStoppableBatchId([
        ...runningEvents,
        {
          sequence: 3,
          kind: 'batch_status',
          payload: {
            status: 'cancelled',
            batchId: 'batch-1',
            reason: 'user_stop',
          },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
      ]),
    ).toBeNull()
    expect(
      currentStoppableBatchId([
        {
          sequence: 1,
          kind: 'batch_status',
          payload: { status: 'awaiting_user_input', batchId: 'batch-1' },
          createdAt: '2026-08-26T00:00:00.000Z',
        },
      ]),
    ).toBeNull()
    expect(
      currentStoppableBatchId([], {
        id: 'batch-active',
        status: 'agent_running',
      } as never),
    ).toBe('batch-active')
    expect(
      currentStoppableBatchId([
        ...runningEvents,
        {
          sequence: 3,
          kind: 'user_message',
          payload: { text: '排队甲' },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
        {
          sequence: 4,
          kind: 'batch_status',
          payload: { status: 'ready_for_agent', batchId: 'batch-2', queued: true },
          createdAt: '2026-08-26T00:00:02.000Z',
        },
      ]),
    ).toBe('batch-1')
  })
})

describe('projectConversationFrame retry and stale generation #418', () => {
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

  it('replaces previous Attempt live text as soon as the new generation first frame arrives', () => {
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-10',
        batchId: 'batch-1',
        generation: 4,
        revision: 1,
        reasoningText: '',
        text: '重试后的第一句',
      },
    })
    expect(messages.filter((message) => message.role === 'assistant')).toEqual([
      {
        id: 'live-assistant-attempt-10',
        role: 'assistant',
        content: '重试后的第一句',
      },
    ])
  })

  it('ignores a mismatched attemptId even when revision is larger', () => {
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: {
        attemptId: 'attempt-old',
        batchId: 'batch-1',
        generation: 3,
        revision: 99,
        reasoningText: '',
        text: '同代次迟到',
      },
    })
    expect(messages.some((message) => message.content === '同代次迟到')).toBe(false)
  })

  it('keeps persist-failure retry text as in-progress and does not invent a finished agent_message', () => {
    const live = {
      attemptId: 'attempt-9',
      batchId: 'batch-1',
      generation: 3,
      revision: 4,
      reasoningText: '',
      text: '半段将重试',
    }
    const messages = projectConversationFrame({
      events: runningEvents,
      pendingText: null,
      liveAssistant: live,
    })
    expect(messages.filter((message) => message.role === 'assistant')).toEqual([
      {
        id: 'live-assistant-attempt-9',
        role: 'assistant',
        content: '半段将重试',
      },
    ])
    expect(
      messages.some(
        (message) => message.role === 'assistant' && String(message.id).startsWith('event-'),
      ),
    ).toBe(false)
    expect(isCopilotChatRunning(runningEvents, null, null, live)).toBe(true)
  })

  it('does not keep live text after a failed batch even when the failure event omits attemptId', () => {
    const messages = projectConversationFrame({
      events: [
        ...runningEvents,
        {
          sequence: 3,
          kind: 'batch_status',
          payload: {
            status: 'failed',
            batchId: 'batch-1',
            errorCode: 'AGENT_UNAVAILABLE',
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
        reasoningText: '先核对出团日期',
        text: '半段回复',
      },
    })
    expect(messages.some((message) => message.content === '半段回复')).toBe(false)
    expect(messages.some((message) => message.role === 'assistant')).toBe(false)
    expect(messages.some((message) => message.role === 'reasoning')).toBe(false)
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
