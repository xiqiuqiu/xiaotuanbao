import type { QueryClient } from '@tanstack/react-query'

/**
 * Query-key prefixes owned by departure detail tabs / header.
 * Tab panes use destroyOnHidden + global staleTime, so switching tabs can
 * remount with a still-fresh cache; invalidate these before/when the active
 * tab changes so each pane refetches server state.
 */
export const DEPARTURE_DETAIL_QUERY_KEYS = [
  'departure',
  'segments',
  'source-orders',
  'segment-resources',
  'departure-receivables',
  'departure-payables',
  'departure-transactions',
  'departure-verifications',
  'payment-schedule-detail',
] as const

export function invalidateDepartureDetailQueries(
  queryClient: QueryClient,
  departureId: string,
): void {
  for (const key of DEPARTURE_DETAIL_QUERY_KEYS) {
    if (key === 'departure' || key === 'segments' || key === 'source-orders') {
      void queryClient.invalidateQueries({ queryKey: [key, departureId] })
      continue
    }
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
}
