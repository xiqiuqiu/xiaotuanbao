import { fetchTaskContext } from './get-task-context.client'
import type { GetTaskContextOutput } from '@xiaotuanbao/ai-contracts'

describe('fetchTaskContext', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('calls NestJS with dual identity headers and returns min context', async () => {
    const context: GetTaskContextOutput = {
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
      },
      objectVersion: 2,
      pending: { hasPendingReview: false, reviewPackageId: null },
      availableCapabilities: ['getTaskContext'],
      fieldCoverage: {
        filled: ['name', 'routeName', 'startDate', 'endDate', 'ownerUserId', 'departureType'],
        missing: [],
        optionalPresent: [],
      },
    }

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: context }),
    })

    const result = await fetchTaskContext(
      {
        apiBaseUrl: 'http://api.local',
        serviceSecret: 'secret',
        delegationToken: 'deleg-1',
      },
      { taskId: 'task-1', runId: 'run-1' },
    )

    expect(result.objectVersion).toBe(2)
    expect(result.availableCapabilities).toEqual(['getTaskContext'])
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.local/api/ai-tools/v1/get-task-context',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Agent-Service-Key': 'secret',
          Authorization: 'Bearer deleg-1',
        }),
      }),
    )
  })
})
