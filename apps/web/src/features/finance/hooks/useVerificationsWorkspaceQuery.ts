import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import {
  listDepartureVerifications,
  listVerifications,
} from '@/services/finance.service'
import { buildVerificationListMatchParams } from '../utils/verification-list-deep-link'
import type { VerificationListState } from '../utils/verification-list-state'

export function useVerificationsWorkspaceQuery({
  scope,
  lockedDepartureId,
  listState,
}: {
  scope: 'global' | 'departure'
  lockedDepartureId?: string
  listState: VerificationListState
}) {
  const {
    page,
    pageSize,
    dateRange,
    direction,
    status,
    transactionNo,
    scheduleNo,
    departureKeyword,
    lock,
  } = listState

  const isDepartureScope = scope === 'departure'
  const listQueryKey = isDepartureScope ? 'departure-verifications' : 'finance-verifications'
  const debouncedTransactionNo = useDebouncedValue(transactionNo.trim())
  const debouncedScheduleNo = useDebouncedValue(scheduleNo.trim())
  const debouncedDepartureKeyword = useDebouncedValue(departureKeyword.trim())

  const listParams = useMemo(() => {
    const matchParams = buildVerificationListMatchParams({
      transactionNo: debouncedTransactionNo,
      scheduleNo: debouncedScheduleNo,
      lock,
    })
    return {
      page,
      pageSize,
      verificationDateStart: dateRange?.[0],
      verificationDateEnd: dateRange?.[1],
      direction,
      status,
      departureKeyword: debouncedDepartureKeyword || undefined,
      ...matchParams,
    }
  }, [
    page,
    pageSize,
    dateRange,
    direction,
    status,
    debouncedTransactionNo,
    debouncedScheduleNo,
    debouncedDepartureKeyword,
    lock,
  ])

  const listFilterKey = useMemo(() => {
    const { page: _page, pageSize: _pageSize, ...filters } = listParams
    return JSON.stringify({ lockedDepartureId, ...filters })
  }, [listParams, lockedDepartureId])
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const query = useQuery({
    queryKey: [listQueryKey, lockedDepartureId, listParams],
    queryFn: ({ signal }) => {
      if (isDepartureScope) {
        if (!lockedDepartureId) {
          throw new Error('发团 ID 缺失')
        }
        return listDepartureVerifications(lockedDepartureId, listParams, signal)
      }
      return listVerifications(listParams, signal)
    },
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
    placeholderData,
    ...operationalQueryOptions(),
  })

  useEffect(() => {
    commitListFilterKey(query.isSuccess, query.isPlaceholderData)
  }, [commitListFilterKey, query.isSuccess, query.isPlaceholderData])

  const { hardLoading, softFetching } = resolveListTableLoading({
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
  })

  return {
    isDepartureScope,
    verificationsResult: query.data,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    hardLoading,
    softFetching,
  }
}
