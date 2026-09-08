import { capabilityGrantResolver, requestContextSchema } from './agent-platform'
import {
  DEPARTURE_COLLABORATION_AGENT_DEFINITION,
  DEPARTURE_COLLABORATION_CAPABILITY_DEFINITIONS,
  DEPARTURE_COLLABORATION_INSTRUCTIONS,
  departureCollaborationCapabilityDefinitionRegistry,
} from './departure-collaboration-definitions'

const requestContext = requestContextSchema.parse({
  organizationId: 'org-1',
  userId: 'user-1',
  taskId: 'task-1',
  conversationId: 'conversation-1',
  inputBatchId: 'batch-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  agentDefinition: { key: 'departure.collaboration', version: 1 },
  objectScopes: [
    { organizationId: 'org-1', kind: 'agent_task', id: 'task-1' },
    { organizationId: 'org-1', kind: 'ai_create_task', id: 'task-1' },
    { organizationId: 'org-1', kind: 'agent_conversation', id: 'conversation-1' },
  ],
})

describe('已有发团协作 Agent Definition #449', () => {
  it('registers segment-resource propose without writing to conversation.general', () => {
    expect(DEPARTURE_COLLABORATION_AGENT_DEFINITION.key).toBe('departure.collaboration')
    expect(DEPARTURE_COLLABORATION_INSTRUCTIONS).toContain('不能凭页面日期')
    expect(
      DEPARTURE_COLLABORATION_CAPABILITY_DEFINITIONS.map((definition) => ({
        key: definition.key,
        toolName: definition.toolName,
      })),
    ).toEqual(
      expect.arrayContaining([
        { key: 'departure.supplier.search', toolName: 'searchSuppliers' },
        { key: 'departure.partner.search', toolName: 'searchPartners' },
        { key: 'departure.source-order.propose', toolName: 'proposeSourceOrderReviewPackage' },
        {
          key: 'departure.segment-resource.propose',
          toolName: 'proposeSegmentResourceReviewPackage',
        },
      ]),
    )

    const result = capabilityGrantResolver.resolve({
      agentDefinition: DEPARTURE_COLLABORATION_AGENT_DEFINITION,
      capabilities: departureCollaborationCapabilityDefinitionRegistry,
      requestContext,
      user: { organizationId: 'org-1', permissionKeys: ['departure:write'] },
      entitlements: { status: 'unavailable' },
      riskPolicy: { allowedRisks: ['low', 'medium'] },
    })

    expect(result.granted).toEqual(
      expect.arrayContaining([
        { key: 'departure.task-context.read', version: 2 },
        { key: 'departure.supplier.search', version: 1 },
        { key: 'departure.partner.search', version: 1 },
        { key: 'departure.source-order.propose', version: 1 },
        { key: 'departure.segment-resource.propose', version: 1 },
      ]),
    )
    expect(result.denied).toEqual([])
  })
})
