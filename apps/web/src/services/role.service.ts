import { request } from '@/lib/request'
import type { RoleSummary } from '@/types/api'

export async function listRoles(): Promise<RoleSummary[]> {
  return request.get<RoleSummary[]>('/roles')
}
