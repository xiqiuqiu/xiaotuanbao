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
    const packages = (options?.packages ?? [pendingPackage]).map((pkg) => ({ ...pkg }))
    const jobs: Array<Record<string, unknown>> = []
    const itemRecords = new Map<string, Record<string, unknown>>()
    const batchRecords = new Map<string, Record<string, unknown>>()
    if (options?.batchRecord) {
      batchRecords.set(
        String(options.batchRecord.idempotencyKey ?? 'decision-1'),
        { id: 'idem-batch', ...options.batchRecord },
      )
    }
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      aiReviewPackage: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(packages.map((pkg) => ({ ...pkg })))),
        findFirst: jest.fn().mockImplementation(
          ({ where }: { where?: { id?: string } }) => {
            const current = packages.find((pkg) => pkg.id === where?.id) ?? packages[0]
            return Promise.resolve(current ? { ...current } : null)
          },
        ),
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
            if (where.organizationId_operation_idempotencyKey.operation === REVIEW_CONFIRM_BATCH_OPERATION) {
              const batchKey = where.organizationId_operation_idempotencyKey.idempotencyKey
              const existingBatch = batchRecords.get(batchKey)
              if (existingBatch) {
                return Promise.resolve(existingBatch)
              }
              const createdBatch = {
                id: `idem-batch-${batchKey}`,
                completedAt: null,
                resultJson: null,
                ...create,
              }
              batchRecords.set(batchKey, createdBatch)
              return Promise.resolve(createdBatch)
            }
            if (where.organizationId_operation_idempotencyKey.operation === REVIEW_CONFIRM_ITEM_OPERATION) {
              const existing = itemRecords.get(where.organizationId_operation_idempotencyKey.idempotencyKey)
              if (existing) {
                return Promise.resolve(existing)
              }
              const created = { id: `idem-${key}`, completedAt: null, resultJson: null, ...create }
              itemRecords.set(where.organizationId_operation_idempotencyKey.idempotencyKey, created)
              return Promise.resolve(created)
            }
            return Promise.resolve({ id: `idem-${key}`, completedAt: null, resultJson: null, ...create })
          },
        ),
        findUniqueOrThrow: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: { organizationId_operation_idempotencyKey: { idempotencyKey: string } }
          }) => itemRecords.get(where.organizationId_operation_idempotencyKey.idempotencyKey),
        ),
        update: jest.fn().mockImplementation(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            for (const record of batchRecords.values()) {
              if (record.id === where.id) {
                Object.assign(record, data)
                return Promise.resolve(record)
              }
            }
            return Promise.resolve(data)
          },
        ),
      },
      aiWorkflowJob: {
        findFirst: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where?: {
              reviewPackageId?: string
              status?: { in?: AiWorkflowJobStatus[] }
              jobKey?: { not?: string }
              NOT?: { jobKey?: string }
            }
          }) => {
            const match = jobs.find((job) => {
              if (job.reviewPackageId !== where?.reviewPackageId) {
                return false
              }
              const allowed = where?.status?.in
              if (allowed && !allowed.includes(job.status as AiWorkflowJobStatus)) {
                return false
              }
              const excludedJobKey = where?.jobKey?.not ?? where?.NOT?.jobKey
              if (excludedJobKey && job.jobKey === excludedJobKey) {
                return false
              }
              return true
            })
            return Promise.resolve(match ?? null)
          },
        ),
        upsert: jest.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) => {
          const existing = jobs.find((job) => job.jobKey === create.jobKey)
          if (existing) {
            return Promise.resolve({ id: existing.id, ...existing })
          }
          const created = { id: `job-${jobs.length + 1}`, ...create }
          jobs.push(created)
          return Promise.resolve(created)
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
    return { service, prisma, tx, tasks, conversations, jobs, packages }
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
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({ accepted: true }),
          completedAt: expect.any(Date),
        }),
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

  it('replays the same decisionCommandId after jobs have already confirmed the packages', async () => {
    const dto = {
      decisionCommandId: 'decision-1',
      items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
    }
    const { service, jobs, packages } = createService()

    const first = await service.acceptReviewConfirmation(organizationId, userId, dto)
    expect(first).toEqual({
      decisionCommandId: 'decision-1',
      accepted: true,
      items: [{ packageId: 'pkg-1', itemIdentity: 'item:0', status: 'accepted' }],
    })
    packages[0].status = AiReviewPackageStatus.confirmed

    await expect(service.acceptReviewConfirmation(organizationId, userId, dto)).resolves.toEqual(first)
    expect(jobs).toHaveLength(1)
  })

  it('rejects a second decisionCommandId while a confirm job is already in flight', async () => {
    const { service, jobs } = createService()
    await service.acceptReviewConfirmation(organizationId, userId, {
      decisionCommandId: 'decision-1',
      items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
    })

    await expect(
      service.acceptReviewConfirmation(organizationId, userId, {
        decisionCommandId: 'decision-2',
        items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(jobs).toHaveLength(1)
  })

  it('compares expectedPackageVersion against the package row after taking the task lock', async () => {
    const { service, tx, jobs } = createService()
    tx.aiReviewPackage.findFirst.mockResolvedValue({ ...pendingPackage, version: 2 })

    await expect(
      service.acceptReviewConfirmation(organizationId, userId, {
        decisionCommandId: 'decision-1',
        items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException)
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

  it('returns live confirmation item statuses from jobs rather than the frozen accept snapshot', async () => {
    const { service, prisma } = createService({
      batchRecord: {
        idempotencyKey: 'decision-1',
        operatorUserId: userId,
        resultJson: {
          decisionCommandId: 'decision-1',
          accepted: true,
          items: [{ packageId: 'pkg-1', itemIdentity: 'item:0', status: 'accepted' }],
        },
        completedAt: new Date(),
      },
    })
    prisma.aiCreateIdempotencyRecord.findUnique.mockResolvedValue({
      operatorUserId: userId,
      resultJson: {
        decisionCommandId: 'decision-1',
        accepted: true,
        items: [{ packageId: 'pkg-1', itemIdentity: 'item:0', status: 'accepted' }],
      },
    })
    prisma.aiWorkflowJob.findMany.mockResolvedValue([
      {
        reviewPackageId: 'pkg-1',
        status: AiWorkflowJobStatus.claimed,
        reviewPackage: pendingPackage,
        lastErrorCode: null,
      },
    ])

    await expect(
      service.getReviewConfirmation(organizationId, userId, 'decision-1'),
    ).resolves.toEqual({
      decisionCommandId: 'decision-1',
      accepted: true,
      items: [{ packageId: 'pkg-1', itemIdentity: 'item:0', status: 'running' }],
    })
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
