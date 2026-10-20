import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA, SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA, SOURCE_ORDER_GUESTS_UPDATE_REVIEW_PAYLOAD_SCHEMA } from '@xiaotuanbao/ai-contracts'
import type { AiReviewPackageView, ReviewConfirmationView } from '@/types/api'
import { invalidateFinanceMutationQueries } from '@/features/finance/utils/invalidate-finance-mutation-queries'
import {
  PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY,
  SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY,
} from '@/features/finance/queries/finance-query-keys'

export function useConfirmedReviewInvalidation(
  departureId: string,
  pkg: Pick<AiReviewPackageView, 'id' | 'status' | 'payloadSchema'> | undefined,
  confirmation?: ReviewConfirmationView['items'][number],
) {
  const queryClient = useQueryClient()
  const invalidated = useRef<string | null>(null)
  const packageId = pkg?.id
  const payloadSchema = pkg?.payloadSchema
  const invalidateSucceeded = useCallback((status?: string) => {
    if (!packageId || status !== 'succeeded' || invalidated.current === packageId) return
    invalidated.current = packageId
    const queryKeys = payloadSchema === SOURCE_ORDER_RECEIVABLE_REVIEW_PAYLOAD_SCHEMA
      ? ['finance-receivables', 'partner-receivables', PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY, 'source-order']
      : payloadSchema === SOURCE_ORDER_GUESTS_UPDATE_REVIEW_PAYLOAD_SCHEMA
        ? ['source-order']
      : payloadSchema === RESOURCE_PAYABLE_REVIEW_PAYLOAD_SCHEMA
        ? ['finance-payables', 'partner-payables', 'supplier-payables', PARTNER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY, SUPPLIER_PAYMENT_SCHEDULE_SUMMARY_QUERY_KEY]
        : []
    invalidateFinanceMutationQueries(queryClient, { departureIds: [departureId], queryKeys })
  }, [departureId, packageId, payloadSchema, queryClient])
  useEffect(() => {
    const status = confirmation?.status ?? (pkg?.status === 'confirmed' ? 'succeeded' : undefined)
    invalidateSucceeded(status)
  }, [confirmation?.status, pkg?.status, invalidateSucceeded])
  return invalidateSucceeded
}

export function confirmationForPackage(
  confirmations: readonly ReviewConfirmationView[],
  packageId: string,
) {
  const items = confirmations.flatMap((confirmation) =>
    confirmation.items.filter((item) => item.packageId === packageId),
  )
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.status === 'succeeded') {
      return items[index]
    }
  }
  return items.at(-1)
}
