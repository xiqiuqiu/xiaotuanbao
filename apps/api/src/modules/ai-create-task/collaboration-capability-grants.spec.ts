import {
  DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
  DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF,
  departureCollaborationCapabilityDefinitionRegistry,
  INITIAL_FINANCE_PROPOSE_CAPABILITY_REF,
  requestContextSchema,
} from '@xiaotuanbao/ai-contracts'
import { resolveCollaborationCapabilityGrants } from './collaboration-capability-grants'

const context = requestContextSchema.parse({
  organizationId: 'org-1', userId: 'user-1', taskId: 'task-1', runId: 'attempt-1',
  conversationId: 'conv-1', inputBatchId: 'batch-1', attemptId: 'attempt-1',
  contextManifestId: 'manifest-1', agentDefinition: DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
  executionGoal: 'resolve_items',
  objectScopes: [
    { organizationId: 'org-1', kind: 'agent_task', id: 'task-1' },
    { organizationId: 'org-1', kind: 'ai_create_task', id: 'task-1' },
    { organizationId: 'org-1', kind: 'agent_conversation', id: 'conv-1' },
  ],
})

describe('collaboration capability permissions', () => {
  afterEach(() => jest.restoreAllMocks())

  it('grants formal reads and initial finance, but no resource, guest or itinerary write to /departure-only users', () => {
    const result = resolveCollaborationCapabilityGrants(context, ['/departure'])
    expect(result.granted).toEqual(expect.arrayContaining([
      { key: 'departure.task-context.read', version: 2 },
      INITIAL_FINANCE_PROPOSE_CAPABILITY_REF,
    ]))
    expect(result.granted.filter((ref) => ref.key.endsWith('.propose'))).toEqual([INITIAL_FINANCE_PROPOSE_CAPABILITY_REF])
    expect(result.denied).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF, reason: 'USER_PERMISSION_DENIED' }),
    ]))
  })

  it('keeps all declared collaboration capabilities for a departure writer with page access', () => {
    const result = resolveCollaborationCapabilityGrants(context, ['/departure', 'departure:write'])
    expect(result.granted).toContainEqual(DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF)
    expect(result.granted).toContainEqual(INITIAL_FINANCE_PROPOSE_CAPABILITY_REF)
    expect(result.denied).toEqual([])
  })

  it('does not grant finance or formal reads after page access is revoked', () => {
    const result = resolveCollaborationCapabilityGrants(context, [])
    expect(result.granted).not.toContainEqual(INITIAL_FINANCE_PROPOSE_CAPABILITY_REF)
    expect(result.granted).not.toContainEqual({ key: 'departure.task-context.read', version: 2 })
  })

  it('does not grant another high-risk capability just because the financial capability is allowed', () => {
    const registry = departureCollaborationCapabilityDefinitionRegistry
    const originalGet = registry.get.bind(registry)
    jest.spyOn(registry, 'get').mockImplementation((ref) => {
      const definition = originalGet(ref)
      return ref.key === DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF.key
        ? { ...definition, risk: 'high' }
        : definition
    })
    const result = resolveCollaborationCapabilityGrants(context, ['/departure', 'departure:write'])
    expect(result.granted).toContainEqual(INITIAL_FINANCE_PROPOSE_CAPABILITY_REF)
    expect(result.granted).not.toContainEqual(DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF)
    expect(result.denied).toContainEqual({ capability: DEPARTURE_SEGMENT_RESOURCE_PROPOSE_CAPABILITY_REF, reason: 'CAPABILITY_UNAVAILABLE' })
  })

  it('does not grant finance when the task scope belongs to another organization', () => {
    const result = resolveCollaborationCapabilityGrants({ ...context,
      objectScopes: context.objectScopes.map((scope) => ({ ...scope, organizationId: 'org-other' })),
    }, ['/departure'])
    expect(result.granted).not.toContainEqual(INITIAL_FINANCE_PROPOSE_CAPABILITY_REF)
    expect(result.denied).toContainEqual({ capability: INITIAL_FINANCE_PROPOSE_CAPABILITY_REF, reason: 'OBJECT_SCOPE_DENIED' })
  })
})
