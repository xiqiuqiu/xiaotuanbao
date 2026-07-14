import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { theme } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PaymentScheduleStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { getDeparture } from '@/services/departure.service'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  listDeparturePayables,
  listDepartureReceivables,
  listPayables,
  listReceivables,
  listFinanceDepartureOptions,
} from '@/services/finance.service'
import type { DueDateRange } from '../components/PaymentScheduleFilters'
import { buildPaymentScheduleColumns } from '../components/payment-schedule-table-columns'
import { applyPaymentScheduleClientFilters } from '../utils/apply-payment-schedule-client-filters'
import { usePaymentScheduleDialogs } from './usePaymentScheduleDialogs'
import { usePaymentScheduleLocate } from './usePaymentScheduleLocate'
import { usePaymentScheduleMutations } from './usePaymentScheduleMutations'
import { FINANCE_DEPARTURE_OPTIONS_QUERY_KEY } from '../queries/finance-query-keys'

export type UsePaymentScheduleWorkspaceOptions = {
  scope: 'global' | 'departure'
  direction: 'receivable' | 'payable'
  departureId?: string
  readOnly?: boolean
  highlightSourceOrderId?: string
  highlightSegmentResourceId?: string
  initialCounterpartyKeyword?: string
  onHighlightConsumed?: () => void
}

export function usePaymentScheduleWorkspace({
  scope,
  direction,
  departureId: lockedDepartureId,
  readOnly = false,
  highlightSourceOrderId,
  highlightSegmentResourceId,
  initialCounterpartyKeyword = '',
  onHighlightConsumed,
}: UsePaymentScheduleWorkspaceOptions) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { token } = theme.useToken()
  const isReceivable = direction === 'receivable'
  const isDepartureScope = scope === 'departure'
  const listQueryKey = isReceivable ? 'finance-receivables' : 'finance-payables'
  const departureListQueryKey = isReceivable
    ? 'departure-receivables'
    : 'departure-payables'

  const [departureFilter, setDepartureFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<PaymentScheduleStatus | undefined>()
  const [keyword, setKeyword] = useState('')
  const [dueDateRange, setDueDateRange] = useState<DueDateRange>(null)
  const [counterpartyKeyword, setCounterpartyKeyword] = useState(initialCounterpartyKeyword)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const dialogs = usePaymentScheduleDialogs(isReceivable)

  const effectiveDepartureId = scope === 'departure' ? lockedDepartureId : departureFilter
  const trimmedCounterpartyKeyword = useDebouncedValue(counterpartyKeyword.trim())
  const hasClientFilters = Boolean(keyword.trim() || statusFilter || dueDateRange)
  const locatingFinanceRow =
    isDepartureScope &&
    ((isReceivable && Boolean(highlightSourceOrderId)) ||
      (!isReceivable && Boolean(highlightSegmentResourceId)))
  // Latch expanded fetch for the rest of this mount once locate runs. Clearing the
  // one-shot highlight must not shrink pageSize (100→10) and refetch the same list.
  const locateExpandedLatchRef = useRef(false)

  useEffect(() => {
    if (locatingFinanceRow) {
      locateExpandedLatchRef.current = true
    }
  }, [locatingFinanceRow])

  const useExpandedFetch =
    hasClientFilters || locatingFinanceRow || locateExpandedLatchRef.current
  const fetchPageSize = useExpandedFetch ? 100 : pageSize

  const {
    data: schedulesResult,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      isDepartureScope ? departureListQueryKey : listQueryKey,
      effectiveDepartureId,
      page,
      fetchPageSize,
      useExpandedFetch,
      trimmedCounterpartyKeyword,
    ],
    queryFn: ({ signal }) => {
      const counterpartyQuery = trimmedCounterpartyKeyword
        ? { counterpartyKeyword: trimmedCounterpartyKeyword }
        : {}
      if (isDepartureScope) {
        if (!lockedDepartureId) {
          throw new Error('发团 ID 缺失')
        }
        const listFn = isReceivable ? listDepartureReceivables : listDeparturePayables
        return listFn(
          lockedDepartureId,
          {
            page: useExpandedFetch ? 1 : page,
            pageSize: fetchPageSize,
            ...counterpartyQuery,
          },
          signal,
        )
      }
      return (isReceivable ? listReceivables : listPayables)(
        {
          departureId: effectiveDepartureId,
          page: hasClientFilters ? 1 : page,
          pageSize: fetchPageSize,
          ...counterpartyQuery,
        },
        signal,
      )
    },
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
  })

  const { locateSourceOrderId, locateSegmentResourceId, locateFlashActive, pendingPage } =
    usePaymentScheduleLocate({
      isReceivable,
      highlightSourceOrderId,
      highlightSegmentResourceId,
      onHighlightConsumed,
      isLoading,
      isFetching,
      schedulesResult,
      keyword,
      statusFilter,
      dueDateRange,
      pageSize,
      applyClientFilters: applyPaymentScheduleClientFilters,
    })

  if (pendingPage != null && page !== pendingPage) {
    setPage(pendingPage)
  }

  const { data: departuresResult } = useQuery({
    queryKey: FINANCE_DEPARTURE_OPTIONS_QUERY_KEY,
    queryFn: listFinanceDepartureOptions,
    enabled: !isDepartureScope,
  })

  const { data: lockedDeparture } = useQuery({
    queryKey: ['departure', lockedDepartureId, 'finance-schedule-map'],
    queryFn: () => {
      if (!lockedDepartureId) {
        throw new Error('发团 ID 缺失')
      }
      return getDeparture(lockedDepartureId)
    },
    enabled: isDepartureScope && Boolean(lockedDepartureId),
  })

  const departureMap = useMemo(() => {
    const map = new Map<string, { departureNo: string; name: string }>()
    for (const departure of departuresResult ?? []) {
      map.set(departure.id, { departureNo: departure.departureNo, name: departure.name })
    }
    if (lockedDeparture) {
      map.set(lockedDeparture.id, {
        departureNo: lockedDeparture.departureNo,
        name: lockedDeparture.name,
      })
    }
    return map
  }, [departuresResult, lockedDeparture])

  const filteredItems = useMemo(
    () =>
      applyPaymentScheduleClientFilters(
        schedulesResult?.items ?? [],
        keyword,
        statusFilter,
        dueDateRange,
      ),
    [schedulesResult?.items, keyword, statusFilter, dueDateRange],
  )

  const tableItems = useExpandedFetch
    ? filteredItems.slice((page - 1) * pageSize, page * pageSize)
    : filteredItems

  const tableTotal = useExpandedFetch
    ? filteredItems.length
    : (schedulesResult?.total ?? 0)

  const {
    confirmMutation,
    verifyCreateMutation,
    cancelMutation,
    reopenMutation,
    adjustMutation,
    editMutation,
  } = usePaymentScheduleMutations({
    queryClient,
    isReceivable,
    listQueryKey,
    departureListQueryKey,
    activeSchedule: dialogs.activeSchedule,
    confirmForm: dialogs.confirmForm,
    verifyForm: dialogs.verifyForm,
    cancelForm: dialogs.cancelForm,
    reopenForm: dialogs.reopenForm,
    adjustForm: dialogs.adjustForm,
    editForm: dialogs.editForm,
    onConfirmSuccess: dialogs.closeConfirm,
    onVerifySuccess: dialogs.closeVerify,
    onCancelSuccess: dialogs.closeCancel,
    onReopenSuccess: dialogs.closeReopen,
    onAdjustSuccess: dialogs.closeAdjust,
    onEditSuccess: dialogs.closeEdit,
  })

  const openViewVerifications = useCallback(
    (schedule: PaymentScheduleSummary) => {
      if (isDepartureScope && lockedDepartureId) {
        void navigate({
          to: '/departure/$departureId',
          params: { departureId: lockedDepartureId },
          search: {
            tab: 'verifications',
            scheduleNo: schedule.scheduleNo,
          },
        })
        return
      }
      void navigate({
        to: '/finance/verification',
        search: { scheduleNo: schedule.scheduleNo },
      })
    },
    [isDepartureScope, lockedDepartureId, navigate],
  )

  const resetFilters = useCallback(() => {
    if (scope === 'global') {
      setDepartureFilter(undefined)
    }
    setStatusFilter(undefined)
    setKeyword('')
    setDueDateRange(null)
    setCounterpartyKeyword('')
    setPage(1)
    locateExpandedLatchRef.current = false
    if (isDepartureScope && lockedDepartureId) {
      void navigate({
        to: '/departure/$departureId',
        params: { departureId: lockedDepartureId },
        search: {
          tab: isReceivable ? 'receivables' : 'payables',
        },
        replace: true,
      })
    }
  }, [isDepartureScope, isReceivable, lockedDepartureId, navigate, scope])

  const columns = useMemo(
    () =>
      buildPaymentScheduleColumns({
        isDepartureScope,
        isReceivable,
        readOnly,
        departureMap,
        onConfirm: dialogs.openConfirm,
        onVerify: dialogs.openVerify,
        onEdit: dialogs.openEdit,
        onCancel: dialogs.openCancel,
        onReopen: dialogs.openReopen,
        onAdjustAmount: dialogs.openAdjust,
        onViewDetail: dialogs.openDetail,
        onViewVerifications: openViewVerifications,
      }),
    [
      departureMap,
      dialogs.openAdjust,
      dialogs.openCancel,
      dialogs.openConfirm,
      dialogs.openDetail,
      dialogs.openEdit,
      dialogs.openReopen,
      dialogs.openVerify,
      isDepartureScope,
      isReceivable,
      openViewVerifications,
      readOnly,
    ],
  )

  return {
    isReceivable,
    isDepartureScope,
    effectiveDepartureId,
    statusFilter,
    keyword,
    dueDateRange,
    counterpartyKeyword,
    page,
    pageSize,
    setPage,
    setPageSize,
    setDepartureFilter,
    setStatusFilter,
    setKeyword,
    setDueDateRange,
    setCounterpartyKeyword,
    resetFilters,
    scope,
    isLoading,
    isError,
    error,
    refetch,
    columns,
    tableItems,
    tableTotal,
    locateSourceOrderId,
    locateSegmentResourceId,
    locateFlashActive,
    locateBg: token.colorPrimaryBg,
    dialogs,
    departureMap,
    lockedDepartureId,
    confirmMutation,
    verifyCreateMutation,
    cancelMutation,
    reopenMutation,
    adjustMutation,
    editMutation,
  }
}
