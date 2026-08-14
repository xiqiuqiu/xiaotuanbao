import {
  AiConversationStatus,
  AiCreateTaskStatus,
  AiInputBatchStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  DepartureMaterialStatus,
} from '@prisma/client'
import { AiConversationService } from './ai-conversation.service'
import { DepartureMaterialService } from './departure-material.service'

const organizationId = 'org-1'
const userId = 'user-1'
const taskId = 'task-1'
const conversationId = 'conv-1'
const now = new Date('2026-08-14T00:00:00.000Z')
const file = {
  originalname: '团期.png',
  mimetype: 'image/png',
  buffer: Buffer.from('fake-png-bytes'),
  size: Buffer.from('fake-png-bytes').byteLength,
}
const stored = {
  id: 'stored-1',
  originalFilename: file.originalname,
  contentType: 'image/png',
  sizeBytes: file.size,
  createdAt: now.toISOString(),
  createdByUserId: userId,
}

function createHarness(options?: {
  transactionImpl?: (tx: Record<string, unknown>) => Promise<unknown>
}) {
  const callOrder: string[] = []
  const storedObjectService = {
    upload: jest.fn(async () => {
      callOrder.push('upload')
      return stored
    }),
    delete: jest.fn(async () => {
      callOrder.push('delete')
    }),
  }

  const task = {
    id: taskId,
    organizationId,
    creatorUserId: userId,
    status: AiCreateTaskStatus.in_progress,
    draft: { id: 'draft-1' },
  }
  const conversation = {
    id: conversationId,
    taskId,
    organizationId,
    creatorUserId: userId,
    status: AiConversationStatus.open,
  }

  const departureMaterial = {
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'mat-1',
      status: DepartureMaterialStatus.queued,
      statusVersion: 1,
      createdAt: now,
      updatedAt: now,
      ...data,
    })),
  }
  const departureMaterialParseRun = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'run-1',
      ...data,
    })),
  }
  const aiCreateTask = {
    findFirst: jest.fn().mockResolvedValue(task),
  }
  const aiConversation = {
    findFirst: jest.fn().mockResolvedValue(conversation),
    update: jest.fn().mockResolvedValue(conversation),
  }
  const aiCreateIdempotencyRecord = {
    upsert: jest.fn().mockResolvedValue({
      id: 'idem-1',
      organizationId,
      taskId,
      requestHash: 'will-be-overwritten-by-real-hash-check',
      completedAt: null,
      resultJson: null,
    }),
    update: jest.fn().mockResolvedValue({}),
  }
  const aiInputBatch = {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(
      async ({
        data,
      }: {
        data: {
          materials?: {
            create: Array<{
              required: boolean
              parseResultVersion: number | null
              materialId: string
              organizationId: string
            }>
          }
        } & Record<string, unknown>
      }) => ({
        id: 'batch-1',
        status: AiInputBatchStatus.waiting_for_materials,
        conversationVersion: 1,
        createdAt: now,
        updatedAt: now,
        ...data,
        materials: (data.materials?.create ?? []).map((row, index) => ({
          id: `dep-${index}`,
          required: row.required,
          parseResultVersion: row.parseResultVersion,
          materialId: row.materialId,
          organizationId: row.organizationId,
        })),
      }),
    ),
  }
  const aiConversationEvent = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `event-${String(data.sequence)}`,
      createdAt: now,
      ...data,
    })),
  }
  const aiWorkflowJob = {
    upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
      id: 'job-1',
      status: AiWorkflowJobStatus.pending,
      type: AiWorkflowJobType.material_parse,
      ...create,
    })),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn(),
  }

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    aiCreateTask,
    aiConversation,
    aiCreateIdempotencyRecord,
    aiInputBatch,
    aiConversationEvent,
    departureMaterial,
    departureMaterialParseRun,
    aiWorkflowJob,
  }

  const prisma = {
    departureMaterial,
    aiCreateIdempotencyRecord: {
      ...aiCreateIdempotencyRecord,
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      callOrder.push('transaction-start')
      if (options?.transactionImpl) {
        return options.transactionImpl(tx as unknown as Record<string, unknown>)
      }
      return callback(tx)
    }),
  }

  // upsert 返回的 requestHash 必须与 sendText 计算值一致，否则会 409。
  // 用 upsert 的 create.requestHash 回填，避免测试依赖哈希实现细节。
  aiCreateIdempotencyRecord.upsert.mockImplementation(
    async ({ create }: { create: { requestHash: string; taskId: string } }) => ({
      id: 'idem-1',
      organizationId,
      taskId: create.taskId,
      requestHash: create.requestHash,
      completedAt: null,
      resultJson: null,
    }),
  )

  const materialService = new DepartureMaterialService(
    prisma as never,
    storedObjectService as never,
    {} as never,
  )
  const service = new AiConversationService(
    prisma as never,
    {
      get: (key: string) => {
        if (key === 'app.aiCreateAssist.enabled') return true
        if (key === 'app.aiCreateAssist.userIds') return []
        return undefined
      },
    } as never,
    { getPermissionKeysForUser: async () => ['departure:write'] } as never,
    { publish: jest.fn() } as never,
    materialService,
  )

  return { service, storedObjectService, callOrder, prisma, tx }
}

describe('AiConversationService.sendText attachment upload', () => {
  it('uploads attachments before opening the conversation transaction', async () => {
    const { service, storedObjectService, callOrder } = createHarness()

    await service.sendText(
      organizationId,
      userId,
      taskId,
      conversationId,
      '请根据附件整理',
      'idem-1',
      [file],
    )

    expect(storedObjectService.upload).toHaveBeenCalledWith(organizationId, userId, {
      ...file,
      mimetype: 'image/png',
    })
    expect(callOrder.indexOf('upload')).toBeGreaterThanOrEqual(0)
    expect(callOrder.indexOf('transaction-start')).toBeGreaterThan(callOrder.indexOf('upload'))
  })

  it('deletes uploaded stored objects when the conversation transaction rolls back', async () => {
    const rollback = new Error('Transaction already closed: A query cannot be executed on an expired transaction')
    const { service, storedObjectService } = createHarness({
      transactionImpl: async () => {
        throw rollback
      },
    })

    await expect(
      service.sendText(
        organizationId,
        userId,
        taskId,
        conversationId,
        '请根据附件整理',
        'idem-1',
        [file],
      ),
    ).rejects.toThrow(rollback)

    expect(storedObjectService.upload).toHaveBeenCalled()
    expect(storedObjectService.delete).toHaveBeenCalledWith(organizationId, stored.id)
  })

  it('deletes a pre-uploaded object when the task already has the same material', async () => {
    const existing = {
      id: 'mat-existing',
      status: DepartureMaterialStatus.queued,
      parseRuns: [] as Array<{ resultVersion: number }>,
    }
    const { service, storedObjectService, tx } = createHarness()
    tx.departureMaterial.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing)

    await service.sendText(
      organizationId,
      userId,
      taskId,
      conversationId,
      '请根据附件整理',
      'idem-1',
      [file],
    )

    expect(storedObjectService.upload).toHaveBeenCalled()
    expect(storedObjectService.delete).toHaveBeenCalledWith(organizationId, stored.id)
    expect(tx.departureMaterial.create).not.toHaveBeenCalled()
  })

  it('deletes already uploaded objects if a later attachment upload fails', async () => {
    const secondFile = {
      originalname: '行程.png',
      mimetype: 'image/png',
      buffer: Buffer.from('other-png-bytes'),
      size: Buffer.from('other-png-bytes').byteLength,
    }
    const uploadError = new Error('S3 unavailable')
    const { service, storedObjectService } = createHarness()
    storedObjectService.upload
      .mockResolvedValueOnce(stored)
      .mockRejectedValueOnce(uploadError)

    await expect(
      service.sendText(
        organizationId,
        userId,
        taskId,
        conversationId,
        '请根据附件整理',
        'idem-1',
        [file, secondFile],
      ),
    ).rejects.toThrow(uploadError)

    expect(storedObjectService.delete).toHaveBeenCalledWith(organizationId, stored.id)
  })
})
