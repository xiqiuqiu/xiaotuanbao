import { request } from '@/lib/request'
import type { AccountGenerationGapListResult } from '@/types/api'

export async function listAccountGenerationGaps(params: {
  page?: number
  pageSize?: number
  generationKind?: 'receivable' | 'payable'
} = {}): Promise<AccountGenerationGapListResult> {
  return request.get<AccountGenerationGapListResult>('/account-generation-gaps', { params })
}
