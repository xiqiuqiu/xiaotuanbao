/**
 * Operational read freshness — auto-refresh first, manual only on failure.
 *
 * | Layer              | Trigger                         | Budget        |
 * |--------------------|---------------------------------|---------------|
 * | Fresh cache        | no network                      | staleTime 30s |
 * | Focus return       | window focus + stale            | one refetch   |
 * | Quiet poll         | tab visible                     | every 90s     |
 * | Manual affordance  | auto refetch failed + keep data | on failure    |
 */

/** Data is considered fresh; background refetch waits until this elapses. */
export const OPERATIONAL_QUERY_STALE_TIME_MS = 30_000

/** While the document is visible, quietly revalidate. Paused in background by RQ. */
export const OPERATIONAL_REFETCH_INTERVAL_MS = 90_000

/** Shared options for departure / finance / directory operational lists & details. */
export function operationalQueryOptions() {
  return {
    staleTime: OPERATIONAL_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: true as const,
    refetchInterval: OPERATIONAL_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false as const,
  }
}

/**
 * Manual refresh is a fallback only: keep showing last good data, offer retry
 * after an automatic refresh attempt has failed.
 */
export function shouldShowManualRefreshPrompt(args: {
  isFetching: boolean
  isError: boolean
  hasData: boolean
}): boolean {
  if (!args.hasData) {
    return false
  }
  if (args.isFetching) {
    return false
  }
  return args.isError
}
