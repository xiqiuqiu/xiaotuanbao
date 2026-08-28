import { describe, expect, it } from 'vitest'
import type { DepartureMaterialView } from '@xiaotuanbao/shared'
import {
  ASSIST_ACTIVE_POLL_MS,
  CONVERSATION_ACTIVE_CATCH_UP_MS,
  CONVERSATION_IDLE_CATCH_UP_MS,
  MATERIALS_WAITING_POLL_MS,
  assistStateRefetchInterval,
  conversationCatchUpIntervalMs,
  materialsRefetchInterval,
  taskReviewRefetchInterval,
} from './ai-create-assist-polling'

function material(
  status: DepartureMaterialView['status'],
): DepartureMaterialView {
  return {
    id: `mat-${status}`,
    originalFilename: '团期.png',
    contentType: 'image/png',
    status,
    statusVersion: 1,
    sha256: 'abc',
    sizeBytes: 12,
    createdAt: '2026-08-18T00:00:00.000Z',
    latestResultVersion: null,
  }
}

describe('ai-create-assist-polling', () => {
  it('does not poll materials when the list is empty or already settled', () => {
    expect(materialsRefetchInterval(undefined)).toBe(false)
    expect(materialsRefetchInterval([])).toBe(false)
    expect(materialsRefetchInterval([material('available')])).toBe(false)
    expect(materialsRefetchInterval([material('failed')])).toBe(false)
  })

  it('polls materials only while a file is queued or parsing', () => {
    expect(materialsRefetchInterval([material('parsing')])).toBe(MATERIALS_WAITING_POLL_MS)
    expect(materialsRefetchInterval([material('available'), material('queued')])).toBe(
      MATERIALS_WAITING_POLL_MS,
    )
  })

  it('does not poll assist-state while the entry is idle', () => {
    expect(assistStateRefetchInterval(undefined)).toBe(false)
    expect(assistStateRefetchInterval('idle')).toBe(false)
    expect(assistStateRefetchInterval('awaiting_review')).toBe(false)
    expect(assistStateRefetchInterval('failed')).toBe(false)
  })

  it('polls assist-state only while parsing or the agent is running', () => {
    expect(assistStateRefetchInterval('parsing')).toBe(ASSIST_ACTIVE_POLL_MS)
    expect(assistStateRefetchInterval('ai_processing')).toBe(ASSIST_ACTIVE_POLL_MS)
  })

  it('does not poll the task while the empty chat is open', () => {
    expect(
      taskReviewRefetchInterval({
        paneOpen: true,
        hasPendingReview: false,
        assistStatus: 'idle',
      }),
    ).toBe(false)
    expect(
      taskReviewRefetchInterval({
        paneOpen: false,
        hasPendingReview: true,
        assistStatus: 'ai_processing',
      }),
    ).toBe(false)
  })

  it('polls the task while a review is pending or the agent is in flight', () => {
    expect(
      taskReviewRefetchInterval({
        paneOpen: true,
        hasPendingReview: true,
        assistStatus: 'idle',
      }),
    ).toBe(ASSIST_ACTIVE_POLL_MS)
    expect(
      taskReviewRefetchInterval({
        paneOpen: true,
        hasPendingReview: false,
        assistStatus: 'ai_processing',
      }),
    ).toBe(ASSIST_ACTIVE_POLL_MS)
  })

  it('keeps polling the task after the agent reaches awaiting_review until the overlay is cached', () => {
    expect(
      taskReviewRefetchInterval({
        paneOpen: true,
        hasPendingReview: false,
        assistStatus: 'awaiting_review',
      }),
    ).toBe(ASSIST_ACTIVE_POLL_MS)
  })

  it('slows conversation catch-up while the chat is idle', () => {
    expect(conversationCatchUpIntervalMs(null)).toBe(CONVERSATION_IDLE_CATCH_UP_MS)
    expect(conversationCatchUpIntervalMs('completed')).toBe(CONVERSATION_IDLE_CATCH_UP_MS)
    expect(conversationCatchUpIntervalMs('awaiting_review')).toBe(CONVERSATION_IDLE_CATCH_UP_MS)
    expect(conversationCatchUpIntervalMs('agent_running')).toBe(CONVERSATION_ACTIVE_CATCH_UP_MS)
    expect(conversationCatchUpIntervalMs('preparing_context')).toBe(CONVERSATION_ACTIVE_CATCH_UP_MS)
    expect(conversationCatchUpIntervalMs('waiting_for_materials')).toBe(
      CONVERSATION_ACTIVE_CATCH_UP_MS,
    )
  })
})
