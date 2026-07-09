import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, Form, Table, theme } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PaymentScheduleStatus, type PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { listDepartures, getDeparture } from '@/services/departure.service'
import { matchesSegmentResourceSchedule } from '@/features/departure/utils/matches-segment-resource-schedule'
import { matchesSourceOrderSchedule } from '@/features/departure/utils/matches-source-order-schedule'
import {
  listDeparturePayables,
  listDepartureReceivables,
  listPayables,
  listReceivables,
} from '@/services/finance.service'
import { PaymentScheduleFilters, type DueDateRange } from './PaymentScheduleFilters'
import { PaymentScheduleActionDialogs } from './PaymentScheduleActionDialogs'
import { buildPaymentScheduleColumns } from './payment-schedule-table-columns'
import { usePaymentScheduleMutations } from '../hooks/usePaymentScheduleMutations'
import {
  scheduleToConfirmCollectionValues,
  type ConfirmCollectionFormValues,
} from '../utils/confirm-collection-form'
import {
  scheduleToConfirmPaymentValues,
  type ConfirmPaymentFormValues,
} from '../utils/confirm-payment-form'
import {
  scheduleToEditValues,
  type EditScheduleFormValues,
} from '../utils/edit-schedule-form'
import type { CreateVerificationFormValues } from '../utils/verification-form'
import type { CancelScheduleFormValues } from './CancelScheduleModal'
import styles from './PaymentScheduleWorkspace.module.css'

/** Two gentle (0.85s) animation iterations. */
const LOCATE_FLASH_MS = 1700

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

function matchesLocateTarget(
  schedule: PaymentScheduleSummary,
  locateSourceOrderId?: string,
  locateSegmentResourceId?: string,
): boolean {
  if (locateSourceOrderId) {
    return matchesSourceOrderSchedule(schedule, locateSourceOrderId)
  }
  if (locateSegmentResourceId) {
    return matchesSegmentResourceSchedule(schedule, locateSegmentResourceId)
  }
  return false
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

  const [confirmForm] = Form.useForm<ConfirmCollectionFormValues | ConfirmPaymentFormValues>()
  const [verifyForm] = Form.useForm<CreateVerificationFormValues>()
  const [cancelForm] = Form.useForm<CancelScheduleFormValues>()
  const [editForm] = Form.useForm<EditScheduleFormValues>()

  const [activeSchedule, setActiveSchedule] = useState<PaymentScheduleSummary | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [locateFlashActive, setLocateFlashActive] = useState(false)
  const [locateSourceOrderId, setLocateSourceOrderId] = useState<string | undefined>()
  const [locateSegmentResourceId, setLocateSegmentResourceId] = useState<string | undefined>()
  const locateFlashStartedForRef = useRef<string | null>(null)

  const effectiveDepartureId = scope === 'departure' ? lockedDepartureId : departureFilter
  const hasClientFilters = Boolean(keyword.trim() || statusFilter || dueDateRange)
  const locatingFinanceRow =
    isDepartureScope &&
    ((isReceivable && Boolean(locateSourceOrderId)) ||
      (!isReceivable && Boolean(locateSegmentResourceId)))
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

  useEffect(() => {
    const highlightId = isReceivable ? highlightSourceOrderId : highlightSegmentResourceId
    if (!highlightId) {
      return
    }
    if (locateFlashStartedForRef.current === highlightId) {
      return
    }
    locateFlashStartedForRef.current = highlightId
    if (isReceivable) {
      setLocateSourceOrderId(highlightId)
    } else {
      setLocateSegmentResourceId(highlightId)
    }
  }, [highlightSegmentResourceId, highlightSourceOrderId, isReceivable])

  useEffect(() => {
    const locateId = locateSourceOrderId ?? locateSegmentResourceId
    if (
      !locateId ||
      isLoading ||
      isFetching ||
      !schedulesResult ||
      locateFlashActive
    ) {
      return
    }

    const items = applyClientFilters(
      schedulesResult.items,
      keyword,
      statusFilter,
      dueDateRange,
    )
    const firstMatchIndex = items.findIndex((item) =>
      matchesLocateTarget(item, locateSourceOrderId, locateSegmentResourceId),
    )
    if (firstMatchIndex >= 0) {
      setPage(Math.floor(firstMatchIndex / pageSize) + 1)
    }
    setLocateFlashActive(true)
  }, [
    dueDateRange,
    isFetching,
    isLoading,
    keyword,
    locateFlashActive,
    locateSegmentResourceId,
    locateSourceOrderId,
    pageSize,
    schedulesResult,
    statusFilter,
  ])

  useEffect(() => {
    if (!locateFlashActive) {
      return
    }

    const clearFlashTimer = window.setTimeout(() => {
      setLocateFlashActive(false)
      setLocateSourceOrderId(undefined)
      setLocateSegmentResourceId(undefined)
      locateFlashStartedForRef.current = null
      setPage(1)
      onHighlightConsumed?.()
    }, LOCATE_FLASH_MS)

    return () => {
      window.clearTimeout(clearFlashTimer)
    }
  }, [locateFlashActive, onHighlightConsumed])

  const { data: departuresResult } = useQuery({
    queryKey: ['departures', 'finance-schedule-map'],
    queryFn: () => listDepartures({ pageSize: 100 }),
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
    for (const departure of departuresResult?.items ?? []) {
      map.set(departure.id, { departureNo: departure.departureNo, name: departure.name })
    }
    if (lockedDeparture) {
      map.set(lockedDeparture.id, {
        departureNo: lockedDeparture.departureNo,
        name: lockedDeparture.name,
      })
    }
    return map
  }, [departuresResult?.items, lockedDeparture])

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

  const closeConfirm = useCallback(() => {
    confirmForm.resetFields()
    setConfirmOpen(false)
    setActiveSchedule(null)
  }, [confirmForm])

  const closeVerify = useCallback(() => {
    verifyForm.resetFields()
    setVerifyOpen(false)
    setActiveSchedule(null)
  }, [verifyForm])

  const closeCancel = useCallback(() => {
    cancelForm.resetFields()
    setCancelOpen(false)
    setActiveSchedule(null)
  }, [cancelForm])

  const closeEdit = useCallback(() => {
    editForm.resetFields()
    setEditOpen(false)
    setActiveSchedule(null)
  }, [editForm])

  const { confirmMutation, verifyCreateMutation, cancelMutation, editMutation } =
    usePaymentScheduleMutations({
      queryClient,
      isReceivable,
      listQueryKey,
      departureListQueryKey,
      activeSchedule,
      confirmForm,
      verifyForm,
      cancelForm,
      editForm,
      onConfirmSuccess: closeConfirm,
      onVerifySuccess: closeVerify,
      onCancelSuccess: closeCancel,
      onEditSuccess: closeEdit,
    })

  const openConfirm = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(schedule)
      confirmForm.resetFields()
      if (isReceivable) {
        confirmForm.setFieldsValue(scheduleToConfirmCollectionValues(schedule))
      } else {
        confirmForm.setFieldsValue(scheduleToConfirmPaymentValues(schedule))
      }
      setConfirmOpen(true)
    },
    [confirmForm, isReceivable],
  )

  const openVerify = useCallback((schedule: PaymentScheduleSummary) => {
    setActiveSchedule(schedule)
    setVerifyOpen(true)
  }, [])

  const openCancel = useCallback((schedule: PaymentScheduleSummary) => {
    setActiveSchedule(schedule)
    cancelForm.resetFields()
    setCancelOpen(true)
  }, [cancelForm])

  const openEdit = useCallback(
    (schedule: PaymentScheduleSummary) => {
      setActiveSchedule(schedule)
      editForm.resetFields()
      editForm.setFieldsValue(scheduleToEditValues(schedule))
      setEditOpen(true)
    },
    [editForm],
  )

  const openViewVerifications = useCallback(
    (schedule: PaymentScheduleSummary) => {
      void navigate({
        to: '/finance/verification',
        search: { paymentScheduleId: schedule.id },
      })
    },
    [navigate],
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
        onConfirm: openConfirm,
        onVerify: openVerify,
        onEdit: openEdit,
        onCancel: openCancel,
        onViewVerifications: openViewVerifications,
      }),
    [
      departureMap,
      isDepartureScope,
      isReceivable,
      openCancel,
      openConfirm,
      openEdit,
      openVerify,
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
        activeSchedule={activeSchedule}
        departureMap={departureMap}
        lockedDepartureId={isDepartureScope ? lockedDepartureId : undefined}
        confirmOpen={confirmOpen}
        verifyOpen={verifyOpen}
        cancelOpen={cancelOpen}
        editOpen={editOpen}
        confirmForm={confirmForm}
        verifyForm={verifyForm}
        cancelForm={cancelForm}
        editForm={editForm}
        confirmMutation={confirmMutation}
        verifyCreateMutation={verifyCreateMutation}
        cancelMutation={cancelMutation}
        editMutation={editMutation}
        onCloseConfirm={closeConfirm}
        onCloseVerify={closeVerify}
        onCloseCancel={closeCancel}
        onCloseEdit={closeEdit}
      />
    </div>
  )
}
