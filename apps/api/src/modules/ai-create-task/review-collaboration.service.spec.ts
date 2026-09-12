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

function sqlTextFromQueryRaw(query: unknown): string {
  if (typeof query === 'string') return query
  if (Array.isArray(query)) return query.map(String).join(' ')
  if (query && typeof query === 'object' && 'strings' in query) {
    const strings = (query as { strings: unknown }).strings
    if (Array.isArray(strings)) return strings.map(String).join(' ')
  }
  return String(query ?? '')
}

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
      aiInputBatch: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      aiReviewPackage: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(packages.map((pkg) => ({ ...pkg })))),
        findFirst: jest.fn().mockImplementation(
          ({ where }: { where?: { id?: string } }) => {
            const current = packages.find((pkg) => pkg.id === where?.id) ?? packages[0]
            return Promise.resolve(current ? { ...current } : null)
          },
        ),
        findFirstOrThrow: jest.fn().mockImplementation(
          ({ where }: { where?: { id?: string } }) => {
            const current = packages.find((pkg) => pkg.id === where?.id) ?? packages[0]
            return Promise.resolve(current)
          },
        ),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const created = {
            id: data.payloadSchema === 'resource.payable@v1' ? `pkg-payable-${packages.length}` : 'pkg-receivable',
            version: 1,
            ...data,
          }
          packages.push(created)
          return Promise.resolve(created)
        }),
        update: jest.fn().mockImplementation(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const current = packages.find((pkg) => pkg.id === where.id)
            const next = { ...current, ...data, version: ((current?.version as number) ?? 1) + 1 }
            return Promise.resolve(next)
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
      aiReviewRecord: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      agentTask: { findFirst: jest.fn() },
      departure: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'departure-1',
          updatedAt: new Date(pendingPackage.baseObjectVersion),
        }),
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'departure-1',
          updatedAt: new Date(pendingPackage.baseObjectVersion),
        }),
      },
      aiConversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conv-1', creatorUserId: userId }),
      },
      sourceOrder: {
        findFirst: jest.fn().mockResolvedValue({ id: 'source-order-1' }),
      },
      segmentResource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'res-1' }),
      },
      departureResource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dep-res-1' }),
      },
    }
    const prisma = {
      aiInputBatch: { findMany: jest.fn().mockResolvedValue([]) },
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
      aiReviewRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    const tasks = {
      confirmDepartureReviewPackage: jest.fn(),
      resolveOwnedReviewTaskId: jest.fn().mockResolvedValue('task-1'),
    }
    const conversations = {
      finalizeReviewDisposition: jest.fn().mockResolvedValue([]),
      publish: jest.fn(),
    }
    const segmentResources = {
      createInTx: jest.fn().mockResolvedValue({
        id: 'resource-1',
        segmentId: 'seg-1',
        payableStatus: 'not_generated',
        paymentScheduleId: null,
      }),
    }
    const departureResources = {
      createInTx: jest.fn().mockResolvedValue({
        id: 'dep-resource-1',
        departureId: 'departure-1',
        payableStatus: 'not_generated',
        paymentScheduleId: null,
      }),
    }
    const sourceOrders = {
      createWithSelectedGuests: jest.fn().mockResolvedValue({ id: 'source-order-1' }),
    }
    const auth = {
      getPermissionKeysForUser: jest.fn().mockResolvedValue(['departure:write', '/departure']),
    }
    const finance = {
      assertAllowsNewObligation: jest.fn(),
    }
    const generation = {
      previewInitialReceivables: jest.fn(),
      generateReceivableSchedules: jest.fn(),
      previewInitialPayable: jest.fn(),
      generateResourcePayable: jest.fn(),
    }
    const service = new ReviewCollaborationService(
      prisma as never,
      tasks as never,
      conversations as never,
      { getById: jest.fn().mockResolvedValue({ id: 'departure-1' }) } as never,
      segmentResources as never,
      departureResources as never,
      sourceOrders as never,
      auth as never,
      finance as never,
      generation as never,
    )
    return {
      service,
      prisma,
      tx,
      tasks,
      conversations,
      segmentResources,
      departureResources,
      sourceOrders,
      auth,
      finance,
      generation,
      jobs,
      packages,
    }
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

  it.each([false, true])('writes source order and guests after confirmation (human supplied empty choices: %s)', async (humanChoices) => {
    const sourcePackage = {
      ...pendingPackage,
      payloadSchema: 'source_order.create@v1',
      confirmationUnit: 'source_order_create',
      targetKind: 'departure',
      targetId: 'departure-1',
      candidates: [
        {
          fieldKey: 'partnerId',
          proposedValue: 'partner-1',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客户甲' }],
        },
        {
          fieldKey: 'adultGuestCount',
          proposedValue: 2,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '2成人' }],
        },
        {
          fieldKey: 'childGuestCount',
          proposedValue: 0,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '无儿童' }],
        },
        {
          fieldKey: 'adultUnitPriceCents',
          proposedValue: 100000,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '1000元' }],
        },
        {
          fieldKey: 'fareAdjustments',
          proposedValue: [],
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '无调整' }],
        },
        {
          fieldKey: 'discountType',
          proposedValue: 'none',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '无优惠' }],
        },
        {
          fieldKey: 'collectionMode',
          proposedValue: 'partner_settled',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客户结算' }],
        },
        {
          fieldKey: 'guests',
          proposedValue: [{ name: '王强', included: true }],
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '王强' }],
        },
      ],
      userCorrections: {},
    }
    if (humanChoices) {
      sourcePackage.candidates = sourcePackage.candidates.filter(
        (candidate) => !['fareAdjustments', 'discountType'].includes(candidate.fieldKey),
      )
      sourcePackage.userCorrections = { fareAdjustments: [], discountType: 'none' }
    }
    const { service, sourceOrders, prisma, tx } = createService({ packages: [sourcePackage] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: sourcePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        idempotencyKey: 'decision-1:pkg-1',
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(sourcePackage)

    await service.executeConfirmedItem('job-1')

    expect(sourceOrders.createWithSelectedGuests).toHaveBeenCalledWith(
      organizationId,
      'departure-1',
      expect.objectContaining({
        partnerId: 'partner-1',
        adultGuestCount: 2,
        childGuestCount: 0,
        collectionMode: 'partner_settled',
      }),
      [{ name: '王强' }],
      tx,
    )
    expect(tx.aiWorkflowJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: AiWorkflowJobStatus.succeeded }),
    })
    expect(tx.aiReviewRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submittedValues: expect.objectContaining({
          partnerId: 'partner-1',
          adultGuestCount: 2,
          childGuestCount: 0,
        }),
      }),
    })
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

  it('rejects independent confirm when the departure version no longer matches the package baseline', async () => {
    const sourcePackage = {
      ...pendingPackage,
      payloadSchema: 'source_order.create@v1',
      confirmationUnit: 'source_order_create',
      baseObjectVersion: 3,
      candidates: [
        {
          fieldKey: 'partnerId',
          proposedValue: 'partner-1',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客户甲' }],
        },
      ],
    }
    const { service, prisma, tx, sourceOrders } = createService({ packages: [sourcePackage] })
    tx.departure.findFirst.mockResolvedValue({
      id: 'departure-1',
      updatedAt: new Date(99),
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: sourcePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(sourcePackage)

    await service.executeConfirmedItem('job-1')

    expect(sourceOrders.createWithSelectedGuests).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: 'idem-item-1' },
      data: expect.objectContaining({
        resultJson: expect.objectContaining({ status: 'conflict' }),
      }),
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

  it('keeps the source-order resultRef when re-entering a confirmed source-order item', async () => {
    const sourcePackage = {
      ...pendingPackage,
      status: AiReviewPackageStatus.confirmed,
      payloadSchema: 'source_order.create@v1',
      confirmationUnit: 'source_order_create',
    }
    const { service, prisma, tx, sourceOrders } = createService({ packages: [sourcePackage] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: sourcePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
        resultJson: {
          status: 'succeeded',
          packageId: 'pkg-1',
          resultRef: { objectKind: 'source_order', objectId: 'source-order-1' },
        },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(sourceOrders.createWithSelectedGuests).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: 'idem-item-1' },
      data: expect.objectContaining({
        resultJson: expect.objectContaining({
          resultRef: { objectKind: 'source_order', objectId: 'source-order-1' },
        }),
      }),
    })
  })

  it.each([
    ['departure.segment_resource@v1', 'segment_resource'],
    ['departure.departure_resource@v1', 'departure_resource'],
    ['source_order.create@v1', 'source_order'],
  ])('does not invent a result for a confirmed %s package with no receipt', async (payloadSchema) => {
    const pkg = { ...pendingPackage, payloadSchema, status: AiReviewPackageStatus.confirmed }
    const { service, prisma, tx, segmentResources, departureResources, sourceOrders } = createService({ packages: [pkg] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1', type: AiWorkflowJobType.review_confirm, organizationId, reviewPackage: pkg,
      idempotencyRecord: { operatorUserId: userId, resultJson: {} },
      idempotencyRecordId: 'idem-item-1',
    })
    await service.executeConfirmedItem('job-1')
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultJson: expect.objectContaining({
        status: 'failed', retryable: false,
        reason: '审核已确认，但正式记录引用缺失，请核对审核记录，勿重复创建',
      }) }),
    }))
    expect(segmentResources.createInTx).not.toHaveBeenCalled()
    expect(departureResources.createInTx).not.toHaveBeenCalled()
    expect(sourceOrders.createWithSelectedGuests).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
  })

  it('recovers a confirmed resource reference from its successful review record', async () => {
    const pkg = { ...pendingPackage, payloadSchema: 'departure.segment_resource@v1', status: AiReviewPackageStatus.confirmed }
    const { service, prisma, tx } = createService({ packages: [pkg] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1', type: AiWorkflowJobType.review_confirm, organizationId, reviewPackage: pkg,
      idempotencyRecord: { operatorUserId: userId, resultJson: {} }, idempotencyRecordId: 'idem-item-1',
    })
    prisma.aiReviewRecord.findFirst.mockResolvedValue({ afterSnapshot: { objectKind: 'segment_resource', objectId: 'res-1' } })
    await service.executeConfirmedItem('job-1')
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultJson: expect.objectContaining({
        status: 'succeeded', resultRef: { objectKind: 'segment_resource', objectId: 'res-1' },
      }) }),
    }))
  })

  it('rejects confirmation of unresolved human correction conflicts', async () => {
    const { service, tx } = createService({ packages: [{ ...pendingPackage,
      baselineSnapshot: { reviewConflicts: [{ fieldKey: 'amountCents', proposedValue: 26000, userCorrectedValue: 22000 }] },
    }] })
    await expect(service.acceptReviewConfirmation(organizationId, userId, {
      decisionCommandId: 'conflict-confirm', items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
    })).rejects.toThrow('尚未处理的差异')
    expect(tx.aiWorkflowJob.upsert).not.toHaveBeenCalled()
  })

  it('rechecks revision safety when an accepted confirmation executes', async () => {
    const { service, prisma, tx } = createService()
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1', type: AiWorkflowJobType.review_confirm, organizationId,
      reviewPackage: pendingPackage,
      idempotencyRecord: { operatorUserId: userId, requestSnapshot: { expectedPackageVersion: 1 } },
      idempotencyRecordId: 'idem-1',
    })
    tx.aiInputBatch.findFirst.mockResolvedValue({ id: 'revision-batch' })
    await service.executeConfirmedItem('job-1')
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultJson: expect.objectContaining({ status: 'conflict', reason: expect.stringContaining('助手正在核对') }) }),
    }))
  })

  it('blocks only the referenced pending item while its revision is processing', async () => {
    const { service, tx } = createService()
    tx.aiInputBatch.findFirst.mockResolvedValue({ id: 'revision-batch' })
    await expect(service.acceptReviewConfirmation(organizationId, userId, {
      decisionCommandId: 'revision-confirm', items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
    })).rejects.toThrow('助手正在核对该事项')
    expect(tx.aiWorkflowJob.upsert).not.toHaveBeenCalled()
    expect(tx.aiInputBatch.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      organizationId, conversationId: 'conv-1',
      userMessageEvent: { payload: { path: ['reviewPackageId'], equals: 'pkg-1' } },
      status: { in: ['waiting_for_materials', 'ready_for_agent', 'preparing_context', 'agent_running', 'awaiting_user_input'] },
    }) }))
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
    prisma.aiInputBatch.findMany.mockResolvedValue([{ userMessageEvent: { payload: { reviewPackageId: 'pkg-1' } } }])

    const view = await service.listDepartureCollaboration(
      organizationId,
      userId,
      'departure-1',
      'conv-1',
    )

    expect(view.items[0].confirmationBlockedReason).toContain('助手正在核对')
    expect(view.items[1].confirmationBlockedReason).toBeUndefined()
    expect(view.departureId).toBe('departure-1')
    expect(view.conversations).toEqual([
      { id: 'conv-1', title: '发团协作', lastActivityAt: '2026-09-07T00:00:00.000Z' },
    ])
    expect(view.items.map((item: { id: string; status: string }) => ({ id: item.id, status: item.status }))).toEqual([
      { id: 'pkg-1', status: 'pending' },
      { id: 'pkg-done', status: 'confirmed' },
    ])
  })

  it('omits a creation conversation that only inherited this departure page locator', async () => {
    const { service, prisma } = createService()
    prisma.conversationDepartureLink.findMany.mockResolvedValue([
      {
        conversationId: 'conv-collab',
        conversation: {
          id: 'conv-collab',
          title: '从这个截图中取一下客源信息',
          lastActivityAt: new Date('2026-09-09T14:16:49.000Z'),
        },
      },
      {
        conversationId: 'conv-create',
        conversation: {
          id: 'conv-create',
          title: '张姐给推了一个团，9月20号出发',
          lastActivityAt: new Date('2026-09-10T01:04:29.000Z'),
        },
      },
    ])
    prisma.aiReviewPackage.findMany.mockResolvedValue([
      {
        ...pendingPackage,
        id: 'pkg-create-draft',
        conversationId: 'conv-create',
        payloadSchema: 'departure.basic_info_draft@v1',
        confirmationUnit: 'basic_info_draft',
        targetKind: 'departure_creation_draft',
        targetId: 'draft-1',
        status: AiReviewPackageStatus.confirmed,
        candidates: [],
        baselineSnapshot: {},
      },
    ])
    prisma.aiWorkflowJob.findMany.mockResolvedValue([])

    const view = await service.listDepartureCollaboration(
      organizationId,
      userId,
      'departure-1',
    )

    expect(view.conversations).toEqual([
      {
        id: 'conv-collab',
        title: '从这个截图中取一下客源信息',
        lastActivityAt: '2026-09-09T14:16:49.000Z',
      },
    ])
    expect(view.items).toEqual([])
  })

  it('keeps a conversation that also produced review items for this departure', async () => {
    const { service, prisma } = createService()
    prisma.conversationDepartureLink.findMany.mockResolvedValue([
      {
        conversationId: 'conv-mixed',
        conversation: {
          id: 'conv-mixed',
          title: '本团客源和另开新团',
          lastActivityAt: new Date('2026-09-10T02:00:00.000Z'),
        },
      },
    ])
    prisma.aiReviewPackage.findMany.mockResolvedValue([
      {
        ...pendingPackage,
        id: 'pkg-here',
        conversationId: 'conv-mixed',
        targetKind: 'departure',
        targetId: 'departure-1',
        payloadSchema: 'source_order.create@v1',
        confirmationUnit: 'source_order',
        candidates: [],
        baselineSnapshot: {},
      },
      {
        ...pendingPackage,
        id: 'pkg-create-draft',
        conversationId: 'conv-mixed',
        payloadSchema: 'departure.basic_info_draft@v1',
        confirmationUnit: 'basic_info_draft',
        targetKind: 'departure_creation_draft',
        targetId: 'draft-1',
        status: AiReviewPackageStatus.confirmed,
        candidates: [],
        baselineSnapshot: {},
      },
    ])
    prisma.aiWorkflowJob.findMany.mockResolvedValue([])

    const view = await service.listDepartureCollaboration(
      organizationId,
      userId,
      'departure-1',
    )

    expect(view.conversations.map((entry: { id: string }) => entry.id)).toEqual(['conv-mixed'])
    expect(view.items.map((item: { id: string }) => item.id)).toEqual(['pkg-here'])
  })

  it('writes a confirmed segment resource without generating payable', async () => {
    const pkg = {
      ...pendingPackage,
      payloadSchema: 'departure.segment_resource@v1',
      confirmationUnit: 'segment_resource',
      candidates: [
        { fieldKey: 'itinerarySegmentId', proposedValue: 'seg-1' },
        { fieldKey: 'resourceKind', proposedValue: 'hotel' },
        { fieldKey: 'supplierId', proposedValue: 'sup-1' },
        { fieldKey: 'title', proposedValue: '希尔顿' },
        { fieldKey: 'amountCents', proposedValue: 128_000 },
        { fieldKey: 'notes', proposedValue: '含早' },
        { fieldKey: 'capacityWarning', proposedValue: '该晚库存偏紧，仅作提醒' },
      ],
    }
    const { service, prisma, tx, segmentResources } = createService({ packages: [pkg] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: pkg,
      idempotencyRecord: {
        operatorUserId: userId,
        idempotencyKey: 'decision-1:pkg-1',
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(segmentResources.createInTx).toHaveBeenCalledWith(
      tx,
      organizationId,
      'seg-1',
      expect.objectContaining({
        resourceKind: 'hotel',
        supplierId: 'sup-1',
        title: '希尔顿',
        amountCents: 128_000,
        notes: '含早',
      }),
      { expectedDepartureId: 'departure-1' },
    )
    expect(segmentResources.createInTx.mock.calls[0][3]).not.toHaveProperty('quantity')
    expect(segmentResources.createInTx.mock.calls[0][3]).not.toHaveProperty('unitPriceCents')
    expect(tx.aiReviewPackage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'pkg-1',
        status: AiReviewPackageStatus.pending,
        version: 1,
      },
      data: expect.objectContaining({ status: AiReviewPackageStatus.confirmed }),
    })
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'idem-item-1' },
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'succeeded',
            resultRef: { objectKind: 'segment_resource', objectId: 'resource-1' },
          }),
        }),
      }),
    )
  })

  it('keeps a segment resource package pending when itinerary segment is missing', async () => {
    const pkg = {
      ...pendingPackage,
      payloadSchema: 'departure.segment_resource@v1',
      confirmationUnit: 'segment_resource',
      candidates: [
        { fieldKey: 'resourceKind', proposedValue: 'hotel' },
        { fieldKey: 'supplierId', proposedValue: 'sup-1' },
        { fieldKey: 'title', proposedValue: '希尔顿' },
        { fieldKey: 'amountCents', proposedValue: 128_000 },
      ],
    }
    const { service, prisma, tx, segmentResources } = createService({ packages: [pkg] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: pkg,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(segmentResources.createInTx).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'conflict',
            reason: '材料未确定对应行程段，请核实归属，不能凭当前页面日期默认挂靠',
          }),
        }),
      }),
    )
  })

  it('replays an already confirmed segment resource without creating a second row', async () => {
    const pkg = {
      ...pendingPackage,
      payloadSchema: 'departure.segment_resource@v1',
      confirmationUnit: 'segment_resource',
      status: AiReviewPackageStatus.confirmed,
      candidates: [
        { fieldKey: 'itinerarySegmentId', proposedValue: 'seg-1' },
        { fieldKey: 'resourceKind', proposedValue: 'hotel' },
        { fieldKey: 'supplierId', proposedValue: 'sup-1' },
        { fieldKey: 'title', proposedValue: '希尔顿' },
        { fieldKey: 'amountCents', proposedValue: 128_000 },
      ],
    }
    const { service, prisma, tx, segmentResources } = createService({ packages: [pkg] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: pkg,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
        resultJson: { resultRef: { objectKind: 'segment_resource', objectId: 'resource-1' } },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(segmentResources.createInTx).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'succeeded',
            resultRef: { objectKind: 'segment_resource', objectId: 'resource-1' },
          }),
        }),
      }),
    )
  })

  it('writes a confirmed departure-level resource without generating payable', async () => {
    const pkg = {
      ...pendingPackage,
      payloadSchema: 'departure.departure_resource@v1',
      confirmationUnit: 'departure_resource',
      candidates: [
        { fieldKey: 'resourceKind', proposedValue: 'insurance' },
        { fieldKey: 'supplierId', proposedValue: 'sup-1' },
        { fieldKey: 'title', proposedValue: '全程旅行保险' },
        { fieldKey: 'amountCents', proposedValue: 120_000 },
        { fieldKey: 'notes', proposedValue: '覆盖 4月2日至4月6日' },
      ],
    }
    const { service, prisma, tx, departureResources, segmentResources } = createService({ packages: [pkg] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: pkg,
      idempotencyRecord: {
        operatorUserId: userId,
        idempotencyKey: 'decision-1:pkg-1',
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(departureResources.createInTx).toHaveBeenCalledWith(
      tx,
      organizationId,
      'departure-1',
      expect.objectContaining({
        resourceKind: 'insurance',
        supplierId: 'sup-1',
        title: '全程旅行保险',
        amountCents: 120_000,
        notes: '覆盖 4月2日至4月6日',
      }),
    )
    expect(departureResources.createInTx.mock.calls[0][3]).not.toHaveProperty('quantity')
    expect(departureResources.createInTx.mock.calls[0][3]).not.toHaveProperty('unitPriceCents')
    expect(segmentResources.createInTx).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'pkg-1',
        status: AiReviewPackageStatus.pending,
        version: 1,
      },
      data: expect.objectContaining({ status: AiReviewPackageStatus.confirmed }),
    })
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'idem-item-1' },
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'succeeded',
            resultRef: { objectKind: 'departure_resource', objectId: 'dep-resource-1' },
          }),
        }),
      }),
    )
  })

  it('keeps a departure resource package pending when amount is missing', async () => {
    const pkg = {
      ...pendingPackage,
      payloadSchema: 'departure.departure_resource@v1',
      confirmationUnit: 'departure_resource',
      candidates: [
        { fieldKey: 'resourceKind', proposedValue: 'guide' },
        { fieldKey: 'supplierId', proposedValue: 'sup-1' },
        { fieldKey: 'title', proposedValue: '全程导游' },
      ],
    }
    const { service, prisma, tx, departureResources } = createService({ packages: [pkg] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: pkg,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(departureResources.createInTx).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'conflict',
            reason: '发团级资源审核稿仍有待补充字段',
          }),
        }),
      }),
    )
  })

  it('replays an already confirmed departure resource without creating a second row', async () => {
    const pkg = {
      ...pendingPackage,
      payloadSchema: 'departure.departure_resource@v1',
      confirmationUnit: 'departure_resource',
      status: AiReviewPackageStatus.confirmed,
      candidates: [
        { fieldKey: 'resourceKind', proposedValue: 'insurance' },
        { fieldKey: 'supplierId', proposedValue: 'sup-1' },
        { fieldKey: 'title', proposedValue: '全程旅行保险' },
        { fieldKey: 'amountCents', proposedValue: 120_000 },
      ],
    }
    const { service, prisma, tx, departureResources } = createService({ packages: [pkg] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: pkg,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
        resultJson: { resultRef: { objectKind: 'departure_resource', objectId: 'dep-resource-1' } },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(departureResources.createInTx).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'succeeded',
            resultRef: { objectKind: 'departure_resource', objectId: 'dep-resource-1' },
          }),
        }),
      }),
    )
  })

  it('does not generate receivables when confirming a source order', async () => {
    const sourcePackage = {
      ...pendingPackage,
      payloadSchema: 'source_order.create@v1',
      confirmationUnit: 'source_order_create',
      candidates: [
        {
          fieldKey: 'partnerId',
          proposedValue: 'partner-1',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客户甲' }],
        },
        {
          fieldKey: 'adultGuestCount',
          proposedValue: 2,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '2成人' }],
        },
        {
          fieldKey: 'childGuestCount',
          proposedValue: 0,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '无儿童' }],
        },
        {
          fieldKey: 'adultUnitPriceCents',
          proposedValue: 100000,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '单价1000' }],
        },
        {
          fieldKey: 'fareAdjustments',
          proposedValue: [],
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '无调整' }],
        },
        {
          fieldKey: 'discountType',
          proposedValue: 'none',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '无优惠' }],
        },
        {
          fieldKey: 'collectionMode',
          proposedValue: 'partner_settled',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客户结算' }],
        },
      ],
    }
    const { service, prisma, generation, sourceOrders } = createService({ packages: [sourcePackage] })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: sourcePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        idempotencyKey: 'decision-1:pkg-1',
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })

    await service.executeConfirmedItem('job-1')

    expect(sourceOrders.createWithSelectedGuests).toHaveBeenCalled()
    expect(generation.generateReceivableSchedules).not.toHaveBeenCalled()
  })

  it('writes all applicable receivable paths in the confirm transaction without recreating the source order', async () => {
    const receivablePackage = {
      ...pendingPackage,
      id: 'pkg-receivable',
      payloadSchema: 'source_order.receivable@v1',
      confirmationUnit: 'source_order_receivable',
      candidates: [
        {
          fieldKey: 'sourceOrderId',
          proposedValue: 'source-order-1',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
        {
          fieldKey: 'displayName',
          proposedValue: '华东旅行社客源',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
        {
          fieldKey: 'partnerName',
          proposedValue: '华东旅行社',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
        {
          fieldKey: 'collectionMode',
          proposedValue: 'split',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
        {
          fieldKey: 'netReceivableCents',
          proposedValue: 6_100_000,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
        {
          fieldKey: 'paths',
          proposedValue: [
            {
              sourceType: 'source_order_guest_balance_collection',
              title: '尾款代收',
              amountCents: 4_100_000,
              counterpartyType: 'guest',
              counterpartyName: '华东旅行社客源',
            },
            {
              sourceType: 'source_order_customer_settlement',
              title: '客户补款',
              amountCents: 2_000_000,
              counterpartyType: 'partner',
              counterpartyName: '华东旅行社',
            },
          ],
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
        {
          fieldKey: 'historyMessage',
          proposedValue: '以下为约定应收，确认后整单提交；不是到账或流水。',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
      ],
      baselineSnapshot: {
        sourceOrderId: 'source-order-1',
        collectionMode: 'split',
        depositCents: 2_000_000,
        balanceCents: 4_100_000,
        netReceivableCents: 6_100_000,
        partnerId: 'partner-1',
      },
    }
    const { service, prisma, tx, sourceOrders, generation } = createService({
      packages: [receivablePackage],
    })
    generation.previewInitialReceivables.mockResolvedValue({
      order: {
        id: 'source-order-1',
        collectionMode: 'split',
        depositCents: 2_000_000,
        balanceCents: 4_100_000,
        netReceivableCents: 6_100_000,
        partnerId: 'partner-1',
        displayName: '华东旅行社客源',
        partner: { name: '华东旅行社' },
      },
      expectedPaths: [],
      classification: { status: 'ready', paths: [] },
    })
    generation.generateReceivableSchedules.mockResolvedValue({
      order: { id: 'source-order-1' },
      schedules: [{ id: 'sch-1' }, { id: 'sch-2' }],
      generation: 'created',
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: receivablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        idempotencyKey: 'decision-1:pkg-receivable',
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(receivablePackage)

    await service.executeConfirmedItem('job-1')

    expect(sourceOrders.createWithSelectedGuests).not.toHaveBeenCalled()
    const sourceOrderLockSqls = tx.$queryRaw.mock.calls
      .map((call: unknown[]) => sqlTextFromQueryRaw(call[0]))
      .filter((sql: string) => /source_orders/i.test(sql) && /FOR UPDATE/i.test(sql))
    expect(sourceOrderLockSqls.length).toBeGreaterThan(0)
    const lockCallOrder = tx.$queryRaw.mock.invocationCallOrder.find(
      (_order: number, index: number) => {
        const sql = sqlTextFromQueryRaw(tx.$queryRaw.mock.calls[index]?.[0])
        return /source_orders/i.test(sql) && /FOR UPDATE/i.test(sql)
      },
    )
    expect(lockCallOrder).toBeDefined()
    expect(lockCallOrder).toBeLessThan(
      generation.previewInitialReceivables.mock.invocationCallOrder[0],
    )
    expect(generation.generateReceivableSchedules).toHaveBeenCalledWith(
      organizationId,
      'source-order-1',
      expect.any(Function),
      expect.objectContaining({ strategy: 'initial_only', client: tx }),
    )
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'succeeded',
            resultRef: expect.objectContaining({
              objectKind: 'source_order_receivables',
              objectId: 'source-order-1',
              scheduleIds: ['sch-1', 'sch-2'],
            }),
          }),
        }),
      }),
    )
  })

  it('lets a /departure caller accept receivable confirm but not source-order create', async () => {
    const receivablePackage = {
      ...pendingPackage,
      id: 'pkg-receivable',
      payloadSchema: 'source_order.receivable@v1',
    }
    const sourcePackage = {
      ...pendingPackage,
      payloadSchema: 'source_order.create@v1',
    }
    const receivableService = createService({ packages: [receivablePackage] })
    receivableService.auth.getPermissionKeysForUser.mockResolvedValue(['/departure'])
    await expect(
      receivableService.service.acceptReviewConfirmation(organizationId, userId, {
        decisionCommandId: 'decision-recv',
        items: [{ packageId: 'pkg-receivable', expectedPackageVersion: 1 }],
      }),
    ).resolves.toMatchObject({ accepted: true })

    const sourceService = createService({ packages: [sourcePackage] })
    sourceService.auth.getPermissionKeysForUser.mockResolvedValue(['/departure'])
    await expect(
      sourceService.service.acceptReviewConfirmation(organizationId, userId, {
        decisionCommandId: 'decision-source',
        items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
      }),
    ).rejects.toThrow('无权确认该事项')
  })

  it('prepares a receivable review only from a successful source-order result', async () => {
    const { service, tx } = createService()
    await expect(
      service.prepareSourceOrderReceivableReview(organizationId, userId, 'departure-1', {
        sourceOrderId: 'source-order-1',
        conversationId: 'conv-1',
      }),
    ).rejects.toThrow('只能从本次成功创建的客源继续提交应收')

    tx.aiReviewRecord.findMany.mockResolvedValue([
      {
        afterSnapshot: { objectKind: 'source_order', objectId: 'source-order-1' },
        package: {
          ...pendingPackage,
          payloadSchema: 'source_order.create@v1',
          status: AiReviewPackageStatus.confirmed,
        },
      },
    ])
    const ready = createService()
    ready.tx.aiReviewRecord.findMany.mockResolvedValue([
      {
        afterSnapshot: { objectKind: 'source_order', objectId: 'source-order-1' },
        package: {
          ...pendingPackage,
          payloadSchema: 'source_order.create@v1',
          status: AiReviewPackageStatus.confirmed,
        },
      },
    ])
    ready.generation.previewInitialReceivables.mockResolvedValue({
      order: {
        id: 'source-order-1',
        displayName: '华东旅行社客源',
        partner: { name: '华东旅行社' },
        collectionMode: 'partner_settled',
        netReceivableCents: 6_100_000,
        depositCents: 0,
        balanceCents: 0,
        partnerId: 'partner-1',
      },
      expectedPaths: [
        {
          sourceType: 'source_order_customer_settlement',
          title: '客户补款',
          amountCents: 6_100_000,
          counterpartyType: 'partner',
          counterpartyName: '华东旅行社',
        },
      ],
      classification: {
        status: 'ready',
        paths: [
          {
            sourceType: 'source_order_customer_settlement',
            title: '客户补款',
            amountCents: 6_100_000,
            counterpartyType: 'partner',
            counterpartyName: '华东旅行社',
          },
        ],
      },
    })

    const view = await ready.service.prepareSourceOrderReceivableReview(
      organizationId,
      userId,
      'departure-1',
      { sourceOrderId: 'source-order-1', conversationId: 'conv-1' },
    )
    expect(view.payloadSchema).toBe('source_order.receivable@v1')
    expect(view.candidates.some((candidate) => candidate.fieldKey === 'paths')).toBe(true)
    expect(ready.generation.generateReceivableSchedules).not.toHaveBeenCalled()
  })

  it('refuses confirm when live convention diverges from the review baseline', async () => {
    const receivablePackage = {
      ...pendingPackage,
      id: 'pkg-receivable',
      payloadSchema: 'source_order.receivable@v1',
      confirmationUnit: 'source_order_receivable',
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
      ],
      baselineSnapshot: {
        sourceOrderId: 'source-order-1',
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 1_000_000,
        partnerId: 'partner-1',
      },
    }
    const { service, prisma, tx, generation } = createService({ packages: [receivablePackage] })
    generation.previewInitialReceivables.mockResolvedValue({
      order: {
        id: 'source-order-1',
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 2_000_000,
        partnerId: 'partner-1',
      },
      classification: { status: 'ready', paths: [] },
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: receivablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(receivablePackage)

    await service.executeConfirmedItem('job-1')

    expect(generation.generateReceivableSchedules).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'conflict',
            reason: '正式来源或已有账款已变化，请刷新后重试',
          }),
        }),
      }),
    )
  })

  it('refuses F2 anomaly confirm without creating or backfilling receivables', async () => {
    const receivablePackage = {
      ...pendingPackage,
      id: 'pkg-receivable',
      payloadSchema: 'source_order.receivable@v1',
      confirmationUnit: 'source_order_receivable',
      candidates: [
        {
          fieldKey: 'sourceOrderId',
          proposedValue: 'source-order-1',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
        {
          fieldKey: 'historyStatus',
          proposedValue: 'anomaly',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
      ],
      baselineSnapshot: {
        sourceOrderId: 'source-order-1',
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 6_100_000,
        partnerId: 'partner-1',
      },
    }
    const { service, prisma, tx, generation } = createService({ packages: [receivablePackage] })
    generation.previewInitialReceivables.mockResolvedValue({
      order: {
        id: 'source-order-1',
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 6_100_000,
        partnerId: 'partner-1',
      },
      classification: {
        status: 'anomaly',
        reason: 'incomplete',
        message: '已有应收不完整，请到普通业务入口处理，系统不会自动补建。',
      },
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: receivablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(receivablePackage)

    await service.executeConfirmedItem('job-1')

    expect(generation.generateReceivableSchedules).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'conflict',
            reason: expect.stringContaining('不会自动补建'),
          }),
        }),
      }),
    )
  })

  it.each([
    ['settled', '发团已结清，不可提交应收'],
    ['closed', '发团已关闭，不可提交应收'],
  ] as const)(
    'refuses receivable confirm when the departure is %s',
    async (status, reason) => {
    const receivablePackage = {
      ...pendingPackage,
      id: 'pkg-receivable',
      payloadSchema: 'source_order.receivable@v1',
      confirmationUnit: 'source_order_receivable',
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
      ],
      baselineSnapshot: {
        sourceOrderId: 'source-order-1',
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 1_000_000,
        partnerId: 'partner-1',
      },
    }
    const { service, prisma, tx, generation, finance } = createService({
      packages: [receivablePackage],
    })
    finance.assertAllowsNewObligation.mockImplementation(
      (departure: { status: string }, action = '创建收付款节点') => {
        if (departure.status === 'settled') {
          throw new ConflictException(`发团已结清，不可${action}`)
        }
        if (departure.status === 'closed') {
          throw new ConflictException(`发团已关闭，不可${action}`)
        }
      },
    )
    tx.departure.findFirst.mockResolvedValue({
      id: 'departure-1',
      updatedAt: new Date(pendingPackage.baseObjectVersion),
      status,
    })
    generation.previewInitialReceivables.mockResolvedValue({
      order: {
        id: 'source-order-1',
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 1_000_000,
        partnerId: 'partner-1',
      },
      classification: { status: 'ready', paths: [] },
    })
    generation.generateReceivableSchedules.mockResolvedValue({
      order: { id: 'source-order-1' },
      schedules: [{ id: 'sch-1' }],
      generation: 'created',
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: receivablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(receivablePackage)

    await service.executeConfirmedItem('job-1')

    expect(generation.generateReceivableSchedules).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'conflict',
            reason,
          }),
        }),
      }),
    )
    },
  )

  it('allows receivable confirm when only unrelated departure fields changed', async () => {
    const receivablePackage = {
      ...pendingPackage,
      id: 'pkg-receivable',
      payloadSchema: 'source_order.receivable@v1',
      confirmationUnit: 'source_order_receivable',
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式客源单当前收款约定' }],
        },
      ],
      baselineSnapshot: {
        sourceOrderId: 'source-order-1',
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 1_000_000,
        partnerId: 'partner-1',
      },
    }
    const { service, prisma, tx, generation, finance } = createService({ packages: [receivablePackage] })
    tx.departure.findFirst.mockResolvedValue({
      id: 'departure-1',
      updatedAt: new Date(99),
      status: 'pending_settlement',
    })
    generation.previewInitialReceivables.mockResolvedValue({
      order: {
        id: 'source-order-1',
        collectionMode: 'partner_settled',
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: 1_000_000,
        partnerId: 'partner-1',
      },
      classification: { status: 'ready', paths: [] },
    })
    generation.generateReceivableSchedules.mockResolvedValue({
      order: { id: 'source-order-1' },
      schedules: [{ id: 'sch-1' }],
      generation: 'created',
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: receivablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(receivablePackage)

    await service.executeConfirmedItem('job-1')

    expect(generation.generateReceivableSchedules).toHaveBeenCalled()
    expect(finance.assertAllowsNewObligation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending_settlement' }),
      '提交应收',
    )
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({ status: 'succeeded' }),
        }),
      }),
    )
  })

  it('rejects receivable confirm when the caller has departure:write but not /departure', async () => {
    const receivablePackage = {
      ...pendingPackage,
      id: 'pkg-receivable',
      payloadSchema: 'source_order.receivable@v1',
    }
    const { service, auth } = createService({ packages: [receivablePackage] })
    auth.getPermissionKeysForUser.mockResolvedValue(['departure:write'])
    await expect(
      service.acceptReviewConfirmation(organizationId, userId, {
        decisionCommandId: 'decision-write-only',
        items: [{ packageId: 'pkg-receivable', expectedPackageVersion: 1 }],
      }),
    ).rejects.toThrow('无权确认该事项')
  })

  it('prepares payable reviews only from this conversation’s successful resource results', async () => {
    const { service } = createService()
    await expect(
      service.prepareResourcePayableReviews(organizationId, userId, 'departure-1', {
        conversationId: 'conv-1',
        items: [{ sourceType: 'segment_resource', sourceId: 'res-1' }],
      }),
    ).rejects.toThrow('只能从本次成功录入且尚未提交的资源继续提交应付')
  })

  it('prepares selected successful resources without calling the segment batch entry', async () => {
    const ready = createService()
    ready.tx.aiReviewRecord.findMany.mockResolvedValue([
      {
        afterSnapshot: { objectKind: 'segment_resource', objectId: 'res-1' },
        package: {
          ...pendingPackage,
          payloadSchema: 'departure.segment_resource@v1',
          status: AiReviewPackageStatus.confirmed,
        },
      },
      {
        afterSnapshot: { objectKind: 'departure_resource', objectId: 'dep-res-1' },
        package: {
          ...pendingPackage,
          payloadSchema: 'departure.departure_resource@v1',
          status: AiReviewPackageStatus.confirmed,
        },
      },
    ])
    ready.generation.previewInitialPayable.mockImplementation(
      async (_org: string, params: { sourceId: string; sourceType: string }) => ({
        resourceKind: params.sourceType === 'segment_resource' ? 'segment' : 'departure',
        resource: {
          resourceKind: 'hotel',
          supplierId: 'sup-1',
          partnerId: null,
          segment: {
            departure: {
              id: 'departure-1',
              endDate: new Date('2026-04-08T00:00:00.000Z'),
            },
          },
          departure: {
            id: 'departure-1',
            endDate: new Date('2026-04-08T00:00:00.000Z'),
          },
        },
        spec: {
          title: params.sourceId === 'res-1' ? '4月2日住宿' : '全程包车',
          amountCents: params.sourceId === 'res-1' ? 880_000 : 2_400_000,
          counterpartyName: '关西酒店',
        },
        classification: {
          status: 'ready',
          amountCents: params.sourceId === 'res-1' ? 880_000 : 2_400_000,
        },
      }),
    )

    const views = await ready.service.prepareResourcePayableReviews(
      organizationId,
      userId,
      'departure-1',
      {
        conversationId: 'conv-1',
        items: [
          { sourceType: 'segment_resource', sourceId: 'res-1' },
          { sourceType: 'departure_resource', sourceId: 'dep-res-1' },
        ],
      },
    )
    expect(views).toHaveLength(2)
    expect(views.every((view) => view.payloadSchema === 'resource.payable@v1')).toBe(true)
    expect(ready.generation.generateResourcePayable).not.toHaveBeenCalled()
  })

  it('writes the selected payable in the confirm transaction without recreating the resource', async () => {
    const payablePackage = {
      ...pendingPackage,
      id: 'pkg-payable',
      payloadSchema: 'resource.payable@v1',
      confirmationUnit: 'resource_payable',
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
        },
      ],
      baselineSnapshot: {
        sourceType: 'segment_resource',
        sourceId: 'res-1',
        amountCents: 880_000,
        supplierId: 'sup-1',
        partnerId: null,
        resourceKind: 'hotel',
        title: '4月2日住宿',
        endDate: '2026-04-08',
      },
    }
    const { service, prisma, tx, segmentResources, generation } = createService({
      packages: [payablePackage],
    })
    generation.previewInitialPayable.mockResolvedValue({
      resourceKind: 'segment',
      resource: {
        resourceKind: 'hotel',
        supplierId: 'sup-1',
        partnerId: null,
        segment: {
          departure: {
            id: 'departure-1',
            endDate: new Date('2026-04-08T00:00:00.000Z'),
          },
        },
      },
      spec: { title: '4月2日住宿', amountCents: 880_000, counterpartyName: '关西酒店' },
      classification: { status: 'ready', amountCents: 880_000 },
    })
    generation.generateResourcePayable.mockResolvedValue({
      schedule: { id: 'sch-1' },
      generation: 'created',
      resourceKind: 'segment',
      resource: { id: 'res-1' },
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: payablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        idempotencyKey: 'decision-1:pkg-payable',
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(payablePackage)

    await service.executeConfirmedItem('job-1')

    expect(segmentResources.createInTx).not.toHaveBeenCalled()
    expect(generation.generateResourcePayable).toHaveBeenCalledWith(
      organizationId,
      { sourceType: 'segment_resource', sourceId: 'res-1' },
      expect.any(Function),
      expect.objectContaining({ strategy: 'initial_only', client: tx }),
    )
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'succeeded',
            resultRef: expect.objectContaining({
              objectKind: 'resource_payable',
              objectId: 'res-1',
              scheduleIds: ['sch-1'],
              generation: 'created',
            }),
          }),
        }),
      }),
    )
  })

  it('lets a /departure caller accept payable confirm but not resource create', async () => {
    const payablePackage = {
      ...pendingPackage,
      id: 'pkg-payable',
      payloadSchema: 'resource.payable@v1',
    }
    const resourcePackage = {
      ...pendingPackage,
      payloadSchema: 'departure.segment_resource@v1',
    }
    const payableService = createService({ packages: [payablePackage] })
    payableService.auth.getPermissionKeysForUser.mockResolvedValue(['/departure'])
    await expect(
      payableService.service.acceptReviewConfirmation(organizationId, userId, {
        decisionCommandId: 'decision-pay',
        items: [{ packageId: 'pkg-payable', expectedPackageVersion: 1 }],
      }),
    ).resolves.toMatchObject({ accepted: true })

    const resourceService = createService({ packages: [resourcePackage] })
    resourceService.auth.getPermissionKeysForUser.mockResolvedValue(['/departure'])
    await expect(
      resourceService.service.acceptReviewConfirmation(organizationId, userId, {
        decisionCommandId: 'decision-resource',
        items: [{ packageId: 'pkg-1', expectedPackageVersion: 1 }],
      }),
    ).rejects.toThrow('无权确认该事项')
  })

  it('locks the resource before payable preview on confirm', async () => {
    const payablePackage = {
      ...pendingPackage,
      id: 'pkg-payable',
      payloadSchema: 'resource.payable@v1',
      confirmationUnit: 'resource_payable',
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
        },
      ],
      baselineSnapshot: {
        sourceType: 'segment_resource',
        sourceId: 'res-1',
        amountCents: 880_000,
        supplierId: 'sup-1',
        partnerId: null,
        resourceKind: 'hotel',
        title: '4月2日住宿',
        endDate: '2026-04-08',
      },
    }
    const { service, prisma, tx, generation } = createService({ packages: [payablePackage] })
    generation.previewInitialPayable.mockResolvedValue({
      resourceKind: 'segment',
      resource: {
        resourceKind: 'hotel',
        supplierId: 'sup-1',
        partnerId: null,
        segment: {
          departure: { id: 'departure-1', endDate: new Date('2026-04-08T00:00:00.000Z') },
        },
      },
      spec: { title: '4月2日住宿', amountCents: 880_000, counterpartyName: '关西酒店' },
      classification: { status: 'ready', amountCents: 880_000 },
    })
    generation.generateResourcePayable.mockResolvedValue({
      schedule: { id: 'sch-1' },
      generation: 'created',
      resourceKind: 'segment',
      resource: { id: 'res-1' },
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: payablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        idempotencyKey: 'decision-1:pkg-payable',
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(payablePackage)

    await service.executeConfirmedItem('job-1')

    const lockCallOrder = tx.$queryRaw.mock.invocationCallOrder.find(
      (_order: number, index: number) => {
        const sql = sqlTextFromQueryRaw(tx.$queryRaw.mock.calls[index]?.[0])
        return /segment_resources/i.test(sql) && /FOR UPDATE/i.test(sql)
      },
    )
    expect(lockCallOrder).toBeDefined()
    expect(lockCallOrder).toBeLessThan(
      generation.previewInitialPayable.mock.invocationCallOrder[0],
    )
  })

  it('refuses payable confirm when live amount diverges from the review baseline', async () => {
    const payablePackage = {
      ...pendingPackage,
      id: 'pkg-payable',
      payloadSchema: 'resource.payable@v1',
      confirmationUnit: 'resource_payable',
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
        },
      ],
      baselineSnapshot: {
        sourceType: 'segment_resource',
        sourceId: 'res-1',
        amountCents: 880_000,
        supplierId: 'sup-1',
        partnerId: null,
        resourceKind: 'hotel',
        title: '4月2日住宿',
        endDate: '2026-04-08',
      },
    }
    const { service, prisma, tx, generation } = createService({ packages: [payablePackage] })
    generation.previewInitialPayable.mockResolvedValue({
      resourceKind: 'segment',
      resource: {
        resourceKind: 'hotel',
        supplierId: 'sup-1',
        partnerId: null,
        segment: {
          departure: { id: 'departure-1', endDate: new Date('2026-04-08T00:00:00.000Z') },
        },
      },
      spec: { title: '4月2日住宿', amountCents: 990_000, counterpartyName: '关西酒店' },
      classification: { status: 'ready', amountCents: 990_000 },
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: payablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(payablePackage)

    await service.executeConfirmedItem('job-1')

    expect(generation.generateResourcePayable).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'conflict',
            reason: '正式来源或已有账款已变化，请刷新后重试',
          }),
        }),
      }),
    )
  })

  it('refuses payable confirm when departure endDate diverges from the review baseline', async () => {
    const payablePackage = {
      ...pendingPackage,
      id: 'pkg-payable',
      payloadSchema: 'resource.payable@v1',
      confirmationUnit: 'resource_payable',
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
        },
      ],
      baselineSnapshot: {
        sourceType: 'segment_resource',
        sourceId: 'res-1',
        amountCents: 880_000,
        supplierId: 'sup-1',
        partnerId: null,
        resourceKind: 'hotel',
        title: '4月2日住宿',
        endDate: '2026-04-08',
      },
    }
    const { service, prisma, tx, generation } = createService({ packages: [payablePackage] })
    generation.previewInitialPayable.mockResolvedValue({
      resourceKind: 'segment',
      resource: {
        resourceKind: 'hotel',
        supplierId: 'sup-1',
        partnerId: null,
        segment: {
          departure: { id: 'departure-1', endDate: new Date('2026-04-10T00:00:00.000Z') },
        },
      },
      spec: { title: '4月2日住宿', amountCents: 880_000, counterpartyName: '关西酒店' },
      classification: { status: 'ready', amountCents: 880_000 },
    })
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: payablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(payablePackage)

    await service.executeConfirmedItem('job-1')

    expect(generation.generateResourcePayable).not.toHaveBeenCalled()
    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'conflict',
            reason: '正式来源或已有账款已变化，请刷新后重试',
          }),
        }),
      }),
    )
  })

  it.each([
    ['no_positive_amount', 'not_needed'],
    ['complete_and_consistent', 'already_present'],
  ] as const)(
    'allows payable confirm of %s on a closed departure without minting',
    async (historyStatus, generationResult) => {
      const payablePackage = {
        ...pendingPackage,
        id: 'pkg-payable',
        payloadSchema: 'resource.payable@v1',
        confirmationUnit: 'resource_payable',
        candidates: [
          {
            fieldKey: 'historyStatus',
            proposedValue: historyStatus,
            clarity: 'clear',
            status: 'pending',
            evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
          },
        ],
        baselineSnapshot: {
          sourceType: 'segment_resource',
          sourceId: 'res-1',
          amountCents: historyStatus === 'no_positive_amount' ? 0 : 880_000,
          supplierId: 'sup-1',
          partnerId: null,
          resourceKind: 'hotel',
          title: '4月2日住宿',
          endDate: '2026-04-08',
        },
      }
      const { service, prisma, tx, generation, finance } = createService({
        packages: [payablePackage],
      })
      tx.departure.findFirst.mockResolvedValue({
        id: 'departure-1',
        updatedAt: new Date(pendingPackage.baseObjectVersion),
        status: 'closed',
      })
      finance.assertAllowsNewObligation.mockImplementation(() => {
        throw new ConflictException('发团已关闭，不可提交应付')
      })
      generation.previewInitialPayable.mockResolvedValue({
        resourceKind: 'segment',
        resource: {
          resourceKind: 'hotel',
          supplierId: 'sup-1',
          partnerId: null,
          segment: {
            departure: { id: 'departure-1', endDate: new Date('2026-04-08T00:00:00.000Z') },
          },
        },
        spec: {
          title: '4月2日住宿',
          amountCents: historyStatus === 'no_positive_amount' ? 0 : 880_000,
          counterpartyName: '关西酒店',
        },
        classification:
          historyStatus === 'no_positive_amount'
            ? { status: 'no_positive_amount', message: '金额须大于 0' }
            : { status: 'complete_and_consistent', scheduleIds: ['sch-existing'] },
      })
      generation.generateResourcePayable.mockResolvedValue({
        generation: generationResult,
        existingScheduleIds:
          generationResult === 'already_present' ? ['sch-existing'] : undefined,
        resourceKind: 'segment',
        resource: { id: 'res-1' },
      })
      prisma.aiWorkflowJob.findUnique.mockResolvedValue({
        id: 'job-1',
        type: AiWorkflowJobType.review_confirm,
        organizationId,
        reviewPackage: payablePackage,
        idempotencyRecord: {
          operatorUserId: userId,
          requestSnapshot: { expectedPackageVersion: 1 },
        },
        idempotencyRecordId: 'idem-item-1',
      })
      tx.aiReviewPackage.findFirst.mockResolvedValue(payablePackage)

      await service.executeConfirmedItem('job-1')

      expect(generation.generateResourcePayable).toHaveBeenCalled()
      expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resultJson: expect.objectContaining({
              status: 'succeeded',
              resultRef: expect.objectContaining({ generation: generationResult }),
            }),
          }),
        }),
      )
    },
  )

  it('refuses ready payable confirm when the departure is closed', async () => {
    const payablePackage = {
      ...pendingPackage,
      id: 'pkg-payable',
      payloadSchema: 'resource.payable@v1',
      confirmationUnit: 'resource_payable',
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'system_derivation', rule: '正式资源当前约定应付' }],
        },
      ],
      baselineSnapshot: {
        sourceType: 'segment_resource',
        sourceId: 'res-1',
        amountCents: 880_000,
        supplierId: 'sup-1',
        partnerId: null,
        resourceKind: 'hotel',
        title: '4月2日住宿',
        endDate: '2026-04-08',
      },
    }
    const { service, prisma, tx, generation, finance } = createService({
      packages: [payablePackage],
    })
    tx.departure.findFirst.mockResolvedValue({
      id: 'departure-1',
      updatedAt: new Date(pendingPackage.baseObjectVersion),
      status: 'closed',
    })
    finance.assertAllowsNewObligation.mockImplementation(() => {
      throw new ConflictException('发团已关闭，不可提交应付')
    })
    generation.previewInitialPayable.mockResolvedValue({
      resourceKind: 'segment',
      resource: {
        resourceKind: 'hotel',
        supplierId: 'sup-1',
        partnerId: null,
        segment: {
          departure: { id: 'departure-1', endDate: new Date('2026-04-08T00:00:00.000Z') },
        },
      },
      spec: { title: '4月2日住宿', amountCents: 880_000, counterpartyName: '关西酒店' },
      classification: { status: 'ready', amountCents: 880_000 },
    })
    generation.generateResourcePayable.mockImplementation(
      async (
        _org: string,
        _params: unknown,
        assertAllowsNewObligation: (departure: { status: string }, action?: string) => void,
      ) => {
        assertAllowsNewObligation({ status: 'closed' }, '提交应付')
        return { schedule: { id: 'sch-1' }, generation: 'created' }
      },
    )
    prisma.aiWorkflowJob.findUnique.mockResolvedValue({
      id: 'job-1',
      type: AiWorkflowJobType.review_confirm,
      organizationId,
      reviewPackage: payablePackage,
      idempotencyRecord: {
        operatorUserId: userId,
        requestSnapshot: { expectedPackageVersion: 1 },
      },
      idempotencyRecordId: 'idem-item-1',
    })
    tx.aiReviewPackage.findFirst.mockResolvedValue(payablePackage)

    await service.executeConfirmedItem('job-1')

    expect(tx.aiCreateIdempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultJson: expect.objectContaining({
            status: 'conflict',
            reason: '发团已关闭，不可提交应付',
          }),
        }),
      }),
    )
  })
})
