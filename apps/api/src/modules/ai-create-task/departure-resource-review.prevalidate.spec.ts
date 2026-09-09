import { AgentTaskStatus, AgentTaskType, AiAgentAttemptStatus } from '@prisma/client'
import { AiCreateTaskService } from './ai-create-task.service'

const organizationId = 'org-1'
const userId = 'user-1'
const taskId = 'task-1'
const runId = 'run-1'
const conversationId = 'conv-1'
const inputBatchId = 'batch-1'
const attemptId = 'attempt-1'
const contextManifestId = 'manifest-1'
const eventId = 'event-3'
const departureUpdatedAt = new Date('2026-09-07T00:00:00.000Z')
const objectVersion = departureUpdatedAt.getTime()

const caller = {
  userId,
  organizationId,
  taskId,
  runId,
  conversationId,
  inputBatchId,
  attemptId,
  contextManifestId,
}

const evidence = [{ kind: 'user_message' as const, sequence: 3, excerpt: '全程保险 1200 元，覆盖 4月2日至4月6日' }]

function candidates(overrides: Record<string, string | number> = {}) {
  const values = {
    resourceKind: 'insurance',
    supplierId: 'sup-1',
    title: '全程旅行保险',
    amountCents: 120000,
    ...overrides,
  }
  return [
    {
      fieldKey: 'resourceKind' as const,
      proposedValue: values.resourceKind as 'insurance',
      clarity: 'clear' as const,
      evidence,
    },
    {
      fieldKey: 'supplierId' as const,
      proposedValue: String(values.supplierId),
      clarity: 'clear' as const,
      evidence,
    },
    {
      fieldKey: 'title' as const,
      proposedValue: String(values.title),
      clarity: 'clear' as const,
      evidence,
    },
    {
      fieldKey: 'amountCents' as const,
      proposedValue: Number(values.amountCents),
      clarity: 'clear' as const,
      evidence,
    },
  ]
}

function createService() {
  const writes = {
    actionCreate: jest.fn(),
    reviewCreate: jest.fn(),
  }
  const store = {
    agentTask: {
      findFirst: jest.fn().mockResolvedValue({
        id: taskId,
        type: AgentTaskType.departure_collaboration,
        ownerUserId: userId,
        status: AgentTaskStatus.active,
        departure: { id: 'departure-1', updatedAt: departureUpdatedAt },
      }),
    },
    aiAgentAttempt: {
      findFirst: jest.fn().mockResolvedValue({
        id: attemptId,
        status: AiAgentAttemptStatus.running,
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: attemptId,
        contextManifestId,
        conversationId,
        inputBatchId,
        organizationId,
      }),
    },
    aiContextManifest: {
      findUnique: jest.fn().mockResolvedValue({
        id: contextManifestId,
        conversationId,
        inputBatchId,
        eventSequences: [1, 3],
        materialVersions: [],
        excerptDigests: [],
      }),
    },
    aiConversationEvent: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: eventId,
          conversationId,
          sequence: 3,
          kind: 'user_message',
          payload: { text: '请录入全程保险 1200 元，覆盖 4月2日至4月6日' },
        },
      ]),
    },
    conversationSourceParseRun: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    supplier: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    aiAction: { create: writes.actionCreate, findFirst: jest.fn(), count: jest.fn() },
    aiReviewPackage: {
      create: writes.reviewCreate,
      findFirst: jest.fn().mockResolvedValue({
        id: 'review-1',
        status: 'pending',
        version: 2,
        confirmationUnit: 'departure_resource',
        payloadSchema: 'departure.departure_resource@v1',
        targetKind: 'departure',
        targetId: 'departure-1',
        baseObjectVersion: objectVersion,
        baselineSnapshot: {},
        userCorrections: {},
        candidates: candidates().map((candidate) => ({
          ...candidate,
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: '旧批次的保险报价' }],
        })),
      }),
      count: jest.fn(),
    },
  }
  const prisma = {
    ...store,
    $transaction: jest.fn(async (callback: (client: typeof store) => Promise<unknown>) =>
      callback(store),
    ),
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
  return { service, prisma, writes }
}

describe('AiCreateTaskService.proposeDepartureResourceReviewPackageForAgent #450', () => {
  it('accepts a material-backed proposal without writing Action or Review Package', async () => {
    const { service, writes } = createService()

    const result = await service.proposeDepartureResourceReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion,
      candidates: [
        ...candidates(),
        {
          fieldKey: 'notes' as const,
          proposedValue: '覆盖 4月2日至4月6日',
          clarity: 'clear' as const,
          evidence,
        },
      ],
      reviewPackageId: 'review-1',
      expectedPackageVersion: 2,
    })

    expect(result).toMatchObject({
      status: 'accepted',
      confirmationUnit: 'departure_resource',
      payloadSchema: 'departure.departure_resource@v1',
      reviewPackageId: 'review-1',
      expectedPackageVersion: 2,
      objectVersion,
    })
    expect(writes.actionCreate).not.toHaveBeenCalled()
    expect(writes.reviewCreate).not.toHaveBeenCalled()
  })

  it('validates an amount-only revision against its scoped pending item while checking only new evidence', async () => {
    const { service, prisma } = createService()
    const changed = candidates().filter((candidate) => candidate.fieldKey === 'amountCents')
    await expect(
      service.proposeDepartureResourceReviewPackageForAgent(caller, {
        taskId,
        runId,
        objectVersion,
        candidates: changed,
        reviewPackageId: 'review-1',
        expectedPackageVersion: 2,
      }),
    ).resolves.toMatchObject({ status: 'accepted', candidates: changed })
    expect(prisma.aiReviewPackage.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'review-1',
        organizationId,
        taskId,
        conversationId,
        status: 'pending',
        version: 2,
        confirmationUnit: 'departure_resource',
        targetKind: 'departure',
        targetId: 'departure-1',
        payloadSchema: 'departure.departure_resource@v1',
      },
    })
    prisma.aiReviewPackage.findFirst.mockResolvedValue(null)
    await expect(
      service.proposeDepartureResourceReviewPackageForAgent(caller, {
        taskId,
        runId,
        objectVersion,
        candidates: changed,
        reviewPackageId: 'review-1',
        expectedPackageVersion: 2,
      }),
    ).rejects.toThrow()
  })

  it('retains an unmatched supplier candidate for review without writing formal resources (R7)', async () => {
    const { service, writes } = createService()
    const result = await service.proposeDepartureResourceReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion,
      candidates: candidates({ supplierId: 'unmatched-supplier' }),
    })
    expect(result).toMatchObject({ status: 'accepted' })
    expect(writes.actionCreate).not.toHaveBeenCalled()
    expect(writes.reviewCreate).not.toHaveBeenCalled()
  })

  it('accepts a hotel whole quote with multi-service notes instead of forcing outsource', async () => {
    const { service } = createService()
    const result = await service.proposeDepartureResourceReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion,
      candidates: [
        ...candidates({ resourceKind: 'hotel', title: '川西接待整体报价', amountCents: 880000 }),
        {
          fieldKey: 'notes' as const,
          proposedValue: '含住宿、接送、用餐',
          clarity: 'clear' as const,
          evidence,
        },
      ],
    })
    expect(result).toMatchObject({ status: 'accepted' })
  })

  it('accepts notes-only and fills name and kind from the material instead of failing the batch', async () => {
    const { service, prisma } = createService()
    const namedText = '请录入验收450-全程地接，覆盖4月2日至4月6日，金额待确认'
    prisma.aiConversationEvent.findMany.mockResolvedValue([
      {
        id: eventId,
        conversationId,
        sequence: 3,
        kind: 'user_message',
        payload: { text: namedText },
      },
    ])
    const named = [{ kind: 'user_message' as const, sequence: 3, excerpt: namedText }]
    const result = await service.proposeDepartureResourceReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion,
      candidates: [
        {
          fieldKey: 'notes' as const,
          proposedValue: '覆盖4月2日至4月6日',
          clarity: 'clear' as const,
          evidence: named,
        },
      ],
    })
    expect(result.status).toBe('accepted')
    if (result.status !== 'accepted') throw new Error('expected accepted')
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'title', proposedValue: '验收450-全程地接' }),
        expect.objectContaining({ fieldKey: 'resourceKind', proposedValue: 'outsource' }),
      ]),
    )
  })

  it('accepts explicit 种类其他 and 备用资源-其他类 from the 0909 backtest copy', async () => {
    const { service, prisma } = createService()
    const packagedText =
      '请在当前已有发团录入一条发团级资源。供应商使用“备用资源-其他类”。资源名称“回测0909-全程地接”，资源种类其他，约定总价860元。这是覆盖2026-08-29到2026-09-01的整体地接费。'
    prisma.aiConversationEvent.findMany.mockResolvedValue([
      {
        id: eventId,
        conversationId,
        sequence: 3,
        kind: 'user_message',
        payload: { text: packagedText },
      },
    ])
    prisma.supplier.findFirst.mockResolvedValue({ name: '备用资源-其他类' })
    const packaged = [{ kind: 'user_message' as const, sequence: 3, excerpt: packagedText }]
    const result = await service.proposeDepartureResourceReviewPackageForAgent(caller, {
      taskId,
      runId,
      objectVersion,
      candidates: [
        {
          fieldKey: 'resourceKind' as const,
          proposedValue: 'other',
          clarity: 'clear' as const,
          evidence: packaged,
        },
        {
          fieldKey: 'supplierId' as const,
          proposedValue: 'sup-fallback',
          clarity: 'clear' as const,
          evidence: packaged,
        },
        {
          fieldKey: 'title' as const,
          proposedValue: '回测0909-全程地接',
          clarity: 'clear' as const,
          evidence: packaged,
        },
        {
          fieldKey: 'amountCents' as const,
          proposedValue: 86000,
          clarity: 'clear' as const,
          evidence: packaged,
        },
      ],
    })
    expect(result).toMatchObject({ status: 'accepted' })
    if (result.status !== 'accepted') throw new Error('expected accepted')
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'title', proposedValue: '回测0909-全程地接' }),
        expect.objectContaining({ fieldKey: 'resourceKind', proposedValue: 'other' }),
        expect.objectContaining({ fieldKey: 'supplierId', proposedValue: 'sup-fallback' }),
        expect.objectContaining({ fieldKey: 'amountCents', proposedValue: 86000 }),
      ]),
    )
  })
})
