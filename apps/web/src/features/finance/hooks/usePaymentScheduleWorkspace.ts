import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { theme } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { getDeparture } from '@/services/departure.service'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import {
  listDeparturePayables,
  listDepartureReceivables,
  listPartnerPayables,
  listPartnerReceivables,
  listSupplierPayables,
  listPayables,
  listReceivables,
  listFinanceDepartureOptions,
} from '@/services/finance.service'
import type {
  DepartureDateRange,
  DueDateRange,
  PaymentScheduleStatusFilter,
} from '../components/PaymentScheduleFilters'
import { buildPaymentScheduleColumns } from '../components/payment-schedule-table-columns'
import { applyPaymentScheduleClientFilters } from '../utils/apply-payment-schedule-client-filters'
import { usePaymentScheduleDialogs } from './usePaymentScheduleDialogs'
import { usePaymentScheduleLocate } from './usePaymentScheduleLocate'
import { usePaymentScheduleMutations } from './usePaymentScheduleMutations'
import { FINANCE_DEPARTURE_OPTIONS_QUERY_KEY } from '../queries/finance-query-keys'

export type UsePaymentScheduleWorkspaceOptions = {
  scope: 'global' | 'departure' | 'partner' | 'supplier'
  direction: 'receivable' | 'payable'
  departureId?: string
  /** Partner 维度精确过滤（scope='partner' 时必传），走 Partner 专属端点。 */
  partnerId?: string
  /** Supplier 维度精确过滤（scope='supplier' 时必传），走 Supplier 专属端点（仅应付）。 */
  supplierId?: string
  readOnly?: boolean
  highlightSourceOrderId?: string
  highlightSegmentResourceId?: string
  initialCounterpartyKeyword?: string
  /** 精确单号（scheduleNo）；服务端筛选，计入列表 total。 */
  scheduleNo?: string
  /** 工作台应收跟进窗口；服务端筛选，计入列表 total。 */
  receivableFollowUp?:
    | 'overdue'
    | 'due_within_7_days'
    | 'aging_1_7'
    | 'aging_8_30'
    | 'aging_over_30'
    | 'follow_up'
  /** 工作台待付款窗口；服务端筛选，计入列表 total。 */
  payableBalance?: 'open_unpaid'
  onHighlightConsumed?: () => void
  /**
   * 受控出团日期区间（Partner 往来账款 Tab 跨应收/应付共用）。
   * 传入 `onDepartureDateRangeChange` 时生效；未传则内部自管。
   */
  departureDateRange?: DepartureDateRange
  onDepartureDateRangeChange?: (value: DepartureDateRange) => void
}

export function usePaymentScheduleWorkspace({
  scope,
  direction,
  departureId: lockedDepartureId,
  partnerId,
  supplierId,
  readOnly = false,
  highlightSourceOrderId,
  highlightSegmentResourceId,
  initialCounterpartyKeyword = '',
  scheduleNo,
  receivableFollowUp,
  payableBalance,
  onHighlightConsumed,
  departureDateRange: controlledDepartureDateRange,
  onDepartureDateRangeChange,
}: UsePaymentScheduleWorkspaceOptions) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { token } = theme.useToken()
  const isReceivable = direction === 'receivable'
  const isDepartureScope = scope === 'departure'
  const isPartnerScope = scope === 'partner'
  const isSupplierScope = scope === 'supplier'
  const listQueryKey = isReceivable ? 'finance-receivables' : 'finance-payables'
  const departureListQueryKey = isReceivable
    ? 'departure-receivables'
    : 'departure-payables'
  const partnerListQueryKey = isReceivable ? 'partner-receivables' : 'partner-payables'
  // Supplier 仅应付，无应收专属端点。
  const supplierListQueryKey = 'supplier-payables'
  const activeListQueryKey = isDepartureScope
    ? departureListQueryKey
    : isPartnerScope
      ? partnerListQueryKey
      : isSupplierScope
        ? supplierListQueryKey
        : listQueryKey

  const [departureFilter, setDepartureFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<PaymentScheduleStatusFilter | undefined>()
  const [keyword, setKeyword] = useState('')
  const [dueDateRange, setDueDateRange] = useState<DueDateRange>(null)
  /** Partner scope 主时间轴：所属发团出团日期区间（服务端过滤，与汇总卡同口径）。 */
  const [internalDepartureDateRange, setInternalDepartureDateRange] =
    useState<DepartureDateRange>(null)
  const departureDateControlled = typeof onDepartureDateRangeChange === 'function'
  const departureDateRange = departureDateControlled
    ? (controlledDepartureDateRange ?? null)
    : internalDepartureDateRange
  const [counterpartyKeyword, setCounterpartyKeyword] = useState(initialCounterpartyKeyword)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const setDepartureDateRange = useCallback(
    (value: DepartureDateRange) => {
      if (onDepartureDateRangeChange) {
        onDepartureDateRangeChange(value)
      } else {
        setInternalDepartureDateRange(value)
      }
      setPage(1)
    },
    [onDepartureDateRangeChange],
  )

  const dialogs = usePaymentScheduleDialogs(isReceivable)

  const effectiveDepartureId = scope === 'departure' ? lockedDepartureId : departureFilter
  const voidedAudit = !isReceivable && statusFilter === 'voided'
  const trimmedCounterpartyKeyword = useDebouncedValue(counterpartyKeyword.trim())
  const debouncedKeyword = useDebouncedValue(keyword.trim())
  const hasClientFilters = Boolean(
    debouncedKeyword ||
    (statusFilter && statusFilter !== 'voided') ||
    dueDateRange,
  )
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

  const isCounterpartyScope = isPartnerScope || isSupplierScope
  const departureDateFrom = isCounterpartyScope ? departureDateRange?.[0] : undefined
  const departureDateTo = isCounterpartyScope ? departureDateRange?.[1] : undefined

  // Only server-driven list inputs. Client-only filters (keyword/status/due date)
  // reshape rows locally and must not clear the cached cohort.
  const listFilterKey = [
    effectiveDepartureId,
    useExpandedFetch,
    trimmedCounterpartyKeyword,
    voidedAudit,
    departureDateFrom,
    departureDateTo,
    receivableFollowUp,
    payableBalance,
    scheduleNo,
  ].join('\0')
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const {
    data: schedulesResult,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    isPlaceholderData,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      activeListQueryKey,
      effectiveDepartureId,
      partnerId,
      supplierId,
      page,
      fetchPageSize,
      useExpandedFetch,
      trimmedCounterpartyKeyword,
      voidedAudit,
      departureDateFrom,
      departureDateTo,
      receivableFollowUp,
      payableBalance,
      scheduleNo,
    ],
    queryFn: ({ signal }) => {
      const counterpartyQuery = trimmedCounterpartyKeyword
        ? { counterpartyKeyword: trimmedCounterpartyKeyword }
        : {}
      const statusQuery = voidedAudit ? { status: 'voided' as const } : {}
      const followUpQuery =
        isReceivable && receivableFollowUp ? { receivableFollowUp } : {}
      const payableBalanceQuery =
        !isReceivable && payableBalance ? { payableBalance } : {}
      const scheduleNoQuery = scheduleNo?.trim()
        ? { scheduleNo: scheduleNo.trim() }
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
            ...statusQuery,
          },
          signal,
        )
      }
      if (isPartnerScope) {
        if (!partnerId) {
          throw new Error('合作伙伴 ID 缺失')
        }
        const listFn = isReceivable ? listPartnerReceivables : listPartnerPayables
        return listFn(
          partnerId,
          {
            page: useExpandedFetch ? 1 : page,
            pageSize: fetchPageSize,
            ...(departureDateFrom ? { departureDateFrom } : {}),
            ...(departureDateTo ? { departureDateTo } : {}),
            ...statusQuery,
          },
          signal,
        )
      }
      if (isSupplierScope) {
        if (!supplierId) {
          throw new Error('供应商 ID 缺失')
        }
        // 供应商仅应付方向，无应收端点。
        return listSupplierPayables(
          supplierId,
          {
            page: useExpandedFetch ? 1 : page,
            pageSize: fetchPageSize,
            ...(departureDateFrom ? { departureDateFrom } : {}),
            ...(departureDateTo ? { departureDateTo } : {}),
            ...statusQuery,
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
          ...statusQuery,
          ...followUpQuery,
          ...payableBalanceQuery,
          ...scheduleNoQuery,
        },
        signal,
      )
    },
    enabled:
      (!isDepartureScope || Boolean(lockedDepartureId)) &&
      (!isPartnerScope || Boolean(partnerId)) &&
      (!isSupplierScope || Boolean(supplierId)),
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

  const { locateSourceOrderId, locateSegmentResourceId, locateFlashActive, pendingPage } =
    usePaymentScheduleLocate({
      isReceivable,
      highlightSourceOrderId,
      highlightSegmentResourceId,
      onHighlightConsumed,
      isLoading,
      isFetching,
      schedulesResult,
      keyword: debouncedKeyword,
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
        debouncedKeyword,
        statusFilter,
        dueDateRange,
      ),
    [schedulesResult?.items, debouncedKeyword, statusFilter, dueDateRange],
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
    partnerListQueryKey,
    supplierListQueryKey,
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
    // 出团日期在父级主行共用时，重置只清次要条件，不碰主时间轴
    if (!departureDateControlled) {
      setDepartureDateRange(null)
    }
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
  }, [
    departureDateControlled,
    isDepartureScope,
    isReceivable,
    lockedDepartureId,
    navigate,
    scope,
    setDepartureDateRange,
  ])

  const columns = useMemo(
    () =>
      buildPaymentScheduleColumns({
        isDepartureScope,
        isReceivable,
        readOnly,
        voidedAudit,
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
      voidedAudit,
    ],
  )

  return {
    isReceivable,
    isDepartureScope,
    isPartnerScope,
    isSupplierScope,
    effectiveDepartureId,
    statusFilter,
    keyword,
    dueDateRange,
    departureDateRange,
    counterpartyKeyword,
    page,
    pageSize,
    setPage,
    setPageSize,
    setDepartureFilter,
    setStatusFilter,
    setKeyword,
    setDueDateRange,
    setDepartureDateRange,
    setCounterpartyKeyword,
    resetFilters,
    scope,
    isLoading,
    isFetching,
    hardLoading,
    softFetching,
    isError,
    error,
    hasListData: Boolean(schedulesResult),
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
