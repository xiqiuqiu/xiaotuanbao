import { useEffect, useRef } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import styles from './list-query-ux.module.css'

export function listSoftFetchingClassName(softFetching: boolean): string | undefined {
  return softFetching ? styles.softFetching : undefined
}

/**
 * Pagination-only transitions may keep prior rows (SWR).
 * Filter transitions must clear rows so users never stare at the wrong cohort.
 */
export function shouldKeepPreviousListData(
  previousFilterKey: string | undefined,
  nextFilterKey: string,
): boolean {
  if (previousFilterKey === undefined) {
    return false
  }
  return previousFilterKey === nextFilterKey
}

export type ListTableLoadingState = {
  hardLoading: boolean
  softFetching: boolean
}

/**
 * Hard overlay on first load / filter change.
 * Soft hint only while paginating with placeholder rows — not on silent/focus refetch.
 */
export function resolveListTableLoading(args: {
  isLoading: boolean
  isFetching: boolean
  isPlaceholderData: boolean
}): ListTableLoadingState {
  const hardLoading = args.isLoading && !args.isPlaceholderData
  const softFetching = args.isFetching && args.isPlaceholderData
  return { hardLoading, softFetching }
}

/**
 * Returns TanStack `placeholderData` that keeps prior rows only when `filterKey` is unchanged.
 * Put every non-pagination list input into `filterKey` (keyword, status, dates, …).
 */
export function useListPlaceholderData(filterKey: string) {
  const previousFilterKeyRef = useRef<string | undefined>(undefined)
  const keep = shouldKeepPreviousListData(previousFilterKeyRef.current, filterKey)

  useEffect(() => {
    previousFilterKeyRef.current = filterKey
  }, [filterKey])

  return keep ? keepPreviousData : undefined
}
