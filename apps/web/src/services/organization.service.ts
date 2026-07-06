import { request } from '@/lib/request'
import type { OrganizationSummary } from '@/types/api'

export async function getOrganization(): Promise<OrganizationSummary> {
  return request.get<OrganizationSummary>('/organization')
}
