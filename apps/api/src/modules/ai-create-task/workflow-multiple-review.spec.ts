import { AiWorkflowProcessor } from './ai-workflow.processor'
import { SEGMENT_RESOURCE_CONFIRMATION_UNIT } from '@xiaotuanbao/ai-contracts'

describe('collaboration review projection', () => {
  it('rejects a proposal that drops the user-selected revision target', async () => {
    const processor = Object.create(AiWorkflowProcessor.prototype)
    const tx = { aiConversationEvent: { findUniqueOrThrow: async () => ({
      payload: { reviewPackageId: 'package-b', expectedPackageVersion: 2 },
    }) } }
    await expect(processor.projectReviewPackageViaGateway(tx, {
      taskId: 'task', inputBatch: { userMessageEventId: 'message' },
    }, 'attempt', { objectVersion: 1, candidates: [] })).rejects.toThrow('REVIEW_PACKAGE_REFERENCE_MISMATCH')
  })

  it('commits every accepted item and publishes all package IDs', async () => {
    const update = jest.fn()
    const tx = {
      $queryRaw: jest.fn(),
      aiWorkflowJob: { findUniqueOrThrow: async () => ({ generation: 1 }), update },
      aiAgentAttempt: { findUnique: async () => ({ generation: 1, status: 'running' }), update },
      agentTask: { findUnique: async () => ({ status: 'active' }), updateMany: update },
      aiReviewPackage: { findUniqueOrThrow: async () => ({ confirmationUnit: SEGMENT_RESOURCE_CONFIRMATION_UNIT, targetId: 'departure' }) },
      aiInputBatch: { update }, taskActivity: { create: update }, aiConversation: { update },
    }
    const appendEvent = jest.fn(async () => ({ id: 'event' }))
    const projectReviewPackageViaGateway = jest.fn()
      .mockResolvedValueOnce('package-a').mockResolvedValueOnce('package-b')
    const processor = Object.assign(Object.create(AiWorkflowProcessor.prototype), {
      prisma: { $transaction: (run: (client: typeof tx) => Promise<void>) => run(tx) },
      ownsClaimedJob: async () => true,
      recheckAuthorization: async () => ({ ok: true }),
      conversationService: { appendEvent }, projectReviewPackageViaGateway,
      writeManifestUsage: async () => {}, publishCommittedEvents: async () => {},
    })
    const first = { objectVersion: 1, confirmationUnit: SEGMENT_RESOURCE_CONFIRMATION_UNIT, candidates: [{ fieldKey: 'title', proposedValue: 'A' }] }
    const second = { ...first, candidates: [{ fieldKey: 'title', proposedValue: 'B' }] }
    await processor.persistOutcome({ id: 'job', taskId: 'task', conversationId: 'chat', inputBatchId: 'batch' }, {}, {}, 'attempt', {
      kind: 'awaiting_review', reviewPackage: first, reviewPackages: [first, second],
    })
    expect(projectReviewPackageViaGateway.mock.calls.map((call) => call[3])).toEqual([first, second])
    expect(appendEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      kind: 'agent_message', payload: expect.objectContaining({ reviewPackageIds: ['package-a', 'package-b'] }),
    }))
  })
})
