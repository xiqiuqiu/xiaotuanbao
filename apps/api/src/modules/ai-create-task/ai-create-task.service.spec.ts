import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import {
  DEPARTURE_BASIC_INFO_REVIEW_SCHEMA,
  registeredReviewSchemas,
} from '@xiaotuanbao/ai-contracts'
import { AiCreatePhase, DepartureCreationDraftMode, DepartureType } from '@xiaotuanbao/shared'
import { AgentTaskStatus, AiReviewPackageStatus } from '@prisma/client'
import { AiCreateTaskService } from './ai-create-task.service'
import {
  departureReviewProposalHash,
  reviewDecisionRequestHash,
} from './review-package.envelope'

describe('AiCreateTaskService.confirmDepartureReviewPackage schema safety #440', () => {
  it('rejects an unknown schema version before applying any business write', async () => {
    const organizationId = 'org-1'
    const userId = 'user-1'
    const taskId = 'task-1'
    const snapshot = {
      mode: DepartureCreationDraftMode.MANUAL,
      routeName: '川西',
      name: '原团名',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      ownerUserId: userId,
      departureType: DepartureType.COMBINED,
    }
    const task = {
      id: taskId,
      currentPhase: AiCreatePhase.BASIC_INFO,
      departureId: null,
      draft: { id: 'draft-1', version: 1, snapshot },
      agentTask: {
        id: taskId,
        organizationId,
        ownerUserId: userId,
        status: AgentTaskStatus.active,
        statusVersion: 1,
        reviewPackages: [],
      },
    }
    const pkg = {
      id: 'pkg-1',
      organizationId,
      taskId,
      status: AiReviewPackageStatus.pending,
      version: 1,
      confirmationUnit: 'basic_info_draft',
      payloadSchema: 'departure.basic_info_draft@v999',
      targetKind: 'departure_creation_draft',
      baseObjectVersion: 1,
      baselineSnapshot: snapshot,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '候选团名',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '候选团名' }],
        },
      ],
    }
    const businessWrite = jest.fn()
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      aiCreateIdempotencyRecord: {
        upsert: jest.fn().mockImplementation(({ create }) =>
          Promise.resolve({ ...create, completedAt: null }),
        ),
      },
      aiCreateTask: {
        findFirst: jest.fn().mockResolvedValue(task),
        findFirstOrThrow: jest.fn().mockResolvedValue(task),
      },
      aiReviewPackage: { findFirst: jest.fn().mockResolvedValue(pkg) },
      departureCreationDraft: { update: businessWrite },
    }
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    }
    const service = new AiCreateTaskService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { getPermissionKeysForUser: jest.fn().mockResolvedValue(['departure:write']) } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.confirmDepartureReviewPackage(
        organizationId,
        userId,
        taskId,
        pkg.id,
        { expectedVersion: 1, expectedPackageVersion: 1 },
        'decision-1',
      ),
    ).rejects.toThrow(BadRequestException)
    expect(businessWrite).not.toHaveBeenCalled()
  })

  it('rejects a correction that violates the package field schema before a review write', async () => {
    const reviewWrite = jest.fn()
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      aiCreateTask: {
        findFirst: jest.fn().mockResolvedValue({
          agentTask: { ownerUserId: 'user-1', status: AgentTaskStatus.active },
        }),
      },
      aiReviewPackage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pkg-1',
          status: AiReviewPackageStatus.pending,
          version: 1,
          payloadSchema: 'departure.basic_info_draft@v1',
          confirmationUnit: 'basic_info_draft',
          targetKind: 'departure_creation_draft',
          candidates: [
            {
              fieldKey: 'startDate',
              proposedValue: '2026-09-01',
              clarity: 'clear',
              status: 'pending',
              evidence: [{ kind: 'user_message', sequence: 1, excerpt: '9 月 1 日' }],
            },
          ],
        }),
        update: reviewWrite,
      },
    }
    const service = new AiCreateTaskService(
      { $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.patchReviewPackage(
        'org-1',
        'user-1',
        'task-1',
        'pkg-1',
        { corrections: { startDate: 'not-a-date' } },
      ),
    ).rejects.toThrow('审核修正值无效：出团日期')
    expect(reviewWrite).not.toHaveBeenCalled()
  })
})

describe('AiCreateTaskService review disposition #440', () => {
  const now = new Date('2026-08-30T00:00:00.000Z')
  const snapshot = {
    mode: DepartureCreationDraftMode.MANUAL,
    routeName: '川西',
    name: '原团名',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    ownerUserId: 'user-1',
    departureType: DepartureType.COMBINED,
  }
  const task = {
    id: 'task-1',
    currentPhase: AiCreatePhase.BASIC_INFO,
    departureId: null,
    createdAt: now,
    updatedAt: now,
    draft: { id: 'draft-1', taskId: 'task-1', version: 1, snapshot, createdAt: now, updatedAt: now },
    agentTask: {
      id: 'task-1',
      organizationId: 'org-1',
      ownerUserId: 'user-1',
      status: AgentTaskStatus.active,
      statusVersion: 1,
      createdAt: now,
      updatedAt: now,
      reviewPackages: [],
    },
  }

  function createService(
    pkg: Record<string, unknown>,
    options?: { siblings?: Record<string, unknown>[] },
  ) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      aiCreateTask: {
        findFirst: jest.fn().mockResolvedValue(task),
        findFirstOrThrow: jest.fn().mockResolvedValue(task),
      },
      aiReviewPackage: {
        findFirst: jest.fn().mockResolvedValue(pkg),
        findMany: jest.fn().mockResolvedValue(options?.siblings ?? []),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      aiReviewRecord: { create: jest.fn().mockResolvedValue({}) },
      departureCreationDraft: { update: jest.fn().mockResolvedValue({}) },
      aiCreateIdempotencyRecord: {
        upsert: jest.fn().mockImplementation(({ create }) =>
          Promise.resolve({ ...create, completedAt: null }),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    }
    const conversationService = {
      finalizeReviewDisposition: jest.fn().mockResolvedValue([]),
      finalizeReviewCancel: jest.fn().mockResolvedValue([]),
      recordReviewConflict: jest.fn().mockResolvedValue([]),
      publish: jest.fn(),
    }
    const service = new AiCreateTaskService(
      { $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as never,
      {} as never,
      {} as never,
      {} as never,
      { getPermissionKeysForUser: jest.fn().mockResolvedValue(['departure:write']) } as never,
      conversationService as never,
      {} as never,
    )
    return { service, tx }
  }

  const unsupportedPackage = {
    id: 'pkg-unsupported',
    organizationId: 'org-1',
    taskId: 'task-1',
    status: AiReviewPackageStatus.pending,
    version: 1,
    confirmationUnit: 'basic_info_draft',
    payloadSchema: 'departure.basic_info_draft@v999',
    targetKind: 'departure_creation_draft',
    targetId: 'draft-1',
    baseObjectVersion: 1,
    baselineSnapshot: snapshot,
    candidates: [{ fieldKey: 'futureField', proposedValue: { opaque: true } }],
    userCorrections: null,
    inputBatchId: null,
    conversationId: null,
  }

  const corruptPackage = {
    ...unsupportedPackage,
    id: 'pkg-corrupt',
    payloadSchema: 'departure.basic_info_draft@v1',
    candidates: [
      {
        fieldKey: 'startDate',
        proposedValue: 'not-a-date',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'user_message', sequence: 1, excerpt: '日期内容损坏' }],
      },
    ],
  }

  it.each([
    ['reject', unsupportedPackage],
    ['cancel', unsupportedPackage],
    ['reject', corruptPackage],
    ['cancel', corruptPackage],
  ] as const)(
    'allows %s for an unsupported or corrupt package without interpreting candidates',
    async (operation, pkg) => {
      const { service, tx } = createService(pkg)

      await expect(
        operation === 'reject'
          ? service.rejectReviewPackage('org-1', 'user-1', 'task-1', String(pkg.id), {
              expectedPackageVersion: 1,
            })
          : service.cancelReviewPackage('org-1', 'user-1', 'task-1', String(pkg.id), {
              expectedPackageVersion: 1,
            }),
      ).resolves.toMatchObject({ id: 'task-1' })
      expect(tx.aiReviewRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ originalCandidates: [], evidence: [] }),
      })
    },
  )

  it('applies a valid registered proposal to the draft on confirm', async () => {
    const modelCandidate = {
      fieldKey: 'name' as const,
      proposedValue: '确认后的川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '团名叫确认后的川西团' }],
    }
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-valid',
      payloadSchema: 'departure.basic_info_draft@v1',
      proposalHash: departureReviewProposalHash({
        objectVersion: 1,
        confirmationUnit: 'basic_info_draft',
        candidates: [modelCandidate],
      }),
      candidates: [{ ...modelCandidate, status: 'pending' }],
    }
    const { service, tx } = createService(pkg)

    await expect(
      service.confirmDepartureReviewPackage(
        'org-1',
        'user-1',
        'task-1',
        'pkg-valid',
        { expectedVersion: 1, expectedPackageVersion: 1 },
        'decision-happy-path',
      ),
    ).resolves.toMatchObject({ id: 'task-1' })
    expect(tx.departureCreationDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: expect.objectContaining({
        version: 2,
        snapshot: expect.objectContaining({ name: '确认后的川西团' }),
      }),
    })
    expect(tx.aiReviewPackage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AiReviewPackageStatus.confirmed }) }),
    )
  })

  it('does not confirm an empty package as a successful no-op', async () => {
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-empty',
      payloadSchema: 'departure.basic_info_draft@v1',
      proposalHash: departureReviewProposalHash({
        objectVersion: 1,
        confirmationUnit: 'basic_info_draft',
        candidates: [],
      }),
      candidates: [],
    }
    const { service, tx } = createService(pkg)

    await expect(
      service.confirmDepartureReviewPackage(
        'org-1',
        'user-1',
        'task-1',
        pkg.id,
        { expectedVersion: 1, expectedPackageVersion: 1 },
        'decision-empty',
      ),
    ).rejects.toThrow(BadRequestException)
    expect(tx.departureCreationDraft.update).not.toHaveBeenCalled()
  })

  it('does not apply a second registered schema through the departure draft writer', async () => {
    const secondSchema = {
      ...DEPARTURE_BASIC_INFO_REVIEW_SCHEMA,
      schemaId: 'partner.profile',
      payloadSchema: 'partner.profile@v1',
      targetKind: 'partner_profile',
    }
    const lookup = jest
      .spyOn(registeredReviewSchemas, 'findByPayloadSchema')
      .mockImplementation((payloadSchema) =>
        payloadSchema === secondSchema.payloadSchema
          ? secondSchema
          : payloadSchema === DEPARTURE_BASIC_INFO_REVIEW_SCHEMA.payloadSchema
            ? DEPARTURE_BASIC_INFO_REVIEW_SCHEMA
            : undefined,
      )
    const modelCandidate = {
      fieldKey: 'name' as const,
      proposedValue: '不应写入发团草稿',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '伙伴名称' }],
    }
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-second-schema',
      payloadSchema: secondSchema.payloadSchema,
      targetKind: secondSchema.targetKind,
      proposalHash: departureReviewProposalHash({
        objectVersion: 1,
        confirmationUnit: 'basic_info_draft',
        candidates: [modelCandidate],
      }),
      candidates: [{ ...modelCandidate, status: 'pending' }],
    }
    const { service, tx } = createService(pkg)

    try {
      await expect(
        service.confirmDepartureReviewPackage(
          'org-1',
          'user-1',
          'task-1',
          pkg.id,
          { expectedVersion: 1, expectedPackageVersion: 1 },
          'decision-second-schema',
        ),
      ).rejects.toThrow(BadRequestException)
      expect(tx.departureCreationDraft.update).not.toHaveBeenCalled()
    } finally {
      lookup.mockRestore()
    }
  })

  it('replays the same effective corrections regardless of extra non-candidate fields', async () => {
    const modelCandidate = {
      fieldKey: 'name' as const,
      proposedValue: '确认后的川西团',
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '修改团名' }],
    }
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-replay',
      payloadSchema: 'departure.basic_info_draft@v1',
      proposalHash: departureReviewProposalHash({
        objectVersion: 1,
        confirmationUnit: 'basic_info_draft',
        candidates: [modelCandidate],
      }),
      candidates: [{ ...modelCandidate, status: 'pending' }],
    }
    const { service, tx } = createService(pkg)
    tx.aiCreateIdempotencyRecord.upsert.mockResolvedValue({
      organizationId: 'org-1',
      taskId: 'task-1',
      operation: 'review.confirm',
      idempotencyKey: 'decision-replay',
      requestHash: reviewDecisionRequestHash({
        reviewPackageId: pkg.id,
        reviewVersion: 1,
        decisionCommandId: 'decision-replay',
        expectedVersion: 1,
        corrections: { name: '用户确认团名' },
      }),
      completedAt: new Date(),
      resultJson: { kind: 'ok', summary: task },
    })

    await expect(
      service.confirmDepartureReviewPackage(
        'org-1',
        'user-1',
        'task-1',
        pkg.id,
        {
          expectedVersion: 1,
          expectedPackageVersion: 1,
          corrections: { name: '用户确认团名', routeName: '非候选字段' },
        },
        'decision-replay',
      ),
    ).resolves.toMatchObject({ id: 'task-1' })
    expect(tx.departureCreationDraft.update).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown', unsupportedPackage],
    ['corrupt', corruptPackage],
  ] as const)(
    'keeps a valid confirm atomic when the sibling package is %s',
    async (_kind, sibling) => {
      const modelCandidate = {
        fieldKey: 'name' as const,
        proposedValue: '确认后的川西团',
        clarity: 'clear' as const,
        evidence: [
          { kind: 'user_message' as const, sequence: 1, excerpt: '团名叫确认后的川西团' },
        ],
      }
      const validPackage = {
        ...unsupportedPackage,
        id: 'pkg-valid-with-sibling',
        payloadSchema: 'departure.basic_info_draft@v1',
        proposalHash: departureReviewProposalHash({
          objectVersion: 1,
          confirmationUnit: 'basic_info_draft',
          candidates: [modelCandidate],
        }),
        candidates: [{ ...modelCandidate, status: 'pending' }],
      }
      const { service, tx } = createService(validPackage, { siblings: [sibling] })

      await expect(
        service.confirmDepartureReviewPackage(
          'org-1',
          'user-1',
          'task-1',
          validPackage.id,
          { expectedVersion: 1, expectedPackageVersion: 1 },
          `decision-with-${_kind}-sibling`,
        ),
      ).resolves.toMatchObject({ id: 'task-1' })
      expect(tx.departureCreationDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
        data: expect.objectContaining({
          version: 2,
          snapshot: expect.objectContaining({ name: '确认后的川西团' }),
        }),
      })
    },
  )
})

describe('AiCreateTaskService.saveDraft pendingReview', () => {
  const organizationId = 'org-1'
  const userId = 'user-1'
  const taskId = 'task-1'
  const draftId = 'draft-1'
  const packageId = 'pkg-1'
  const now = new Date('2026-08-13T00:00:00.000Z')

  const snapshot = {
    mode: DepartureCreationDraftMode.MANUAL,
    routeName: '川西',
    name: '原团名',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    ownerUserId: userId,
    departureType: DepartureType.COMBINED,
    expectedGuestCountHint: 8,
  }

  const draft = {
    id: draftId,
    taskId,
    version: 1,
    snapshot,
    createdAt: now,
    updatedAt: now,
  }

  const pendingPackage = {
    id: packageId,
    organizationId,
    taskId,
    runId: 'run-1',
    inputBatchId: null,
    status: AiReviewPackageStatus.pending,
    version: 1,
    confirmationUnit: 'basic_info_draft',
    baseObjectVersion: 1,
    baselineSnapshot: snapshot,
    candidates: [
      {
        fieldKey: 'name',
        proposedValue: '候选团名',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名叫候选团名' }],
      },
    ],
    createdAt: now,
    updatedAt: now,
  }

  const task = {
    id: taskId,
    agentTask: {
      id: taskId,
      organizationId,
      ownerUserId: userId,
      status: AgentTaskStatus.active,
      statusVersion: 2,
      createdAt: now,
      updatedAt: now,
      reviewPackages: [pendingPackage],
    },
    currentPhase: AiCreatePhase.BASIC_INFO,
    departureId: null,
    createdAt: now,
    updatedAt: now,
  }

  function loadTask(include: { draft?: boolean; agentTask?: unknown }) {
    return {
      ...task,
      draft: include.draft ? { ...draft } : undefined,
    }
  }

  function createService(options?: { draftVersion?: number; updateCount?: number }) {
    const currentDraft = { ...draft, version: options?.draftVersion ?? 1 }
    const findFirst = jest.fn().mockImplementation(({ include }: { include: { draft?: boolean; agentTask?: unknown } }) =>
      Promise.resolve({
        ...loadTask(include),
        draft: include.draft ? currentDraft : undefined,
      }),
    )
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      aiCreateTask: { findFirst },
      departureCreationDraft: {
        updateMany: jest.fn().mockResolvedValue({ count: options?.updateCount ?? 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...currentDraft,
          version: currentDraft.version + 1,
          updatedAt: now,
        }),
      },
    }
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new AiCreateTaskService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    return { service, findFirst, tx }
  }

  it('keeps pendingReview on a successful draft save', async () => {
    const { service } = createService()

    const result = await service.saveDraft(organizationId, userId, {
      taskId,
      expectedVersion: 1,
      draft: snapshot,
    })

    expect(result.pendingReview).toMatchObject({
      id: packageId,
      status: 'pending',
      confirmationUnit: 'basic_info_draft',
    })
  })

  it('keeps pendingReview on a version-conflict response', async () => {
    const { service } = createService({ draftVersion: 2 })

    try {
      await service.saveDraft(organizationId, userId, {
        taskId,
        expectedVersion: 1,
        draft: snapshot,
      })
      throw new Error('expected ConflictException')
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException)
      const body = (error as ConflictException).getResponse() as {
        data: { pendingReview: { id: string } | null }
      }
      expect(body.data.pendingReview).toMatchObject({ id: packageId })
    }
  })

  it('keeps pendingReview when optimistic update loses the race', async () => {
    const { service } = createService({ updateCount: 0 })

    try {
      await service.saveDraft(organizationId, userId, {
        taskId,
        expectedVersion: 1,
        draft: snapshot,
      })
      throw new Error('expected ConflictException')
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException)
      const body = (error as ConflictException).getResponse() as {
        data: { pendingReview: { id: string } | null }
      }
      expect(body.data.pendingReview).toMatchObject({ id: packageId })
    }
  })
})

describe('AiCreateTaskService.getTask statusVersion', () => {
  const organizationId = 'org-1'
  const userId = 'user-1'
  const taskId = 'task-1'
  const now = new Date('2026-08-24T00:00:00.000Z')

  it('exposes AgentTask.statusVersion on the task summary', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: taskId,
      currentPhase: AiCreatePhase.BASIC_INFO,
      departureId: null,
      createdAt: now,
      updatedAt: now,
      draft: {
        id: 'draft-1',
        taskId,
        version: 1,
        snapshot: {
          mode: DepartureCreationDraftMode.MANUAL,
          routeName: '川西',
        },
        createdAt: now,
        updatedAt: now,
      },
      agentTask: {
        id: taskId,
        organizationId,
        ownerUserId: userId,
        status: AgentTaskStatus.active,
        statusVersion: 2,
        createdAt: now,
        updatedAt: now,
        reviewPackages: [],
      },
    })
    const service = new AiCreateTaskService(
      { aiCreateTask: { findFirst } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    const result = await service.getTask(organizationId, userId, taskId)

    expect(result.statusVersion).toBe(2)
  })

  it('does not alias pendingReview to the newest package when several conversations are awaiting review', async () => {
    const older = {
      id: 'pkg-older',
      organizationId,
      taskId,
      runId: 'run-older',
      conversationId: 'conv-older',
      inputBatchId: 'batch-older',
      status: AiReviewPackageStatus.pending,
      version: 1,
      confirmationUnit: 'basic_info_draft',
      baseObjectVersion: 1,
      baselineSnapshot: {
        mode: DepartureCreationDraftMode.MANUAL,
        routeName: '川西',
      },
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '旧会话团名',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '旧会话团名' }],
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const newest = {
      ...older,
      id: 'pkg-newest',
      runId: 'run-newest',
      conversationId: 'conv-newest',
      inputBatchId: 'batch-newest',
      createdAt: new Date('2026-08-24T01:00:00.000Z'),
      updatedAt: new Date('2026-08-24T01:00:00.000Z'),
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '新会话团名',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '新会话团名' }],
        },
      ],
    }
    const findFirst = jest.fn().mockResolvedValue({
      id: taskId,
      currentPhase: AiCreatePhase.BASIC_INFO,
      departureId: null,
      createdAt: now,
      updatedAt: now,
      draft: {
        id: 'draft-1',
        taskId,
        version: 1,
        snapshot: {
          mode: DepartureCreationDraftMode.MANUAL,
          routeName: '川西',
        },
        createdAt: now,
        updatedAt: now,
      },
      agentTask: {
        id: taskId,
        organizationId,
        ownerUserId: userId,
        status: AgentTaskStatus.active,
        statusVersion: 2,
        createdAt: now,
        updatedAt: now,
        reviewPackages: [newest, older],
      },
    })
    const service = new AiCreateTaskService(
      { aiCreateTask: { findFirst } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    const result = await service.getTask(organizationId, userId, taskId)

    expect(result.pendingReviews?.map((pkg) => pkg.id)).toEqual(['pkg-newest', 'pkg-older'])
    expect(result.pendingReview).toBeNull()
  })

  it('keeps pendingReview when only one conversation is awaiting review', async () => {
    const pending = {
      id: 'pkg-only',
      organizationId,
      taskId,
      runId: 'run-only',
      conversationId: 'conv-only',
      inputBatchId: 'batch-only',
      status: AiReviewPackageStatus.pending,
      version: 1,
      confirmationUnit: 'basic_info_draft',
      baseObjectVersion: 1,
      baselineSnapshot: {
        mode: DepartureCreationDraftMode.MANUAL,
        routeName: '川西',
      },
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '唯一会话团名',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '唯一会话团名' }],
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const findFirst = jest.fn().mockResolvedValue({
      id: taskId,
      currentPhase: AiCreatePhase.BASIC_INFO,
      departureId: null,
      createdAt: now,
      updatedAt: now,
      draft: {
        id: 'draft-1',
        taskId,
        version: 1,
        snapshot: {
          mode: DepartureCreationDraftMode.MANUAL,
          routeName: '川西',
        },
        createdAt: now,
        updatedAt: now,
      },
      agentTask: {
        id: taskId,
        organizationId,
        ownerUserId: userId,
        status: AgentTaskStatus.active,
        statusVersion: 2,
        createdAt: now,
        updatedAt: now,
        reviewPackages: [pending],
      },
    })
    const service = new AiCreateTaskService(
      { aiCreateTask: { findFirst } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    const result = await service.getTask(organizationId, userId, taskId)

    expect(result.pendingReview).toMatchObject({ id: 'pkg-only' })
    expect(result.pendingReviews).toHaveLength(1)
  })
})

describe('AiCreateTaskService.regenerateReviewPackage owner check', () => {
  const organizationId = 'org-1'
  const ownerUserId = 'user-owner'
  const peerUserId = 'user-peer'
  const taskId = 'task-1'
  const packageId = 'pkg-1'
  const conversationId = 'conv-1'
  const now = new Date('2026-08-24T00:00:00.000Z')

  const snapshot = {
    mode: DepartureCreationDraftMode.MANUAL,
    routeName: '川西',
    name: '原团名',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    ownerUserId,
    departureType: DepartureType.COMBINED,
  }

  const conflictPackage = {
    id: packageId,
    organizationId,
    taskId,
    runId: 'run-1',
    conversationId,
    inputBatchId: 'batch-1',
    status: AiReviewPackageStatus.conflict,
    version: 1,
    confirmationUnit: 'basic_info_draft',
    baseObjectVersion: 1,
    baselineSnapshot: snapshot,
    candidates: [],
    createdAt: now,
    updatedAt: now,
  }

  const task = {
    id: taskId,
    agentTask: {
      id: taskId,
      organizationId,
      ownerUserId,
      status: AgentTaskStatus.active,
      statusVersion: 2,
      createdAt: now,
      updatedAt: now,
      reviewPackages: [],
    },
    currentPhase: AiCreatePhase.BASIC_INFO,
    departureId: null,
    createdAt: now,
    updatedAt: now,
    draft: {
      id: 'draft-1',
      taskId,
      version: 1,
      snapshot,
      createdAt: now,
      updatedAt: now,
    },
  }

  function createService() {
    const authService = {
      getPermissionKeysForUser: jest.fn().mockResolvedValue(['departure:write']),
    }
    const conversationService = {
      startReviewRegenerate: jest.fn().mockResolvedValue([]),
      publish: jest.fn(),
    }
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      aiCreateTask: {
        findFirst: jest.fn().mockResolvedValue(task),
        findFirstOrThrow: jest.fn().mockResolvedValue(task),
      },
      aiReviewPackage: {
        findFirst: jest.fn().mockResolvedValue(conflictPackage),
      },
    }
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    }
    const service = new AiCreateTaskService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      authService as never,
      conversationService as never,
      {} as never,
    )
    return { service, conversationService }
  }

  it('rejects a write-capable peer who is not the task owner', async () => {
    const { service, conversationService } = createService()

    try {
      await service.regenerateReviewPackage(organizationId, peerUserId, taskId, packageId)
      throw new Error('expected ForbiddenException')
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException)
      expect((error as ForbiddenException).message).toBe('仅任务创建者可处理审核包')
    }

    expect(conversationService.startReviewRegenerate).not.toHaveBeenCalled()
  })

  it('allows the task owner to enqueue regenerate for a conflicted package', async () => {
    const { service, conversationService } = createService()

    const result = await service.regenerateReviewPackage(
      organizationId,
      ownerUserId,
      taskId,
      packageId,
    )

    expect(conversationService.startReviewRegenerate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: ownerUserId,
        taskId,
        reviewPackageId: packageId,
        conversationId,
      }),
    )
    expect(result.id).toBe(taskId)
  })
})
