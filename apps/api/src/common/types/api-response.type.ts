export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface JwtPayload {
  sub: string
  organizationId: string
  isPlatformAdmin: boolean
}

export interface AiOperationDelegationPayload {
  typ: 'ai-op-delegation'
  aud?: 'ai-op-delegation'
  sub: string
  organizationId: string
  taskId?: string
  runId?: string
  conversationId: string
  inputBatchId: string
  attemptId: string
  contextManifestId?: string
  agentDefinition: { key: string; version: number }
  grantedCapabilities: Array<{ key: string; version: number }>
  entitlementStatus: 'available' | 'unavailable'
  objectScopes: Array<{ organizationId: string; kind: string; id: string }>
}
