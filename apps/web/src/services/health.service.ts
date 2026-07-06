import { request } from '@/lib/request'
import type { HealthStatus } from '@/types/api'

export async function fetchHealth(): Promise<HealthStatus> {
  return request.get<HealthStatus>('/health')
}
