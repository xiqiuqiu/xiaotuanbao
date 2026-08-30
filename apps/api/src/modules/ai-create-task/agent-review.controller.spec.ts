import { AgentReviewController } from './agent-review.controller'

describe('AgentReviewController #440', () => {
  it('routes a HITL confirm through the registered domain adapter', async () => {
    const tasks = {
      resolveOwnedReviewTaskId: jest.fn().mockResolvedValue('task-1'),
      confirmDepartureReviewPackage: jest.fn(),
    }
    const adapter = {
      confirmReview: jest.fn().mockResolvedValue({ id: 'task-1' }),
    }
    const controller = new AgentReviewController(tasks as never, adapter as never)

    await expect(
      controller.confirm(
        { user: { organizationId: 'org-1', userId: 'user-1' } },
        'pkg-1',
        { expectedVersion: 1, expectedPackageVersion: 1 },
        'decision-1',
      ),
    ).resolves.toEqual({ id: 'task-1' })
    expect(adapter.confirmReview).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      reviewPackageId: 'pkg-1',
      input: { expectedVersion: 1, expectedPackageVersion: 1 },
      decisionCommandId: 'decision-1',
    })
    expect(tasks.confirmDepartureReviewPackage).not.toHaveBeenCalled()
  })
})
