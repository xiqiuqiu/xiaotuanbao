import { z } from 'zod'
import {
  AgentDefinitionRegistry,
  CapabilityDefinitionRegistry,
  capabilityGrantResolver,
  requestContextSchema,
  type AgentDefinition,
  type CapabilityDefinition,
} from './agent-platform'

const readCapability: CapabilityDefinition = {
  key: 'departure.task-context.read',
  version: 2,
  toolName: 'getTaskContext',
  kind: 'read',
  risk: 'low',
  requiredPermissionKeys: ['departure:write'],
  requiredObjectScopes: [{ kind: 'ai_create_task', idFromContext: 'taskId' }],
  inputSchema: z.object({}),
  outputSchema: z.object({ taskId: z.string() }),
  contextSchema: requestContextSchema,
}

const proposeCapability: CapabilityDefinition = {
  ...readCapability,
  key: 'departure.review-package.propose',
  version: 1,
  toolName: 'proposeReviewPackage',
  kind: 'propose',
  risk: 'medium',
  entitlementKey: 'module:departure',
}

const agentDefinition: AgentDefinition = {
  key: 'departure.create',
  version: 1,
  name: 'AI 建团助手',
  instructions: 'test',
  capabilities: [
    { key: readCapability.key, version: readCapability.version },
    { key: proposeCapability.key, version: proposeCapability.version },
  ],
}

const requestContext = requestContextSchema.parse({
  organizationId: 'org-1',
  userId: 'user-1',
  taskId: 'task-1',
  runId: 'run-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  agentDefinition: { key: 'departure.create', version: 1 },
  objectScopes: [{ organizationId: 'org-1', kind: 'ai_create_task', id: 'task-1' }],
})

describe('Agent 平台注册表', () => {
  it('按稳定 key 与版本注册并精确读取 Definition', () => {
    const agents = new AgentDefinitionRegistry([agentDefinition])
    const capabilities = new CapabilityDefinitionRegistry([readCapability, proposeCapability])

    expect(agents.get({ key: 'departure.create', version: 1 })).toBe(agentDefinition)
    expect(capabilities.get({ key: 'departure.task-context.read', version: 2 })).toBe(readCapability)
    expect(() => agents.get({ key: 'departure.create', version: 2 })).toThrow('未注册')
  })

  it('拒绝重复版本和不稳定 key', () => {
    expect(() => new AgentDefinitionRegistry([agentDefinition, agentDefinition])).toThrow('重复')
    expect(() =>
      new CapabilityDefinitionRegistry([{ ...readCapability, key: 'Get Task Context' }]),
    ).toThrow()
  })
})

describe('CapabilityGrantResolver', () => {
  const capabilities = new CapabilityDefinitionRegistry([readCapability, proposeCapability])

  it('只授予 Agent 声明、User 权限、Organization、对象范围和风险策略的交集', () => {
    const result = capabilityGrantResolver.resolve({
      agentDefinition,
      capabilities,
      requestContext,
      user: { organizationId: 'org-1', permissionKeys: ['departure:write'] },
      entitlements: { status: 'available', keys: ['module:departure'] },
      riskPolicy: { allowedRisks: ['low', 'medium'] },
    })

    expect(result.granted).toEqual(agentDefinition.capabilities)
    expect(result.denied).toEqual([])
  })

  it.each([
    ['USER_PERMISSION_DENIED', { user: { organizationId: 'org-1', permissionKeys: [] } }],
    ['CROSS_ORGANIZATION', { user: { organizationId: 'org-2', permissionKeys: ['departure:write'] } }],
    [
      'OBJECT_SCOPE_DENIED',
      {
        requestContext: requestContextSchema.parse({
          ...requestContext,
          objectScopes: [{ organizationId: 'org-1', kind: 'ai_create_task', id: 'task-other' }],
        }),
      },
    ],
    ['RISK_POLICY_DENIED', { riskPolicy: { allowedRisks: ['low'] } }],
  ] as const)('拒绝 %s 的 Capability', (reason, override) => {
    const result = capabilityGrantResolver.resolve({
      agentDefinition,
      capabilities,
      requestContext,
      user: { organizationId: 'org-1', permissionKeys: ['departure:write'] },
      entitlements: { status: 'available', keys: ['module:departure'] },
      riskPolicy: { allowedRisks: ['low', 'medium'] },
      ...override,
    })

    expect(result.denied.some((item) => item.reason === reason)).toBe(true)
  })

  it('Entitlement 尚未接入时显式 unavailable，且不授予依赖该开通键的 Capability', () => {
    const result = capabilityGrantResolver.resolve({
      agentDefinition,
      capabilities,
      requestContext,
      user: { organizationId: 'org-1', permissionKeys: ['departure:write'] },
      entitlements: { status: 'unavailable' },
      riskPolicy: { allowedRisks: ['low', 'medium'] },
    })

    expect(result.entitlementStatus).toBe('unavailable')
    expect(result.granted).toEqual([{ key: readCapability.key, version: readCapability.version }])
    expect(result.denied).toContainEqual({
      capability: { key: proposeCapability.key, version: proposeCapability.version },
      reason: 'ENTITLEMENT_UNAVAILABLE',
    })
  })

  it('不授予服务端当前标记为 unavailable 的 Capability', () => {
    const result = capabilityGrantResolver.resolve({
      agentDefinition,
      capabilities,
      requestContext,
      user: { organizationId: 'org-1', permissionKeys: ['departure:write'] },
      entitlements: { status: 'available', keys: ['module:departure'] },
      riskPolicy: { allowedRisks: ['low', 'medium'] },
      availableCapabilities: [agentDefinition.capabilities[0]],
    })

    expect(result.granted).toEqual([agentDefinition.capabilities[0]])
    expect(result.denied[0]?.reason).toBe('CAPABILITY_UNAVAILABLE')
  })
})

describe('可信 RequestContext', () => {
  it('拒绝未知字段，避免模型参数伪装服务端身份或版本', () => {
    expect(() => requestContextSchema.parse({ ...requestContext, modelOrganizationId: 'org-2' })).toThrow()
  })

  it('无任务会话可以省略 taskId 与 runId', () => {
    const { taskId: _taskId, runId: _runId, ...taskless } = requestContext
    expect(requestContextSchema.parse(taskless)).toEqual({
      ...taskless,
      grantedCapabilities: [],
      entitlementStatus: 'unavailable',
    })
  })
})
