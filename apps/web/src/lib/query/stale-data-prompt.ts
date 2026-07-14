/** Show a restrained “data may be stale” affordance after the user sits on a page this long. */
export const STALE_DATA_PROMPT_AFTER_MS = 60_000

/** Tighter freshness for departure detail + finance operational queries. */
export const OPERATIONAL_QUERY_STALE_TIME_MS = 15_000

export function shouldShowStaleDataPrompt(args: {
  now: number
  dataUpdatedAt: number
  isFetching: boolean
  isError: boolean
  hasData: boolean
  stalePromptAfterMs?: number
}): boolean {
  if (!args.hasData) {
    return false
  }
  if (args.isFetching) {
    return false
  }
  if (args.isError) {
    return true
  }
  const threshold = args.stalePromptAfterMs ?? STALE_DATA_PROMPT_AFTER_MS
  return args.now - args.dataUpdatedAt >= threshold
}
