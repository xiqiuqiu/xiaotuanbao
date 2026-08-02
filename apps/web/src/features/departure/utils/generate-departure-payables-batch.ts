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

  const items = await Promise.all(
    candidates.map(async (resource) => {
      try {
        await generateDeparturePayable(resource.id)
        return {
          sourceId: resource.id,
          sourceLabel: resource.title || resource.id,
          outcome: 'succeeded' as const,
          generatedCount: 1,
        }
      } catch (error) {
        return {
          sourceId: resource.id,
          sourceLabel: resource.title || resource.id,
          outcome: 'failed' as const,
          reason: error instanceof Error ? error.message : '提交应付失败',
        }
      }
    }),
  ) satisfies BatchFinanceGenerationResult['items']
  const succeeded = items.filter((item) => item.outcome === 'succeeded').length
  const failed = items.length - succeeded

  return {
    attempted: candidates.length,
    succeeded,
    generated: succeeded,
    skipped: 0,
    failed,
    items,
  }
}
