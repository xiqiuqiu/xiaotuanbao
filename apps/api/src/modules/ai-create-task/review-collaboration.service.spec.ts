import { ConflictException } from '@nestjs/common'
import {
  AiReviewPackageStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
} from '@prisma/client'
import { reviewDecisionRequestHash } from './review-package.envelope'
import { ReviewCollaborationService } from './review-collaboration.service'
import {
  REVIEW_CONFIRM_BATCH_OPERATION,
  REVIEW_CONFIRM_ITEM_OPERATION,
  reviewConfirmJobKey,
} from './review-collaboration.constants'

describe('ReviewCollaborationService #447', () => {
  const organizationId = 'org-1'
  const userId = 'user-1'
  const pendingPackage = {
    id: 'pkg-1',
    organizationId,
    status: AiReviewPackageStatus.pending,
    version: 1,
    itemIdentity: 'item:0',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    taskId: 'task-1',
    targetKind: 'departure',
    targetId: 'departure-1',
    baseObjectVersion: 3,
    candidates: [],
    userCorrections: {},
    task: { organizationId, ownerUserId: userId },
  }

  function createService(options?: {
    batchRecord?: Record<string, unknown>
    packages?: Array<Record<string, unknown>>
  }) {
    const packages = options?.packages ?? [pendingPackage]
    const jobs: Array<Record<string, unknown>> = []
    const itemRecords = new Map<string, Record<string, unknown>>()
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      aiReviewPackage: {
        findMany: jest.fn().mockResolvedValue(packages),
        findFirst: jest.fn().mockResolvedValue(pendingPackage),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      aiCreateIdempotencyRecord: {
        upsert: jest.fn().mockImplementation(
          ({
            create,
            where,
          }: {
            create: Record<string, unknown>
            where: { organizationId_operation_idempotencyKey: { idempotencyKey: string; operation: string } }
          }) => {
            const key = `${where.organizationId_operation_idempotencyKey.operation}:${where.organizationId_operation_idempotencyKey.idempotencyKey}`
            if (
              where.organizationId_operation_idempotencyKey.operation === REVIEW_CONFIRM_BATCH_OPERATION &&
              options?.batchRecord
            ) {
              return Promise.resolve(options.batchRecord)
            }
            const created = { id: `idem-${key}`, completedAt: null, ...create }
            if (where.organizationId_operation_idempotencyKey.operation === REVIEW_CONFIRM_ITEM_OPERATION) {
              itemRecords.set(where.organizationId_operation_idempotencyKey.idempotencyKey, created)
            }
            return Promise.resolve(created)
          },
        ),
        findUniqueOrThrow: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: { organizationId_operation_idempotencyKey: { idempotencyKey: string } }
          }) => itemRecords.get(where.organizationId_operation_idempotencyKey.idempotencyKey),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      aiWorkflowJob: {
        upsert: jest.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) => {
          jobs.push(create)
          return Promise.resolve({ id: `job-${jobs.length}`, ...create })
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      aiReviewRecord: { create: jest.fn().mockResolvedValue({}) },
      agentTask: { findFirst: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      aiCreateIdempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      aiWorkflowJob: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      conversationDepartureLink: { findMany: jest.fn().mockResolvedValue([]) },
      aiReviewPackage: { findMany: jest.fn().mockResolvedValue([]) },
      aiReviewRecord: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const tasks = {
      confirmDepartureReviewPackage: jest.fn(),
      resolveOwnedReviewTaskId: jest.fn().mockResolvedValue('task-1'),
    }
    const conversations = {
      finalizeReviewDisposition: jest.fn().mockResolvedValue([]),
      publish: jest.fn(),
    }
    const service = new ReviewCollaborationService(
      prisma as never,
      tasks as never,
      conversations as never,
      { getById: jest.fn().mockResolvedValue({ id: 'departure-1' }) } as never,
    )
    return { service, prisma, tx, tasks, conversations, jobs }
  }

  it('accepts a multi-item confirmation and enqueues one job per item', async () => {
    const sibling = {
      ...pendingPackage,
      id: 'pkg-2',
      itemIdentity: 'item:1',
    }
    const { service, tx, jobs } = createService({ packages: [pendingPackage, sibling] })

    const accepted = await service.acceptReviewConfirmation(organizationId, userId, {
      decisionCommandId: 'decision-1',
      items: [
        { packageId: 'pkg-1', expectedPackageVersion: 1 },
        { packageId: 'pkg-2', expectedPackageVersion: 1 },
      ],
    })

    expect(accepted).toEqual({
      decisionCommandId: 'decision-1',
      accepted: true,
      items: [
        { packageId: 'pkg-1', itemIdentity: 'item:0', status: 'accepted' },
        { packageId: 'pkg-2', itemIdentity: 'item:1', status: 'accepted' },
      ],
    })
    expect(jobs).toEqual([
      expect.objectContaining({
        type: AiWorkflowJobType.review_confirm,
        jobKey: reviewConfirmJobKey('decision-1', 'pkg-1'),
        reviewPackageId: 'pkg-1',
        status: AiWorkflowJobStatus.pending,
      }),
      expect.objectContaining({
        jobKey: reviewConfirmJobKey('decision-1', 'pkg-2'),
        reviewPackageId: 'pkg-2',
      }),
    ])
    expect(tx.aiCreateIdempotencyRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId,
            operation: REVIEW_CONFIRM_BATCH_OPERATION,
            idempotencyKey: 'decision-1',
          },
        },
      }),
    )
  })

  it('rejects the same confirmation key when the selected items differ', async () => {
    const { service } = createService({
      batchRecord: {
        requestHash: 'different-hash',
        completedAt: null,
        resultJson: null,
      },
    })

    await expect(
      service.acceptReviewConfirmation(organizationId, userId, {
        decisionCommandId: 'decision-1',
        items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('returns the saved acceptance for an identical replayed confirmation', async () => {
    const dto = {
      decisionCommandId: 'decision-1',
      items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
    }
    const saved = {
      decisionCommandId: 'decision-1',
      accepted: true,
      items: [{ packageId: 'pkg-1', itemIdentity: 'item:0', status: 'accepted' }],
    }
    const { service, jobs } = createService({
      batchRecord: {
        requestHash: reviewDecisionRequestHash({
          decisionCommandId: dto.decisionCommandId,
          items: dto.items,
        }),
        completedAt: new Date(),
        resultJson: saved,
      },
    })

    await expect(service.acceptReviewConfirmation(organizationId, userId, dto)).resolves.toEqual(saved)
    expect(jobs).toHaveLength(0)
  })

  it('confirms an independent item in one transaction without the creation-draft path', async () => {
    const { service, tasks, conversations, prisma, tx } = createService()
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: pendingPackage,
      idempotencyRecord: {
        operatorUserId: userId,
        idempotencyKey: 'decision-1:pkg-1',
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(tasks.confirmDepartureReviewPackage).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'pkg-1',
        status: AiReviewPackageStatus.pending,
        version: 1,
      },
      data: expect.objectContaining({ status: AiReviewPackageStatus.confirmed }),
    })
    expect(conversations.finalizeReviewDisposition).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        reviewPackageId: 'pkg-1',
        disposition: 'confirmed',
      }),
    )
    expect(prisma.aiWorkflowJob.findUnique).toHaveBeenCalled()
  })

  it('does not rewrite an already confirmed independent item', async () => {
    const { service, conversations, prisma, tx } = createService()
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: { ...pendingPackage, status: AiReviewPackageStatus.confirmed },
      idempotencyRecord: { operatorUserId: userId, requestSnapshot: { expectedPackageVersion: 1 } },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(conversations.finalizeReviewDisposition).not.toHaveBeenCalled()
  })

  it('lists pending and disposed packages for an existing departure', async () => {
    const { service, prisma } = createService()
    prisma.conversationDepartureLink.findMany.mockResolvedValue([
      {
        conversationId: 'conv-1',
        conversation: {
          id: 'conv-1',
          title: '发团协作',
          lastActivityAt: new Date('2026-09-07T00:00:00.000Z'),
        },
      },
    ])
    prisma.aiReviewPackage.findMany.mockResolvedValue([
      pendingPackage,
      { ...pendingPackage, id: 'pkg-done', status: AiReviewPackageStatus.confirmed, itemIdentity: 'item:1' },
    ])
    prisma.aiWorkflowJob.findMany.mockResolvedValue([])

    const view = await service.listDepartureCollaboration(
      organizationId,
      userId,
      'departure-1',
      'conv-1',
    )

    expect(view.departureId).toBe('departure-1')
    expect(view.conversations).toEqual([
      { id: 'conv-1', title: '发团协作', lastActivityAt: '2026-09-07T00:00:00.000Z' },
    ])
    expect(view.items.map((item: { id: string; status: string }) => ({ id: item.id, status: item.status }))).toEqual([
      { id: 'pkg-1', status: 'pending' },
      { id: 'pkg-done', status: 'confirmed' },
    ])
  })
})
