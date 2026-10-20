import {
  capabilityGrantResolver,
  DEPARTURE_COLLABORATION_AGENT_CAPABILITY_DECLARATION,
  departureCollaborationCapabilityDefinitionRegistry,
  INITIAL_FINANCE_PROPOSE_CAPABILITY_REF,
  type RequestContext,
} from '@xiaotuanbao/ai-contracts'

export function resolveCollaborationCapabilityGrants(
  requestContext: RequestContext,
  permissionKeys: readonly string[],
) {
  const declaration = DEPARTURE_COLLABORATION_AGENT_CAPABILITY_DECLARATION
  const capabilities = departureCollaborationCapabilityDefinitionRegistry
  return capabilityGrantResolver.resolve({
    agentDefinition: declaration,
    capabilities,
    requestContext,
    user: { organizationId: requestContext.organizationId, permissionKeys },
    entitlements: { status: 'unavailable' },
    riskPolicy: { allowedRisks: ['low', 'medium', 'high'] },
    availableCapabilities: declaration.capabilities.filter((ref) =>
      capabilities.get(ref).risk !== 'high' || (
        ref.key === INITIAL_FINANCE_PROPOSE_CAPABILITY_REF.key &&
        ref.version === INITIAL_FINANCE_PROPOSE_CAPABILITY_REF.version
      ),
    ),
  })
}
