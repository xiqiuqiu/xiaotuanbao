import { z } from 'zod'

const stableDefinitionKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/)

const objectKindSchema = z.string().min(1).max(120).regex(/^[a-z][a-z0-9_]*$/)

export const versionedDefinitionRefSchema = z
  .object({
    key: stableDefinitionKeySchema,
    version: z.number().int().positive(),
  })
  .strict()

export type VersionedDefinitionRef = z.infer<typeof versionedDefinitionRefSchema>

export const requestContextSchema = z
  .object({
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    taskId: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
    conversationId: z.string().min(1),
    inputBatchId: z.string().min(1),
    attemptId: z.string().min(1),
    contextManifestId: z.string().min(1),
    agentDefinition: versionedDefinitionRefSchema,
    grantedCapabilities: z.array(versionedDefinitionRefSchema).default([]),
    entitlementStatus: z.enum(['available', 'unavailable']).default('unavailable'),
    objectScopes: z.array(
      z
        .object({
          organizationId: z.string().min(1),
          kind: objectKindSchema,
          id: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()

export type RequestContext = z.infer<typeof requestContextSchema>

export const CAPABILITY_KINDS = ['read', 'propose', 'execute'] as const
export const CAPABILITY_RISKS = ['low', 'medium', 'high'] as const

export interface CapabilityDefinition {
  key: string
  version: number
  toolName: string
  kind: (typeof CAPABILITY_KINDS)[number]
  risk: (typeof CAPABILITY_RISKS)[number]
  requiredPermissionKeys: readonly string[]
  requiredObjectScopes: readonly {
    kind: string
    idFromContext: 'taskId' | 'conversationId' | 'inputBatchId' | 'attemptId'
  }[]
  entitlementKey?: string
  inputSchema: RuntimeSchema
  outputSchema: RuntimeSchema
  contextSchema: RuntimeSchema
  gateway?: {
    actionKind: 'read' | 'write'
    decision: 'allow' | 'review' | 'deny'
    targetKind: string
  }
}

export interface RuntimeSchema {
  parse(input: unknown): unknown
}

export interface AgentDefinition {
  key: string
  version: number
  name: string
  instructions: string
  capabilities: readonly VersionedDefinitionRef[]
}

export type AgentCapabilityDeclaration = Pick<
  AgentDefinition,
  'key' | 'version' | 'capabilities'
>

abstract class VersionedRegistry<T extends { key: string; version: number }> {
  private readonly definitions = new Map<string, T>()

  protected constructor(definitions: readonly T[], kind: string) {
    for (const definition of definitions) {
      versionedDefinitionRefSchema.parse({ key: definition.key, version: definition.version })
      const id = registryId(definition)
      if (this.definitions.has(id)) {
        throw new Error(`${kind} Definition 重复注册: ${id}`)
      }
      this.definitions.set(id, definition)
    }
  }

  get(ref: VersionedDefinitionRef): T {
    const parsed = versionedDefinitionRefSchema.parse({ key: ref.key, version: ref.version })
    const definition = this.definitions.get(registryId(parsed))
    if (!definition) {
      throw new Error(`Definition 未注册: ${registryId(parsed)}`)
    }
    return definition
  }
}

export class AgentDefinitionRegistry extends VersionedRegistry<AgentDefinition> {
  constructor(definitions: readonly AgentDefinition[]) {
    super(definitions, 'Agent')
  }
}

export class CapabilityDefinitionRegistry extends VersionedRegistry<CapabilityDefinition> {
  constructor(definitions: readonly CapabilityDefinition[]) {
    super(definitions, 'Capability')
  }
}

export const CAPABILITY_DENIAL_REASONS = [
  'USER_PERMISSION_DENIED',
  'CROSS_ORGANIZATION',
  'OBJECT_SCOPE_DENIED',
  'RISK_POLICY_DENIED',
  'ENTITLEMENT_DENIED',
  'ENTITLEMENT_UNAVAILABLE',
  'CAPABILITY_UNAVAILABLE',
] as const

export type CapabilityDenialReason = (typeof CAPABILITY_DENIAL_REASONS)[number]

export interface CapabilityGrantResult {
  granted: VersionedDefinitionRef[]
  denied: Array<{ capability: VersionedDefinitionRef; reason: CapabilityDenialReason }>
  entitlementStatus: 'available' | 'unavailable'
}

export interface CapabilityGrantRequest {
  agentDefinition: AgentCapabilityDeclaration
  capabilities: CapabilityDefinitionRegistry
  requestContext: RequestContext
  user: { organizationId: string; permissionKeys: readonly string[] }
  entitlements:
    | { status: 'available'; keys: readonly string[] }
    | { status: 'unavailable' }
  riskPolicy: { allowedRisks: readonly CapabilityDefinition['risk'][] }
  availableCapabilities?: readonly VersionedDefinitionRef[]
}

export const capabilityGrantResolver = {
  resolve(input: CapabilityGrantRequest): CapabilityGrantResult {
    const context = requestContextSchema.parse(input.requestContext)
    const permissionKeys = new Set(input.user.permissionKeys)
    const allowedRisks = new Set(input.riskPolicy.allowedRisks)
    const entitlementKeys = new Set(
      input.entitlements.status === 'available' ? input.entitlements.keys : [],
    )
    const result: CapabilityGrantResult = {
      granted: [],
      denied: [],
      entitlementStatus: input.entitlements.status,
    }
    const availableCapabilities = input.availableCapabilities
      ? new Set(input.availableCapabilities.map(registryId))
      : null

    for (const ref of input.agentDefinition.capabilities) {
      const capability = input.capabilities.get(ref)
      const reason = denialReason({
        capability,
        context,
        userOrganizationId: input.user.organizationId,
        permissionKeys,
        allowedRisks,
        entitlementStatus: input.entitlements.status,
        entitlementKeys,
        capabilityAvailable: availableCapabilities?.has(registryId(ref)) ?? true,
      })
      if (reason) {
        result.denied.push({ capability: { ...ref }, reason })
      } else {
        result.granted.push({ ...ref })
      }
    }
    return result
  },
}

function denialReason(input: {
  capability: CapabilityDefinition
  context: RequestContext
  userOrganizationId: string
  permissionKeys: ReadonlySet<string>
  allowedRisks: ReadonlySet<CapabilityDefinition['risk']>
  entitlementStatus: 'available' | 'unavailable'
  entitlementKeys: ReadonlySet<string>
  capabilityAvailable: boolean
}): CapabilityDenialReason | null {
  if (!input.capabilityAvailable) {
    return 'CAPABILITY_UNAVAILABLE'
  }
  if (input.context.organizationId !== input.userOrganizationId) {
    return 'CROSS_ORGANIZATION'
  }
  if (input.capability.requiredPermissionKeys.some((key) => !input.permissionKeys.has(key))) {
    return 'USER_PERMISSION_DENIED'
  }
  if (
    input.capability.requiredObjectScopes.some(
      ({ kind, idFromContext }) =>
        !input.context.objectScopes.some(
          (scope) =>
            scope.organizationId === input.context.organizationId &&
            scope.kind === kind &&
            scope.id === input.context[idFromContext],
        ),
    )
  ) {
    return 'OBJECT_SCOPE_DENIED'
  }
  if (!input.allowedRisks.has(input.capability.risk)) {
    return 'RISK_POLICY_DENIED'
  }
  if (input.capability.entitlementKey) {
    if (input.entitlementStatus === 'unavailable') {
      return 'ENTITLEMENT_UNAVAILABLE'
    }
    if (!input.entitlementKeys.has(input.capability.entitlementKey)) {
      return 'ENTITLEMENT_DENIED'
    }
  }
  return null
}

function registryId(ref: VersionedDefinitionRef): string {
  return `${ref.key}@${ref.version}`
}
