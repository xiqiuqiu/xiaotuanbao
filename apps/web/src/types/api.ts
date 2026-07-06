export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AuthUser {
  id: string
  name: string
  organizationId: string
  organizationName: string
}

export interface LoginResult {
  accessToken: string
  user: AuthUser
}

export interface HealthStatus {
  status: string
  timestamp?: string
}
