import { buildReadonlyAssistReply } from './readonly-turn'
import type { GetTaskContextOutput } from '@xiaotuanbao/ai-contracts'

function context(overrides: Partial<GetTaskContextOutput['fieldCoverage']> = {}): GetTaskContextOutput {
  return {
    task: {
      id: 'task-1',
      status: 'in_progress',
      currentPhase: 'basic_info',
      creatorUserId: 'user-1',
    },
    snapshot: {
      mode: 'manual',
      routeName: '川西线',
      name: '八月团',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      ownerUserId: 'user-1',
      departureType: 'combined',
      expectedGuestCountHint: 12,
    },
    objectVersion: 4,
    pending: { hasPendingReview: false, reviewPackageId: null },
    availableCapabilities: ['getTaskContext'],
    fieldCoverage: {
      filled: ['name', 'routeName', 'startDate', 'endDate', 'ownerUserId', 'departureType'],
      missing: [],
      optionalPresent: ['expectedGuestCountHint'],
      ...overrides,
    },
  }
}

describe('buildReadonlyAssistReply', () => {
  it('mentions saved fields and does not ask for them again', () => {
    const reply = buildReadonlyAssistReply(context())
    expect(reply).toContain('团名')
    expect(reply).toContain('路线')
    expect(reply).toContain('必填基础信息已齐')
    expect(reply).not.toContain('仍缺少')
    expect(reply).toContain('不会改写发团创建草稿')
  })

  it('asks only about missing required fields', () => {
    const reply = buildReadonlyAssistReply(
      context({
        filled: ['routeName', 'departureType'],
        missing: ['name', 'startDate', 'endDate', 'ownerUserId'],
        optionalPresent: [],
      }),
    )
    expect(reply).toContain('仍缺少：团名、出团日期、结束日期、负责人')
    expect(reply).not.toContain('仍缺少：路线')
  })
})
