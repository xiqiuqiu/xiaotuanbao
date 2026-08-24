import { AiCreatePhase, DepartureCreationDraftMode } from '@xiaotuanbao/shared'
import { AgentTaskStatus } from '@prisma/client'
import { AiCreateTaskService } from './ai-create-task.service'

describe('AiCreateTaskService.startAssistSession', () => {
  const organizationId = 'org-1'
  const userId = 'user-1'
  const taskId = 'task-1'
  const now = new Date('2026-08-20T00:00:00.000Z')

  const task = {
    id: taskId,
    agentTask: {
      id: taskId,
      organizationId,
      ownerUserId: userId,
      status: AgentTaskStatus.active,
      statusVersion: 1,
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
      snapshot: { mode: DepartureCreationDraftMode.MANUAL, routeName: '川西' },
      createdAt: now,
      updatedAt: now,
    },
  }

  const conversation = {
    id: 'conv-1',
    status: 'open' as const,
    events: [],
    activeBatch: null,
  }

  function createService() {
    const findFirst = jest.fn().mockResolvedValue(task)
    const prisma = {
      aiCreateTask: { findFirst },
      $transaction: jest.fn(),
      aiCreateActivityRun: { findFirst: jest.fn(), create: jest.fn() },
    }
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'app.aiCreateAssist.enabled') return true
        if (key === 'app.aiCreateAssist.userIds') return []
        return undefined
      }),
      getOrThrow: jest.fn(),
    }
    const authService = {
      getPermissionKeysForUser: jest.fn().mockResolvedValue(['departure:write']),
    }
    const conversationService = {
      openOrResume: jest.fn().mockResolvedValue(conversation),
    }
    const service = new AiCreateTaskService(
      prisma as never,
      {} as never,
      {} as never,
      configService as never,
      authService as never,
      conversationService as never,
      {} as never,
    )
    return { service, prisma, conversationService }
  }

  it('returns only the task and conversation, without creating a run or signing a delegation', async () => {
    const { service, prisma, conversationService } = createService()

    const result = await service.startAssistSession(organizationId, userId, { taskId })

    expect(conversationService.openOrResume).toHaveBeenCalledWith(
      organizationId,
      userId,
      taskId,
      undefined,
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.aiCreateActivityRun.findFirst).not.toHaveBeenCalled()
    expect(prisma.aiCreateActivityRun.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      task: expect.objectContaining({ id: taskId, status: 'in_progress' }),
      conversation,
    })
    expect(result).not.toHaveProperty('runId')
    expect(result).not.toHaveProperty('delegationToken')
    expect(result).not.toHaveProperty('agentRuntimeUrl')
    expect(result).not.toHaveProperty('expiresAt')
  })
})
