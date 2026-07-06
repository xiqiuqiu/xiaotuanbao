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
