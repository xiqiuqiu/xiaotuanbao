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
    runId: 'run-1',
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
    payload?: Partial<typeof payload> | null
    attempt?: { status: string; activityRun?: { status: string } } | null
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
      getPermissionKeysForUser: jest.fn().mockResolvedValue(['departure:write']),
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
    return { guard, prisma }
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
          activityRunId: 'run-1',
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

  it('accepts a Worker-shaped token bound to a running attempt', async () => {
    const { guard } = createGuard()
    const { ctx, request } = contextWithBearer('worker-token')

    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(request.user).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      taskId: 'task-1',
      runId: 'run-1',
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
})
