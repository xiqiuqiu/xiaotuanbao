import { ExecutionContext } from '@nestjs/common'
import {
  AI_CREATE_AGENT_DEFINITION_REF,
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
} from '@xiaotuanbao/ai-contracts'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import { AiOperationDelegationGuard } from './ai-operation-delegation.guard'

function contextWithBearer(token: string): {
  ctx: ExecutionContext
  request: { header: (name: string) => string; user?: unknown }
} {
  const request: { header: (name: string) => string; user?: unknown } = {
    header: (name: string) => (name === 'authorization' ? `Bearer ${token}` : ''),
  }
  return {
    request,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext,
  }
}

describe('AiOperationDelegationGuard', () => {
  const payload = {
    typ: 'ai-op-delegation' as const,
    sub: 'user-1',
    organizationId: 'org-1',
    taskId: 'task-1',
    runId: 'attempt-1',
    conversationId: 'conv-1',
    inputBatchId: 'batch-1',
    attemptId: 'attempt-1',
    contextManifestId: 'manifest-1',
    agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
    grantedCapabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
    entitlementStatus: 'unavailable' as const,
    objectScopes: [{ organizationId: 'org-1', kind: 'ai_create_task', id: 'task-1' }],
  }

  function createGuard(options?: {
    payload?: {
      typ?: typeof payload.typ
      sub?: string
      organizationId?: string
      taskId?: string
      runId?: string
      conversationId?: string
      inputBatchId?: string
      attemptId?: string
      contextManifestId?: string
      agentDefinition?: { key: string; version: number }
      grantedCapabilities?: Array<{ key: string; version: number }>
      entitlementStatus?: typeof payload.entitlementStatus
      objectScopes?: Array<{ organizationId: string; kind: string; id: string }>
    } | null
    attempt?: {
      id?: string
      status: string
      activityRun?: { status: string }
      agentDefinitionKey?: string
      agentDefinitionVersion?: number
      grantedCapabilities?: unknown
    } | null
    permissionKeys?: string[]
  }) {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue(
        options?.payload === null ? payload : { ...payload, ...options?.payload },
      ),
    }
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1', organizationId: 'org-1' }),
      },
      aiAgentAttempt: {
        findFirst: jest.fn().mockResolvedValue(
          options?.attempt === undefined
            ? {
                id: 'attempt-1',
                status: 'running',
                activityRun: { status: 'running' },
                agentDefinitionKey: AI_CREATE_AGENT_DEFINITION_REF.key,
                agentDefinitionVersion: AI_CREATE_AGENT_DEFINITION_REF.version,
                grantedCapabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
              }
            : options.attempt,
        ),
      },
    }
    const authService = {
      getPermissionKeysForUser: jest.fn().mockResolvedValue(
        options?.permissionKeys ?? ['departure:write'],
      ),
    }
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'app.aiCreateAssist.enabled') return true
        if (key === 'app.aiCreateAssist.userIds') return []
        return undefined
      }),
      getOrThrow: jest.fn().mockReturnValue('deleg-secret'),
    }
    const guard = new AiOperationDelegationGuard(
      jwtService as never,
      prisma as never,
      authService as never,
      configService as never,
    )
    return { guard, prisma, authService }
  }

  it('rejects a window-shaped delegation that has a run but no running attempt', async () => {
    const { guard, prisma } = createGuard({
      payload: { attemptId: undefined, conversationId: undefined, inputBatchId: undefined },
    })
    const { ctx } = contextWithBearer('window-token')

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AiCollaborationHttpException)
    expect(prisma.aiAgentAttempt.findFirst).not.toHaveBeenCalled()
  })

  it('rejects when the attempt exists but is not running', async () => {
    const { guard, prisma } = createGuard({ attempt: null })
    const { ctx } = contextWithBearer('stale-attempt')

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AiCollaborationHttpException)
    expect(prisma.aiAgentAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'running' }),
      }),
    )
  })

  it('rejects when the attempt does not match the conversation, batch, or run', async () => {
    const { guard, prisma } = createGuard({ attempt: null })
    const { ctx } = contextWithBearer('mismatched')

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AiCollaborationHttpException)
    expect(prisma.aiAgentAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'attempt-1',
          status: 'running',
          conversationId: 'conv-1',
          inputBatchId: 'batch-1',
          taskId: 'task-1',
        }),
      }),
    )
  })

  it('rejects a delegation whose Capability versions differ from the persisted Attempt snapshot', async () => {
    const { guard } = createGuard({
      payload: {
        grantedCapabilities: [AI_CREATE_CAPABILITY_REFS_BY_TOOL.searchRouteTemplates],
      },
    })
    const { ctx } = contextWithBearer('tampered-capability-version')

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AiCollaborationHttpException)
  })

  it('rejects a task-bound token whose runId is not the attempt id', async () => {
    const { guard, prisma } = createGuard({
      payload: { runId: 'legacy-activity-run' },
    })
    const { ctx } = contextWithBearer('legacy-run-id')

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(AiCollaborationHttpException)
    expect(prisma.aiAgentAttempt.findFirst).not.toHaveBeenCalled()
  })

  it('accepts a Worker-shaped token bound to a running attempt', async () => {
    const { guard } = createGuard()
    const { ctx, request } = contextWithBearer('worker-token')

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(request.user).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      taskId: 'task-1',
      runId: 'attempt-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      attemptId: 'attempt-1',
      contextManifestId: 'manifest-1',
      agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
      grantedCapabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
      entitlementStatus: 'unavailable',
      objectScopes: [{ organizationId: 'org-1', kind: 'ai_create_task', id: 'task-1' }],
    })
  })

  it('accepts a taskless conversation token without departure write permission', async () => {
    const { guard, prisma, authService } = createGuard({
      payload: {
        taskId: undefined,
        runId: undefined,
        agentDefinition: { key: 'conversation.general', version: 1 },
        grantedCapabilities: [],
        objectScopes: [{ organizationId: 'org-1', kind: 'agent_conversation', id: 'conv-1' }],
      },
      attempt: {
        id: 'attempt-1',
        status: 'running',
        agentDefinitionKey: 'conversation.general',
        agentDefinitionVersion: 1,
        grantedCapabilities: [],
      },
      permissionKeys: [],
    })
    const { ctx, request } = contextWithBearer('taskless-token')

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(authService.getPermissionKeysForUser).not.toHaveBeenCalled()
    expect(prisma.aiAgentAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          taskId: null,
          conversationId: 'conv-1',
        }),
      }),
    )
    expect(request.user).toMatchObject({
      userId: 'user-1',
      organizationId: 'org-1',
      conversationId: 'conv-1',
      inputBatchId: 'batch-1',
      attemptId: 'attempt-1',
    })
    expect(request.user).not.toHaveProperty('taskId')
    expect(request.user).not.toHaveProperty('runId')
  })
})
