import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/request'
import { readAiCreateTaskConflict } from './ai-create-task-conflict'

const summary = {
  id: 'task-1',
  status: 'in_progress' as const,
  currentPhase: 'basic_info' as const,
  departureId: null,
  creatorUserId: 'user-1',
  statusVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  draft: {
    version: 3,
    snapshot: { mode: 'manual' as const, routeName: '南疆6日游' },
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
}

describe('readAiCreateTaskConflict', () => {
  it('reads latest task summary from a 409 ApiError', () => {
    expect(readAiCreateTaskConflict(new ApiError('草稿版本已变化', 409, summary))).toEqual(
      summary,
    )
  })

  it('ignores non-conflict errors', () => {
    expect(readAiCreateTaskConflict(new ApiError('网络异常', 500))).toBeNull()
    expect(readAiCreateTaskConflict(new Error('草稿版本已变化'))).toBeNull()
  })
})
