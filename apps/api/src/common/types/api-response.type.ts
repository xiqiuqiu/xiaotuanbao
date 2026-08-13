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
  taskId: string
  runId: string
}
