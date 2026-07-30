import type { BatchFinanceGenerationResult } from '@xiaotuanbao/shared'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import { generateDeparturePayable } from '@/services/departure-resource.service'

type DeparturePayableCandidate = {
  id: string
  title: string
  amountCents: number
  payableStatus: string
}

/**
 * Client-side batch: call per-resource generate-payable (no departure-level batch API).
 * Candidates = 未生成且金额>0, matching cost-strip / segment amount summary口径.
 */
export async function generateDeparturePayablesBatch(
  resources: readonly DeparturePayableCandidate[],
): Promise<BatchFinanceGenerationResult> {
  const candidates = resources.filter(
    (item) =>
      item.payableStatus === SegmentPayableStatus.NOT_GENERATED && item.amountCents > 0,
  )

  const items: BatchFinanceGenerationResult['items'] = []
  let succeeded = 0
  let failed = 0

  for (const resource of candidates) {
    try {
      await generateDeparturePayable(resource.id)
      succeeded += 1
      items.push({
        sourceId: resource.id,
        sourceLabel: resource.title || resource.id,
        outcome: 'succeeded',
        generatedCount: 1,
      })
    } catch (error) {
      failed += 1
      items.push({
        sourceId: resource.id,
        sourceLabel: resource.title || resource.id,
        outcome: 'failed',
        reason: error instanceof Error ? error.message : '生成应付失败',
      })
    }
  }

  return {
    attempted: candidates.length,
    succeeded,
    generated: succeeded,
    skipped: 0,
    failed,
    items,
  }
}
