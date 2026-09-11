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
      agentTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          ownerUserId: 'user-1',
          status: AgentTaskStatus.active,
        }),
      },
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
      agentTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          ownerUserId: 'user-1',
          status: AgentTaskStatus.active,
        }),
      },
      aiWorkflowJob: { findFirst: jest.fn().mockResolvedValue(null) },
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
        { corrections: { startDate: 'not-a-date' }, expectedPackageVersion: 1 },
      ),
    ).rejects.toThrow('审核修正值无效：出团日期')
    expect(reviewWrite).not.toHaveBeenCalled()
  })

  it('refuses corrections to non-editable segment ownership #449', async () => {
    const reviewWrite = jest.fn()
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      agentTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          ownerUserId: 'user-1',
          status: AgentTaskStatus.active,
        }),
      },
      aiWorkflowJob: { findFirst: jest.fn().mockResolvedValue(null) },
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
          payloadSchema: 'departure.segment_resource@v1',
          confirmationUnit: 'segment_resource',
          targetKind: 'departure',
          candidates: [
            {
              fieldKey: 'itinerarySegmentId',
              proposedValue: 'seg-1',
              clarity: 'clear',
              status: 'pending',
              evidence: [{ kind: 'user_message', sequence: 1, excerpt: '4月2日住宿' }],
            },
          ],
        }),
        update: reviewWrite,
        updateMany: jest.fn(),
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
      service.patchReviewPackage('org-1', 'user-1', 'task-1', 'pkg-1', {
        corrections: { itinerarySegmentId: 'seg-other' },
        expectedPackageVersion: 1,
      }),
    ).rejects.toThrow('行程段不可修订')
    expect(reviewWrite).not.toHaveBeenCalled()
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
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
    options?: {
      siblings?: Record<string, unknown>[]
      taskSnapshot?: Record<string, unknown>
    },
  ) {
    const currentTask = options?.taskSnapshot
      ? { ...task, draft: { ...task.draft, snapshot: options.taskSnapshot } }
      : task
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      agentTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          ownerUserId: 'user-1',
          status: AgentTaskStatus.active,
          type: 'departure_creation',
          departureId: null,
        }),
      },
      aiWorkflowJob: { findFirst: jest.fn().mockResolvedValue(null) },
      aiCreateTask: {
        findFirst: jest.fn().mockResolvedValue(currentTask),
        findFirstOrThrow: jest.fn().mockResolvedValue(currentTask),
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

  it('rejects a stale review revision and does not overwrite corrections', async () => {
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-stale-patch',
      payloadSchema: 'departure.basic_info_draft@v1',
      version: 2,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '候选团名',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名' }],
        },
      ],
    }
    const { service, tx } = createService(pkg)

    await expect(
      service.patchReviewPackage('org-1', 'user-1', 'task-1', pkg.id, {
        corrections: { name: '过期修订' },
        expectedPackageVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.aiReviewPackage.updateMany).not.toHaveBeenCalled()
    expect(tx.aiReviewRecord.create).not.toHaveBeenCalled()
  })

  it('increments the package version and writes a revise record', async () => {
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-revise',
      payloadSchema: 'departure.basic_info_draft@v1',
      version: 1,
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: '候选团名',
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名' }],
        },
      ],
    }
    const { service, tx } = createService(pkg)

    await expect(
      service.patchReviewPackage('org-1', 'user-1', 'task-1', pkg.id, {
        corrections: { name: '人工修订团名' },
        expectedPackageVersion: 1,
      }),
    ).resolves.toMatchObject({ id: 'task-1' })
    expect(tx.aiReviewPackage.updateMany).toHaveBeenCalledWith({
      where: { id: pkg.id, status: AiReviewPackageStatus.pending, version: 1 },
      data: expect.objectContaining({ version: { increment: 1 } }),
    })
    expect(tx.aiReviewRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'revise',
        packageVersion: 2,
      }),
    })
  })

  it.each([
    ['departure.basic_info_draft@v1', 'basic_info_draft', 'name', '已改团名', 'startDate', '2026-09-02'],
    ['departure.segment_resource@v1', 'segment_resource', 'title', '已改住宿', 'amountCents', 900000],
  ] as const)('merges successive corrections for %s', async (payloadSchema, confirmationUnit, firstField, firstValue, nextField, nextValue) => {
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-merge-corrections',
      baselineSnapshot: { preserved: true, reviewConflicts: [{ fieldKey: nextField, proposedValue: nextValue, userCorrectedValue: nextValue }] },
      targetKind: confirmationUnit === 'segment_resource' ? 'departure' : unsupportedPackage.targetKind,
      payloadSchema,
      confirmationUnit,
      version: 1,
      userCorrections: { [firstField]: firstValue },
      candidates: [
        {
          fieldKey: firstField,
          proposedValue: firstValue,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '团名' }],
        },
        {
          fieldKey: nextField,
          proposedValue: nextValue,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '9月1日' }],
        },
      ],
    }
    const { service, tx } = createService(pkg)

    await service.patchReviewPackage('org-1', 'user-1', 'task-1', pkg.id, {
      corrections: { [nextField]: nextValue },
      expectedPackageVersion: 1,
    })

    expect(tx.aiReviewPackage.updateMany).toHaveBeenCalledWith({
      where: { id: pkg.id, status: AiReviewPackageStatus.pending, version: 1 },
      data: expect.objectContaining({
        userCorrections: { [firstField]: firstValue, [nextField]: nextValue },
        baselineSnapshot: { preserved: true, reviewConflicts: [] },
      }),
    })
    expect(tx.aiReviewRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      beforeSnapshot: { [firstField]: firstValue, [nextField]: nextValue },
      afterSnapshot: { [firstField]: firstValue, [nextField]: nextValue },
    }) })
  })

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

  it('rejects a null departureType correction before writing the draft', async () => {
    const modelCandidate = {
      fieldKey: 'departureType' as const,
      proposedValue: 'independent' as const,
      clarity: 'clear' as const,
      evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '独立团' }],
    }
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-departure-type-null',
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
        pkg.id,
        {
          expectedVersion: 1,
          expectedPackageVersion: 1,
          corrections: { departureType: null },
        },
        'decision-departure-type-null',
      ),
    ).rejects.toThrow('审核修正值无效：发团类型')
    expect(tx.departureCreationDraft.update).not.toHaveBeenCalled()
  })

  it('confirms non-route fields while a conversation-first manual draft still has no route', async () => {
    const emptySnapshot = {
      mode: DepartureCreationDraftMode.MANUAL,
      routeName: '',
      ownerUserId: 'user-1',
      departureType: DepartureType.COMBINED,
    }
    const candidates = [
      {
        fieldKey: 'vehiclePlate' as const,
        proposedValue: '新A·12345',
        clarity: 'clear' as const,
        evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '车牌新A·12345' }],
      },
      {
        fieldKey: 'notes' as const,
        proposedValue: '客人需要轮椅',
        clarity: 'clear' as const,
        evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '客人需要轮椅' }],
      },
      {
        fieldKey: 'departureType' as const,
        proposedValue: 'independent' as const,
        clarity: 'clear' as const,
        evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: '独立团' }],
      },
    ]
    const pkg = {
      ...unsupportedPackage,
      id: 'pkg-empty-route-fields',
      payloadSchema: 'departure.basic_info_draft@v1',
      baselineSnapshot: emptySnapshot,
      proposalHash: departureReviewProposalHash({
        objectVersion: 1,
        confirmationUnit: 'basic_info_draft',
        candidates,
      }),
      candidates: candidates.map((candidate) => ({ ...candidate, status: 'pending' })),
    }
    const { service, tx } = createService(pkg, { taskSnapshot: emptySnapshot })

    await expect(
      service.confirmDepartureReviewPackage(
        'org-1',
        'user-1',
        'task-1',
        pkg.id,
        { expectedVersion: 1, expectedPackageVersion: 1 },
        'decision-empty-route-fields',
      ),
    ).resolves.toMatchObject({ id: 'task-1' })
    expect(tx.departureCreationDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: expect.objectContaining({
        snapshot: expect.objectContaining({
          routeName: '',
          vehiclePlate: '新A·12345',
          notes: '客人需要轮椅',
          departureType: DepartureType.INDEPENDENT,
        }),
      }),
    })
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

  function createService(options?: {
    draftVersion?: number
    updateCount?: number
    snapshot?: typeof snapshot
  }) {
    const currentDraft = {
      ...draft,
      version: options?.draftVersion ?? 1,
      snapshot: options?.snapshot ?? snapshot,
    }
    const findFirst = jest.fn().mockImplementation(({ include }: { include: { draft?: boolean; agentTask?: unknown } }) =>
      Promise.resolve({
        ...loadTask(include),
        draft: include.draft ? currentDraft : undefined,
      }),
    )
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: '1' }]),
      agentTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          ownerUserId: 'user-1',
          status: AgentTaskStatus.active,
        }),
      },
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

  it('accepts an existing Agent draft update that still has an empty routeName', async () => {
    const emptySnapshot = {
      mode: DepartureCreationDraftMode.MANUAL,
      routeName: '',
      name: null,
      startDate: null,
      endDate: null,
      ownerUserId: userId,
      departureType: DepartureType.COMBINED,
    }
    const { service, tx } = createService()
    tx.aiCreateTask.findFirst.mockImplementation((args: { include?: { draft?: boolean } }) =>
      Promise.resolve({
        ...task,
        draft: args.include?.draft
          ? { ...draft, snapshot: emptySnapshot }
          : undefined,
      }),
    )

    const result = await service.saveDraft(organizationId, userId, {
      taskId,
      expectedVersion: 1,
      draft: {
        ...emptySnapshot,
        endDate: '2026-10-01',
      },
    })

    expect(tx.departureCreationDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            routeName: '',
            endDate: '2026-10-01',
          }),
        }),
      }),
    )
    expect(result.pendingReview).toMatchObject({ id: packageId })
  })

  it('rejects an empty manual routeName when the existing task has no pending review', async () => {
    const emptySnapshot = {
      mode: DepartureCreationDraftMode.MANUAL,
      routeName: '',
      name: null,
      startDate: null,
      endDate: null,
      ownerUserId: userId,
      departureType: DepartureType.COMBINED,
      notes: '集合时间提前',
    }
    const { service, tx } = createService()
    tx.aiCreateTask.findFirst.mockImplementation((args: { include?: { draft?: boolean } }) =>
      Promise.resolve({
        ...task,
        agentTask: { ...task.agentTask, reviewPackages: [] },
        draft: args.include?.draft
          ? { ...draft, snapshot: emptySnapshot }
          : undefined,
      }),
    )

    await expect(
      service.saveDraft(organizationId, userId, {
        taskId,
        expectedVersion: 1,
        draft: emptySnapshot,
      }),
    ).rejects.toMatchObject({
      message: '手动路线须填写路线名称',
    })
    expect(tx.departureCreationDraft.updateMany).not.toHaveBeenCalled()
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

  it.each([
    ['omitted', {}],
    ['null', { ownerUserId: null, departureType: null }],
    ['blank owner', { ownerUserId: '', departureType: null }],
  ] as const)(
    'preserves an existing owner and independent type when a later save sends %s defaults',
    async (_label, overrides) => {
      const selectedSnapshot = {
        ...snapshot,
        ownerUserId: 'user-b',
        departureType: DepartureType.INDEPENDENT,
      }
      const { service, tx } = createService({ snapshot: selectedSnapshot })
      const { ownerUserId: _ownerUserId, departureType: _departureType, ...omitted } = snapshot

      await service.saveDraft(organizationId, userId, {
        taskId,
        expectedVersion: 1,
        draft: { ...omitted, ...overrides },
      })

      expect(tx.departureCreationDraft.updateMany).toHaveBeenCalledWith({
        where: { id: draftId, version: 1 },
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            ownerUserId: 'user-b',
            departureType: DepartureType.INDEPENDENT,
          }),
        }),
      })
    },
  )
})

describe('AiCreateTaskService.saveDraft defaults #442', () => {
  it('persists the current user and combined type when a new draft omits both', async () => {
    const now = new Date('2026-08-30T00:00:00.000Z')
    const agentTaskCreate = jest.fn().mockResolvedValue({ id: 'task-1' })
    const tx = {
      agentTask: { create: agentTaskCreate },
      aiCreateTask: {
        findUniqueOrThrow: jest.fn().mockImplementation(() => {
          const snapshot =
            agentTaskCreate.mock.calls[0]?.[0].data.departureCreationTask.create.draft.create
              .snapshot
          return Promise.resolve({
            id: 'task-1',
            currentPhase: AiCreatePhase.BASIC_INFO,
            departureId: null,
            draft: {
              id: 'draft-1',
              taskId: 'task-1',
              version: 1,
              snapshot,
              createdAt: now,
              updatedAt: now,
            },
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
          })
        }),
      },
    }
    const service = new AiCreateTaskService(
      {
        $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    const result = await service.saveDraft('org-1', 'user-1', {
      draft: { mode: DepartureCreationDraftMode.MANUAL, routeName: '川西' },
    })

    expect(result.draft?.snapshot).toMatchObject({
      ownerUserId: 'user-1',
      departureType: DepartureType.COMBINED,
    })
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
      agentTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          ownerUserId,
          status: AgentTaskStatus.active,
        }),
      },
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

describe('source-order proposal entry', () => {
  it('reuses trusted proposal validation and refuses an unavailable partner without filling missing fields', async () => {
    const task = jest.fn().mockResolvedValue({ id: 'task-1' })
    const partner = jest.fn().mockResolvedValue(null)
    const service = new AiCreateTaskService(
      { agentTask: { findFirst: task }, partner: { findFirst: partner } } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    )
    const caller = { userId: 'user-1', organizationId: 'org-1', taskId: 'task-1', runId: 'run-1', conversationId: 'conv-1', inputBatchId: 'batch-1', attemptId: 'attempt-1' }
    const input = { taskId: 'task-1', runId: 'run-1', objectVersion: 1780000000000,
      reviewPackageId: 'review-source', expectedPackageVersion: 2,
      confirmationUnit: 'source_order_create', candidates: [{ fieldKey: 'partnerId', proposedValue: 'partner-1', clarity: 'clear',
        evidence: [{ kind: 'user_message', sequence: 1, excerpt: '客户甲' }] }] }
    const validate = jest.spyOn(service, 'proposeReviewPackageForAgent').mockResolvedValue({
      status: 'accepted', ...input, normalizedProposal: {
        schemaVersion: 1, normalizationVersion: 'unicode-nfc-whitespace-v1', policyVersion: 'evidence-authenticity-v1',
        candidates: [], evidenceCatalog: [],
      },
    } as never)
    await expect(service.proposeSourceOrderReviewPackageForAgent(caller, input)).resolves.toMatchObject({ status: 'rejected', errors: [{ code: 'PARTNER_INVALID' }] })
    expect(validate).toHaveBeenCalledWith(caller, input)
    expect(partner).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'partner-1', organizationId: 'org-1', status: 'active' } }))
    partner.mockResolvedValue({ id: 'partner-1' })
    await expect(service.proposeSourceOrderReviewPackageForAgent(caller, input)).resolves.toMatchObject({ status: 'accepted', payloadSchema: 'source_order.create@v1', candidates: input.candidates, reviewPackageId: 'review-source', expectedPackageVersion: 2 })
    validate.mockRejectedValueOnce(new ForbiddenException('仅任务创建者可提交审核包'))
    await expect(service.proposeSourceOrderReviewPackageForAgent(caller, input)).rejects.toThrow(ForbiddenException)
    task.mockResolvedValue(null)
    await expect(service.proposeSourceOrderReviewPackageForAgent(caller, input)).rejects.toThrow('发团协作任务不存在')
  })
})
