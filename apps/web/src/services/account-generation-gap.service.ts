import { request } from '@/lib/request'
import type { AccountGenerationGapListResult } from '@/types/api'

export async function listAccountGenerationGaps(params: {
  page?: number
  pageSize?: number
} = {}): Promise<AccountGenerationGapListResult> {
  return request.get<AccountGenerationGapListResult>('/account-generation-gaps', { params })
}
