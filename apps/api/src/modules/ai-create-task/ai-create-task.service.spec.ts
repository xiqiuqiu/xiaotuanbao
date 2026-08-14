import { ConflictException } from '@nestjs/common'
import { AiCreatePhase, DepartureCreationDraftMode, DepartureType } from '@xiaotuanbao/shared'
import { AiCreateTaskStatus as PrismaTaskStatus, AiReviewPackageStatus } from '@prisma/client'
import { AiCreateTaskService } from './ai-create-task.service'

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
    status: AiReviewPackageStatus.pending,
    confirmationUnit: 'basic_info_draft',
    baseObjectVersion: 1,
    baselineSnapshot: snapshot,
    candidates: [
      {
        fieldKey: 'name',
        proposedValue: '候选团名',
        clarity: 'clear',
        status: 'pending',
        evidence: [{ kind: 'user_message', excerpt: '团名叫候选团名' }],
      },
    ],
    createdAt: now,
    updatedAt: now,
  }

  const task = {
    id: taskId,
    organizationId,
    creatorUserId: userId,
    status: PrismaTaskStatus.in_progress,
    currentPhase: AiCreatePhase.BASIC_INFO,
    departureId: null,
    createdAt: now,
    updatedAt: now,
  }

  function loadTask(include: { draft?: boolean; reviewPackages?: unknown }) {
    return {
      ...task,
      draft: include.draft ? { ...draft } : undefined,
      reviewPackages: include.reviewPackages ? [pendingPackage] : undefined,
    }
  }

  function createService(options?: { draftVersion?: number; updateCount?: number }) {
    const currentDraft = { ...draft, version: options?.draftVersion ?? 1 }
    const findFirst = jest.fn().mockImplementation(({ include }: { include: { draft?: boolean; reviewPackages?: unknown } }) =>
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

describe('AiCreateTaskService.getTaskContextForAgent materials', () => {
  const organizationId = 'org-1'
  const userId = 'user-1'
  const taskId = 'task-1'
  const runId = 'run-2'
  const now = new Date('2026-08-14T01:00:00.000Z')

  it('only returns archives created in the current assist window', async () => {
    const snapshot = {
      mode: DepartureCreationDraftMode.MANUAL,
      routeName: '川西',
    }
    const task = {
      id: taskId,
      organizationId,
      creatorUserId: userId,
      status: PrismaTaskStatus.in_progress,
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
      reviewPackages: [],
    }
    const windowMaterial = {
      id: 'mat-new',
      originalFilename: '行程.pdf',
      contentType: 'application/pdf',
      status: 'available',
      latestResultVersion: 1,
    }
    const listForTask = jest
      .fn()
      .mockResolvedValueOnce([
        { ...windowMaterial, id: 'mat-old' },
        windowMaterial,
      ])
      .mockResolvedValueOnce([windowMaterial])
    const isConsumePending = jest.fn().mockResolvedValue(false)
    const prisma = {
      aiCreateTask: { findFirst: jest.fn().mockResolvedValue(task) },
      aiCreateActivityRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: runId,
          taskId,
          organizationId,
          creatorUserId: userId,
          status: 'running',
          startedAt: now,
        }),
      },
    }
    const service = new AiCreateTaskService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { listForTask, isConsumePending } as never,
    )

    const result = await service.getTaskContextForAgent(
      { userId, organizationId, taskId, runId },
      { taskId, runId },
    )

    expect(listForTask).toHaveBeenNthCalledWith(2, organizationId, taskId, { createdAtGte: now })
    expect(isConsumePending).toHaveBeenCalledWith(organizationId, taskId, { createdAtGte: now })
    expect(result.materials).toEqual([
      {
        id: 'mat-new',
        originalFilename: '行程.pdf',
        contentType: 'application/pdf',
        status: 'available',
        latestResultVersion: 1,
      },
    ])
    expect(result.materialConsumePending).toBe(false)
  })
})
