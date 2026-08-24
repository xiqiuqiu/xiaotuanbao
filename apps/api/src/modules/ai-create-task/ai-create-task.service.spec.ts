import { ConflictException } from '@nestjs/common'
import { AiCreatePhase, DepartureCreationDraftMode, DepartureType } from '@xiaotuanbao/shared'
import { AgentTaskStatus, AiReviewPackageStatus } from '@prisma/client'
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
})
