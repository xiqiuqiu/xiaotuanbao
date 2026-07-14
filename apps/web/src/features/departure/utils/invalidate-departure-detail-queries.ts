import type { QueryClient } from '@tanstack/react-query'

/**
 * Query-key prefixes owned by departure detail tabs / header.
 * Use after mutations or an explicit user refresh — not on every tab switch.
 * Read-path freshness comes from per-query staleTime / refetchOnWindowFocus
 * on departure header, execution/source-order panes, and finance workspaces.
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
