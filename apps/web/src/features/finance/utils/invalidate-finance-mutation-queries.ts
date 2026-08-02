import type { QueryClient } from '@tanstack/react-query'
import {
  DEPARTURE_DETAIL_QUERY_KEYS,
  invalidateDepartureDetailQueries,
} from '@/features/departure/utils/invalidate-departure-detail-queries'

type InvalidateFinanceMutationQueriesOptions = {
  queryKeys?: readonly string[]
  departureIds?: readonly (string | null | undefined)[]
}

export function invalidateFinanceMutationQueries(
  queryClient: QueryClient,
  { queryKeys = [], departureIds = [] }: InvalidateFinanceMutationQueriesOptions,
): void {
  for (const queryKey of new Set(queryKeys)) {
    void queryClient.invalidateQueries({ queryKey: [queryKey] })
  }

  const affectedDepartureIds = [
    ...new Set(departureIds.filter((id): id is string => Boolean(id))),
  ]
  if (affectedDepartureIds.length === 0) {
    for (const queryKey of DEPARTURE_DETAIL_QUERY_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
    }
    return
  }

  for (const departureId of affectedDepartureIds) {
    invalidateDepartureDetailQueries(queryClient, departureId)
  }
}
