import { useEffect } from 'react'
import type { TransactionWriteoffStatus } from '@xiaotuanbao/shared'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { TransactionDateRange } from '../utils/date-ranges'
import {
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { listTransactions } from '@/services/finance.service'
import { useQuery } from '@tanstack/react-query'
import type { TransactionDirection } from '@xiaotuanbao/shared'

interface UseTransactionsWorkspaceQueryParams {
  scope: 'global' | 'departure'
  lockedDepartureId?: string
  listQueryKey: string
  dateRange: TransactionDateRange
  direction: TransactionDirection | undefined
  debouncedPartnerKeyword: string
  writeoffStatus: TransactionWriteoffStatus | undefined
  pendingSettlement: '1' | undefined
  debouncedTransactionNo: string
  effectiveDepartureId: string | undefined
  statusFilter: 'normal' | 'voided' | undefined
  page: number
  pageSize: number
}

export function useTransactionsWorkspaceQuery({
  scope,
  lockedDepartureId,
  listQueryKey,
  dateRange,
  direction,
  debouncedPartnerKeyword,
  writeoffStatus,
  pendingSettlement,
  debouncedTransactionNo,
  effectiveDepartureId,
  statusFilter,
  page,
  pageSize,
}: UseTransactionsWorkspaceQueryParams) {
  const isDepartureScope = scope === 'departure'

  const listFilterKey = [
    lockedDepartureId,
    dateRange?.[0],
    dateRange?.[1],
    direction,
    debouncedPartnerKeyword,
    writeoffStatus,
    pendingSettlement,
    debouncedTransactionNo,
    effectiveDepartureId,
    statusFilter,
  ].join('\0')
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const {
    data: transactionsResult,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    isPlaceholderData,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      listQueryKey,
      lockedDepartureId,
      dateRange,
      direction,
      debouncedPartnerKeyword,
      writeoffStatus,
      pendingSettlement,
      debouncedTransactionNo,
      effectiveDepartureId,
      statusFilter,
      page,
      pageSize,
    ],
    queryFn: ({ signal }) =>
      listTransactions(
        {
          dateStart: dateRange?.[0],
          dateEnd: dateRange?.[1],
          direction,
          partnerKeyword: debouncedPartnerKeyword || undefined,
          writeoffStatus: pendingSettlement ? undefined : writeoffStatus,
          pendingSettlement,
          transactionNo: debouncedTransactionNo || undefined,
          departureId: effectiveDepartureId,
          status: statusFilter,
          page,
          pageSize,
        },
        signal,
      ),
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
    placeholderData,
    ...operationalQueryOptions(),
  })

  useEffect(() => {
    commitListFilterKey(isSuccess, isPlaceholderData)
  }, [commitListFilterKey, isSuccess, isPlaceholderData])

  const { hardLoading, softFetching } = resolveListTableLoading({
    isLoading,
    isFetching,
    isPlaceholderData,
  })

  return {
    transactionsResult,
    hardLoading,
    softFetching,
    isFetching,
    isError,
    error,
    refetch,
  }
}

export function useTransactionsWorkspaceDebouncedFilters(
  partnerKeyword: string,
  transactionNo: string,
) {
  return {
    debouncedPartnerKeyword: useDebouncedValue(partnerKeyword.trim()),
    debouncedTransactionNo: useDebouncedValue(transactionNo.trim()),
  }
}
