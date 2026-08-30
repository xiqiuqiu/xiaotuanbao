import {
  DEPARTURE_BASIC_INFO_REVIEW_SCHEMA,
  DEPARTURE_CREATION_TASK_DESCRIPTOR,
} from '@xiaotuanbao/ai-contracts'
import { DepartureAgentTaskAdapter } from './departure-agent-task.adapter'

describe('DepartureAgentTaskAdapter #440', () => {
  it('provides the registered snapshot, field catalog, review submission, command and navigation', async () => {
    const tasks = {
      getTaskContextForAgent: jest.fn().mockResolvedValue({ snapshot: { routeName: '川西' } }),
      proposeReviewPackageForAgent: jest.fn().mockResolvedValue({ status: 'accepted' }),
      submitReviewPackageForAgent: jest.fn().mockResolvedValue({ reviewPackageId: 'pkg-1' }),
      resolveOwnedReviewTaskId: jest.fn().mockResolvedValue('task-1'),
      confirmReviewPackage: jest.fn().mockResolvedValue({ id: 'task-1' }),
      confirm: jest.fn().mockResolvedValue({ id: 'departure-1' }),
    }
    const adapter = new DepartureAgentTaskAdapter(tasks as never)
    const caller = {
      userId: 'user-1',
      organizationId: 'org-1',
      taskId: 'task-1',
      runId: 'run-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
    }

    await expect(adapter.getSnapshot(caller as never, { taskId: 'task-1', runId: 'run-1' })).resolves
      .toMatchObject({ snapshot: { routeName: '川西' } })
    expect(adapter.descriptor).toBe(DEPARTURE_CREATION_TASK_DESCRIPTOR)
    expect(adapter.reviewSchema).toBe(DEPARTURE_BASIC_INFO_REVIEW_SCHEMA)
    expect(adapter.fieldCatalog()).toEqual(
      DEPARTURE_BASIC_INFO_REVIEW_SCHEMA.confirmationUnits[0].fields,
    )

    await adapter.proposeReview(caller as never, { objectVersion: 1 })
    await adapter.submitReview(caller as never, { objectVersion: 1 }, { sourceActionId: 'action-1' })
    await adapter.executeBusinessCommand({
      kind: 'complete',
      organizationId: 'org-1',
      userId: 'user-1',
      taskId: 'task-1',
      input: { expectedVersion: 1 },
      idempotencyKey: 'command-1',
    })
    await adapter.confirmReview({
      organizationId: 'org-1',
      userId: 'user-1',
      reviewPackageId: 'pkg-1',
      input: { expectedVersion: 1, expectedPackageVersion: 1 },
      decisionCommandId: 'decision-1',
    })

    expect(tasks.proposeReviewPackageForAgent).toHaveBeenCalled()
    expect(tasks.submitReviewPackageForAgent).toHaveBeenCalled()
    expect(tasks.confirm).toHaveBeenCalled()
    expect(tasks.confirmReviewPackage).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'task-1',
      'pkg-1',
      { expectedVersion: 1, expectedPackageVersion: 1 },
      'decision-1',
    )
    expect(adapter.workspaceNavigation('task-1')).toEqual({
      pathname: '/departure/new',
      search: { taskId: 'task-1' },
    })
    expect(adapter.completedNavigation('departure-1')).toEqual({
      pathname: '/departure/$departureId',
      params: { departureId: 'departure-1' },
      search: { tab: 'overview' },
    })
  })
})
