import {
  AI_CREATE_AGENT_DEFINITION_REF,
  DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
} from '@xiaotuanbao/ai-contracts'
import { AiWorkflowProcessor } from './ai-workflow.processor'

describe('workflow collaboration authorization', () => {
  const job = { taskId: 'task-1', organizationId: 'org-1', inputBatch: { creatorUserId: 'user-1' } }
  const route = { kind: 'execution_definition', source: 'task', agentDefinition: DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF }
  function setup(permissionKeys: string[], userAvailable = true) {
    const findFirst = jest.fn().mockResolvedValue(userAvailable ? { id: 'user-1' } : null)
    const processor = Object.assign(Object.create(AiWorkflowProcessor.prototype), {
      prisma: { user: { findFirst } },
      authService: { getPermissionKeysForUser: jest.fn().mockResolvedValue(permissionKeys) },
      configService: { get: (key: string) => key === 'app.aiCreateAssist.enabled' ? true : [] },
    })
    return { processor, findFirst }
  }

  it('lets a finance user reach collaboration preparation with only page access', async () => {
    const { processor } = setup(['/departure'])
    await expect(processor.recheckAuthorization(job, route))
      .resolves.toEqual({ ok: true, permissionKeys: ['/departure'] })
  })

  it('does not let page-only access start a departure creation attempt', async () => {
    const { processor } = setup(['/departure'])
    await expect(processor.recheckAuthorization(job, { ...route, agentDefinition: AI_CREATE_AGENT_DEFINITION_REF }))
      .resolves.toEqual({ ok: false, errorCode: 'PERMISSION_DENIED' })
  })

  it('rejects a later attempt after page access is revoked', async () => {
    const { processor } = setup([])
    await expect(processor.recheckAuthorization(job, route))
      .resolves.toEqual({ ok: false, errorCode: 'PERMISSION_DENIED' })
  })

  it('checks the initiating user in the same active organization before granting anything', async () => {
    const { processor, findFirst } = setup(['/departure'], false)
    await expect(processor.recheckAuthorization(job, route))
      .resolves.toEqual({ ok: false, errorCode: 'PERMISSION_DENIED' })
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: 'user-1', organizationId: 'org-1', status: 'enabled', deletedAt: null,
      organization: { deletedAt: null, status: 'enabled' },
    }) }))
  })
})
