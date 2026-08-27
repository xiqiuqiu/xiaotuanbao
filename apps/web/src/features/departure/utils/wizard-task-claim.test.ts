import { describe, expect, it } from 'vitest'
import type { AiConversationEventView } from '@xiaotuanbao/shared'
import { latestConversationEventSequence, proposedTaskToClaim } from './wizard-task-claim'

function event(
  sequence: number,
  payload: Record<string, unknown>,
  kind: AiConversationEventView['kind'] = 'batch_status',
): AiConversationEventView {
  return {
    sequence,
    kind,
    payload,
    createdAt: '2026-08-27T00:00:00.000Z',
  }
}

describe('wizard task claim', () => {
  it('returns a task proposed after the wizard baseline in the same active conversation', () => {
    expect(
      proposedTaskToClaim({
        conversationId: 'conversation-1',
        runtimeConversationId: 'conversation-1',
        events: [
          event(4, { createdTaskId: 'old-task', continuation: true }),
          event(7, { createdTaskId: 'proposed-task', continuation: true }),
        ],
        afterSequence: 4,
        currentTaskId: null,
        historical: false,
      }),
    ).toBe('proposed-task')
  })

  it('does not claim a task that already existed when the blank wizard opened', () => {
    const events = [event(4, { createdTaskId: 'workbench-task', continuation: true })]

    expect(latestConversationEventSequence(events)).toBe(4)
    expect(
      proposedTaskToClaim({
        conversationId: 'conversation-1',
        runtimeConversationId: 'conversation-1',
        events,
        afterSequence: latestConversationEventSequence(events),
        currentTaskId: null,
        historical: false,
      }),
    ).toBeNull()
  })

  it('keeps a wizard task independent from a later proposal', () => {
    expect(
      proposedTaskToClaim({
        conversationId: 'conversation-1',
        runtimeConversationId: 'conversation-1',
        events: [event(5, { createdTaskId: 'proposed-task', continuation: true })],
        afterSequence: 4,
        currentTaskId: 'wizard-task',
        historical: false,
      }),
    ).toBeNull()
  })

  it('rejects history, another conversation, and non-continuation events', () => {
    const events = [event(5, { createdTaskId: 'proposed-task', continuation: false })]
    const base = {
      conversationId: 'conversation-1',
      runtimeConversationId: 'conversation-1',
      events,
      afterSequence: 4,
      currentTaskId: null,
      historical: false,
    }

    expect(proposedTaskToClaim({ ...base, historical: true })).toBeNull()
    expect(
      proposedTaskToClaim({ ...base, runtimeConversationId: 'conversation-2' }),
    ).toBeNull()
    expect(proposedTaskToClaim(base)).toBeNull()
  })
})
