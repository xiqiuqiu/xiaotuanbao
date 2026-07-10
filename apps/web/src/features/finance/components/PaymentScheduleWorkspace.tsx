import { useCallback, useMemo, useState } from 'react'
import { Card, Table, theme } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PaymentScheduleStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { getDeparture } from '@/services/departure.service'
import {
  listDeparturePayables,
  listDepartureReceivables,
  listPayables,
  listReceivables,
  listFinanceDepartureOptions,
} from '@/services/finance.service'
import { PaymentScheduleFilters, type DueDateRange } from './PaymentScheduleFilters'
import { PaymentScheduleActionDialogs } from './PaymentScheduleActionDialogs'
import { PaymentScheduleDetailDrawer } from './PaymentScheduleDetailDrawer'
import { buildPaymentScheduleColumns } from './payment-schedule-table-columns'
import { usePaymentScheduleDialogs } from '../hooks/usePaymentScheduleDialogs'
import { usePaymentScheduleLocate, matchesLocateTarget } from '../hooks/usePaymentScheduleLocate'
import { usePaymentScheduleMutations } from '../hooks/usePaymentScheduleMutations'
import styles from './PaymentScheduleWorkspace.module.css'

export type PaymentScheduleWorkspaceProps = {
  scope: 'global' | 'departure'
  direction: 'receivable' | 'payable'
  departureId?: string
  readOnly?: boolean
  /** One-shot locate: flash rows for this source order, then clear via onHighlightConsumed. */
  highlightSourceOrderId?: string
  /** One-shot locate: flash rows for this segment resource, then clear via onHighlightConsumed. */
  highlightSegmentResourceId?: string
  onHighlightConsumed?: () => void
}

function applyClientFilters(
  items: PaymentScheduleSummary[],
  keyword: string,
  statusFilter?: PaymentScheduleStatus,
  dueDateRange?: DueDateRange,
): PaymentScheduleSummary[] {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return items.filter((item) => {
    if (statusFilter && item.status !== statusFilter) {
      return false
    }

    if (normalizedKeyword) {
      const haystack = `${item.scheduleNo} ${item.title}`.toLowerCase()
      if (!haystack.includes(normalizedKeyword)) {
        return false
      }
    }

    if (dueDateRange?.[0] && item.dueDate < dueDateRange[0]) {
      return false
    }

    if (dueDateRange?.[1] && item.dueDate > dueDateRange[1]) {
      return false
    }

    return true
  })
}

interface PaymentScheduleTableProps {
  loading: boolean
  columns: ReturnType<typeof buildPaymentScheduleColumns>
  items: PaymentScheduleSummary[]
  page: number
  pageSize: number
  total: number
  locateSourceOrderId?: string
  locateSegmentResourceId?: string
  locateFlashActive: boolean
  locateBg: string
  onPageChange: (page: number, pageSize: number) => void
}

function PaymentScheduleTable({
  loading,
  columns,
  items,
  page,
  pageSize,
  total,
  locateSourceOrderId,
  locateSegmentResourceId,
  locateFlashActive,
  locateBg,
  onPageChange,
}: PaymentScheduleTableProps) {
  return (
    <Card>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 'max-content' }}
        style={{ ['--schedule-locate-bg' as string]: locateBg }}
        rowClassName={(record) =>
          locateFlashActive &&
          matchesLocateTarget(record, locateSourceOrderId, locateSegmentResourceId)
            ? styles.locateFlash
            : ''
        }
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count) => `共 ${count} 条`,
          onChange: onPageChange,
        }}
      />
    </Card>
  )
}

export function PaymentScheduleWorkspace({
  scope,
  direction,
  departureId: lockedDepartureId,
  readOnly = false,
  highlightSourceOrderId,
  highlightSegmentResourceId,
  onHighlightConsumed,
}: PaymentScheduleWorkspaceProps) {
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const dialogs = usePaymentScheduleDialogs(isReceivable)

  const effectiveDepartureId = scope === 'departure' ? lockedDepartureId : departureFilter
  const hasClientFilters = Boolean(keyword.trim() || statusFilter || dueDateRange)
  const locatingFinanceRow =
    isDepartureScope &&
    ((isReceivable && Boolean(highlightSourceOrderId)) ||
      (!isReceivable && Boolean(highlightSegmentResourceId)))
  const useExpandedFetch = hasClientFilters || locatingFinanceRow
  const fetchPageSize = useExpandedFetch ? 100 : pageSize

  const { data: schedulesResult, isLoading, isFetching } = useQuery({
    queryKey: [
      isDepartureScope ? departureListQueryKey : listQueryKey,
      effectiveDepartureId,
      page,
      fetchPageSize,
      useExpandedFetch,
    ],
    queryFn: () => {
      if (isDepartureScope) {
        if (!lockedDepartureId) {
          throw new Error('发团 ID 缺失')
        }
        const listFn = isReceivable ? listDepartureReceivables : listDeparturePayables
        return listFn(lockedDepartureId, {
          page: useExpandedFetch ? 1 : page,
          pageSize: fetchPageSize,
        })
      }
      return (isReceivable ? listReceivables : listPayables)({
        departureId: effectiveDepartureId,
        page: hasClientFilters ? 1 : page,
        pageSize: fetchPageSize,
      })
    },
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
  })

  const { locateSourceOrderId, locateSegmentResourceId, locateFlashActive } =
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
      setPage,
      applyClientFilters,
    })

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'finance-schedule-map'],
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
      applyClientFilters(schedulesResult?.items ?? [], keyword, statusFilter, dueDateRange),
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
    setPage(1)
  }, [scope])

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

  return (
    <div>
      <PaymentScheduleFilters
        departureId={effectiveDepartureId}
        statusFilter={statusFilter}
        keyword={keyword}
        dueDateRange={dueDateRange}
        showDepartureFilter={scope === 'global'}
        onDepartureChange={(value) => {
          setDepartureFilter(value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatusFilter(value)
          setPage(1)
        }}
        onKeywordChange={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        onDueDateRangeChange={(value) => {
          setDueDateRange(value)
          setPage(1)
        }}
        onReset={resetFilters}
      />

      <PaymentScheduleTable
        loading={isLoading}
        columns={columns}
        items={tableItems}
        page={page}
        pageSize={pageSize}
        total={tableTotal}
        locateSourceOrderId={locateSourceOrderId}
        locateSegmentResourceId={locateSegmentResourceId}
        locateFlashActive={locateFlashActive}
        locateBg={token.colorPrimaryBg}
        onPageChange={(nextPage, nextPageSize) => {
          setPage(nextPage)
          setPageSize(nextPageSize)
        }}
      />

      <PaymentScheduleActionDialogs
        isReceivable={isReceivable}
        activeSchedule={dialogs.activeSchedule}
        departureMap={departureMap}
        lockedDepartureId={isDepartureScope ? lockedDepartureId : undefined}
        confirmOpen={dialogs.confirmOpen}
        verifyOpen={dialogs.verifyOpen}
        cancelOpen={dialogs.cancelOpen}
        reopenOpen={dialogs.reopenOpen}
        adjustOpen={dialogs.adjustOpen}
        editOpen={dialogs.editOpen}
        confirmForm={dialogs.confirmForm}
        verifyForm={dialogs.verifyForm}
        cancelForm={dialogs.cancelForm}
        reopenForm={dialogs.reopenForm}
        adjustForm={dialogs.adjustForm}
        editForm={dialogs.editForm}
        confirmMutation={confirmMutation}
        verifyCreateMutation={verifyCreateMutation}
        cancelMutation={cancelMutation}
        reopenMutation={reopenMutation}
        adjustMutation={adjustMutation}
        editMutation={editMutation}
        onCloseConfirm={dialogs.closeConfirm}
        onCloseVerify={dialogs.closeVerify}
        onCloseCancel={dialogs.closeCancel}
        onCloseReopen={dialogs.closeReopen}
        onCloseAdjust={dialogs.closeAdjust}
        onCloseEdit={dialogs.closeEdit}
      />

      <PaymentScheduleDetailDrawer
        open={dialogs.detailOpen}
        scheduleId={dialogs.detailScheduleId}
        isReceivable={isReceivable}
        onClose={dialogs.closeDetail}
      />
    </div>
  )
}
