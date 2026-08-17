import { describe, expect, it } from 'vitest'
import {
  batchStatusLabel,
  toCopilotChatMessages,
} from './ai-create-copilot-messages'

describe('AI create chat status projection', () => {
  it('labels running, queued and waiting-for-answer from server status', () => {
    expect(batchStatusLabel('agent_running')).toBe('AI 处理中')
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
})
